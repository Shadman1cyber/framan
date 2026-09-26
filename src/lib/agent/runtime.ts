import { createHash, randomBytes, randomUUID } from "crypto";
import type { AgentRun, Prisma, PrismaClient } from "@prisma/client";
import { normalizeRole, roleHas, type Permission } from "@/lib/constants";
import { setAiEnabled } from "@/lib/ai/settings";
import { searchCatalog } from "./graph/retrieval";
import { syncGraph } from "./graph/sync";
import { transitionOrderAtomic } from "@/lib/business/orders-write";
import { updatePrice } from "@/lib/business/pricing";
import { adjustInventory } from "@/lib/business/inventory";
import { suggestStaffPerHour } from "@/lib/operations";
import { OrderError } from "@/lib/orders";
import { completedSalesSummary, summaryToFaText, completedProfitSummary, profitToFaText } from "@/lib/reporting";
import { generateSalesArtifact } from "@/lib/files/report-artifact";
import type { PlannerMessage, PlannerAttachment } from "./planner";
import { loadAttachmentContext, analyzeArtifact } from "./attachments";
import { responseText } from "./responses";
export { responseText } from "./responses";
import {
  AgentError, planSchema, lessonProposalSchema, proposalSchema, requestSchema, skillDefinitionSchema,
  SUBAGENT_LIMITS, SUBAGENT_ROLES, TOOL_CONTRACTS, WRITE_TOOLS,
  type Plan, type Proposal, type SuccessCriterion,
} from "./contracts";

type DB = Prisma.TransactionClient;
type Planner = (question: string, lessons: string[], history?: PlannerMessage[], attachments?: PlannerAttachment[], sessionKey?: string, allowDatabaseInsights?: boolean) => Promise<Plan>;
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const PROMPT_VERSION = "workspace-1.0.0";
const terminal = new Set(["succeeded", "failed", "cancelled"]);
const TRANSIENT_ATTEMPTS = 3;
const LEASE_MS = 60_000;
const enabled = () => process.env.AGENT_ENABLED === "true";
const writes = () => enabled() && process.env.AGENT_WRITES_ENABLED === "true";
/** Phase 7 gradual release. Shadow mode exercises the whole loop but blocks
 *  writes with an explicit observable code; canary restricts the agent surface
 *  to listed user IDs. Both are server-side env flags, never client-controlled. */
const shadow = () => process.env.AGENT_SHADOW_MODE === "true";
const canary = (userId: string) => {
  const list = process.env.AGENT_CANARY_USERS?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
  return list.length === 0 || list.includes(userId);
};
/** Transient infrastructure failures are safe to retry: the failed transaction rolled back, so no effect can duplicate. */
const transient = (e: unknown) => {
  if (e instanceof AgentError) return false;
  const code = (e as { code?: string } | null)?.code;
  const message = e instanceof Error ? e.message : String(e);
  return code === "P2024" || /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(message);
};

async function identity(db: DB, userId: string, permission: Permission = "ai.use") {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || !roleHas(normalizeRole(user.role), "ai.use") || !roleHas(user.role, permission)) throw new AgentError("FORBIDDEN", 403);
  if (!canary(userId)) throw new AgentError("CANARY_NOT_ENROLLED", 403);
  const scope = process.env.AGENT_CAFE_ID;
  const cafes = await db.cafe.findMany({ select: { id: true }, take: 2 });
  if (!scope || cafes.length !== 1 || cafes[0].id !== scope) throw new AgentError("SINGLE_CAFE_SCOPE_REQUIRED", 403);
  return scope;
}
async function event(db: DB, run: AgentRun, name: string, state?: string, extra?: { durationMs?: number; promptTokens?: number; completionTokens?: number }) {
  await db.agentEvent.create({ data: { id: randomUUID(), runId: run.id, name, state: state ?? run.state, ...(extra?.durationMs != null ? { durationMs: Math.round(extra.durationMs) } : {}), ...(extra?.promptTokens != null ? { promptTokens: extra.promptTokens } : {}), ...(extra?.completionTokens != null ? { completionTokens: extra.completionTokens } : {}) } });
}
/** Episodic memory: a durable fact about a real run outcome, never model-invented. */
async function episode(db: DB, run: AgentRun, extra?: { errorCode?: string | null; note?: string }) {
  const data = { state: run.state, ...(extra?.errorCode !== undefined ? { errorCode: extra.errorCode } : {}), ...(extra?.note !== undefined ? { note: extra.note } : {}) };
  await db.agentEpisode.upsert({
    where: { scopeId_runId: { scopeId: run.scopeId, runId: run.id } },
    create: { id: randomUUID(), scopeId: run.scopeId, runId: run.id, userId: run.userId, tool: run.tool, ...data },
    update: data,
  });
}
async function setting(db: DB) {
  const row = await db.setting.findUnique({ where: { key: "ai.enabled" } });
  return { enabled: row ? row.value === "true" : process.env.AI_ENABLED === "true", version: row ? `${row.updatedAt.toISOString()}:${row.value}` : `absent:${process.env.AI_ENABLED === "true"}` };
}
async function scoped(db: DB, userId: string, id: string) {
  const scopeId = await identity(db, userId);
  const run = await db.agentRun.findFirst({ where: { id, scopeId, userId } });
  if (!run) throw new AgentError("NOT_FOUND", 404);
  return run;
}
/** R08: active, valid lessons retrieved into task context (advisory only). */
async function activeLessonStatements(db: DB, scopeId: string): Promise<string[]> {
  const now = new Date();
  const rows = await db.agentLesson.findMany({
    where: { scopeId, status: "active", validFrom: { lte: now }, AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }] },
    orderBy: { updatedAt: "desc" }, take: 5,
  });
  return rows.map(r => `${r.topic}: ${r.statement}`);
}

/* ── Generalized write snapshots (R05): an approval card binds the exact
 *    target, its observed version and before/after values. The model never
 *    supplies any of these; they are read live from the source. ─────────── */
export type WriteSnapshot = { version: string; previous: string; summary: Record<string, unknown> };
async function writeSnapshot(db: DB, tool: string, input: Record<string, unknown>): Promise<WriteSnapshot | null> {
  if (!WRITE_TOOLS.has(tool)) return null;
  if (tool === "set_ai_enabled") {
    const s = await setting(db);
    return { version: s.version, previous: JSON.stringify({ enabled: s.enabled }), summary: { target: "Setting:ai.enabled", targetLabel: "فعال بودن دستیار", before: { enabled: s.enabled }, after: { enabled: input.enabled } } };
  }
  if (tool === "change_order_status") {
    const order = await db.order.findUnique({ where: { id: String(input.orderId) }, select: { id: true, status: true, orderType: true, total: true, updatedAt: true } });
    if (!order) throw new AgentError("TARGET_NOT_FOUND", 404);
    return { version: `${order.updatedAt.toISOString()}:${order.status}`, previous: JSON.stringify({ status: order.status }), summary: { target: `Order:${order.id}`, targetLabel: `سفارش ${order.id.slice(0, 8)} (${order.orderType === "TABLE" ? "میز" : "بیرون‌بر"})`, before: { status: order.status }, after: { status: input.status }, total: order.total, currency: "TOMAN" } };
  }
  if (tool === "update_price") {
    if (input.coffeeLineId) {
      const row = await db.productCoffeeLine.findUnique({
        where: { productId_coffeeLineId: { productId: String(input.productId), coffeeLineId: String(input.coffeeLineId) } },
        include: { product: { select: { nameFa: true } }, coffeeLine: { select: { nameFa: true } } },
      });
      if (!row) throw new AgentError("TARGET_NOT_FOUND", 404);
      return { version: `${row.id}:${row.price}`, previous: JSON.stringify({ price: row.price }), summary: { target: `ProductCoffeeLine:${row.id}`, targetLabel: `${row.product.nameFa} — خط ${row.coffeeLine.nameFa}`, before: { price: row.price }, after: { price: input.price }, currency: "TOMAN" } };
    }
    const product = await db.product.findUnique({ where: { id: String(input.productId) }, select: { id: true, nameFa: true, price: true, updatedAt: true } });
    if (!product) throw new AgentError("TARGET_NOT_FOUND", 404);
    return { version: `${product.updatedAt.toISOString()}:${product.price}`, previous: JSON.stringify({ price: product.price }), summary: { target: `Product:${product.id}`, targetLabel: product.nameFa, before: { price: product.price }, after: { price: input.price }, currency: "TOMAN" } };
  }
  // adjust_inventory
  const ing = await db.ingredient.findUnique({ where: { id: String(input.ingredientId) } });
  if (!ing) throw new AgentError("TARGET_NOT_FOUND", 404);
  const after = ing.stockQuantity + Number(input.delta);
  return { version: `${ing.updatedAt.toISOString()}:${ing.stockQuantity}`, previous: JSON.stringify({ quantity: ing.stockQuantity, unit: ing.unit }), summary: { target: `Ingredient:${ing.id}`, targetLabel: ing.nameFa, before: { quantity: ing.stockQuantity, unit: ing.unit }, after: { quantity: after, unit: ing.unit }, delta: input.delta, reason: input.reason } };
}

export class AgentRuntime {
  constructor(private db: PrismaClient, private planner?: Planner) {}

  /** Phase 7 control-panel status: authoritative server state for the UI banner. */
  async status(userId: string) {
    await identity(this.db, userId, "ai.use");
    return {
      enabled: enabled(), writes: writes(), shadow: shadow(),
      canaryActive: Boolean(process.env.AGENT_CANARY_USERS?.trim()),
      approvalQueue: await this.db.agentRun.count({ where: { state: "waiting_approval" } }),
      running: await this.db.agentRun.count({ where: { state: "running" } }),
      promptVersion: PROMPT_VERSION,
      telemetryConfigured: Boolean(process.env.OPENOBSERVE_TRACES_URL && process.env.OPENOBSERVE_AUTHORIZATION),
    };
  }

  async list(userId: string, opts?: { sessionId?: string }) {
    const scopeId = await identity(this.db, userId);
    return this.db.agentRun.findMany({
      where: { scopeId, userId, ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}) },
      orderBy: { createdAt: "desc" }, take: 30,
    });
  }

  async get(userId: string, id: string) {
    const run = await scoped(this.db, userId, id);
    const events = await this.db.agentEvent.findMany({ where: { runId: id }, orderBy: { createdAt: "asc" }, take: 100 });
    const children = await this.db.agentRun.findMany({ where: { parentRunId: id }, orderBy: { createdAt: "asc" }, take: 10 });
    const steps = await this.db.agentStep.findMany({ where: { runId: id }, orderBy: { idx: "asc" } });
    return {
      ...run, events,
      steps: steps.map(s => ({ id: s.id, idx: s.idx, tool: s.tool, state: s.state, input: s.input, result: s.result ? JSON.parse(s.result) : null, error: s.error })),
      children: children.map(c => ({ id: c.id, tool: c.tool, state: c.state, result: c.result ? JSON.parse(c.result) : null, lastError: c.lastError })),
    };
  }

  /** Durable SSE feed (R03): user-scoped events after a cursor, bounded. */
  async events(userId: string, cursor?: { createdAt: Date; id: string }) {
    const scopeId = await identity(this.db, userId);
    const runs = await this.db.agentRun.findMany({ where: { scopeId, userId }, select: { id: true }, take: 200, orderBy: { createdAt: "desc" } });
    if (!runs.length) return [];
    const events = await this.db.agentEvent.findMany({
      where: { runId: { in: runs.map(r => r.id) }, ...(cursor ? { createdAt: { gte: cursor.createdAt } } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200,
    });
    return events
      .filter(e => !cursor || e.createdAt.getTime() > cursor.createdAt.getTime() || (e.createdAt.getTime() === cursor.createdAt.getTime() && (!cursor.id || e.id > cursor.id)))
      .map(e => ({ id: e.id, runId: e.runId, name: e.name, state: e.state, createdAt: e.createdAt.toISOString() }));
  }

  /** Conversation linkage (R02): legacy ownerless chats are read-only archives. */
  private async sessionForWrite(db: DB, userId: string, sessionId?: string) {
    if (!sessionId) return null;
    const session = await db.aIChatSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AgentError("NOT_FOUND", 404);
    if (session.ownerId === null) throw new AgentError("LEGACY_SESSION_READ_ONLY", 403);
    if (session.ownerId !== userId) throw new AgentError("NOT_FOUND", 404);
    if (session.archived) throw new AgentError("SESSION_ARCHIVED", 409);
    return session;
  }

  async create(userId: string, raw: unknown) {
    if (!enabled()) throw new AgentError("AGENT_DISABLED", 503);
    const request = requestSchema.parse(raw);
    const scopeId = await identity(this.db, userId);
    const requestHash = hash(JSON.stringify({ question: request.question, proposal: request.proposal, sessionId: request.sessionId, attachmentIds: request.attachmentIds }));
    const existing = await this.db.agentRun.findUnique({ where: { scopeId_userId_key: { scopeId, userId, key: request.key } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AgentError("IDEMPOTENCY_CONFLICT");
      return existing;
    }
    await this.sessionForWrite(this.db, userId, request.sessionId);
    const newSessionId = request.question && !request.sessionId ? randomUUID() : null;
    const plannerSessionKey = hash(`${scopeId}:${userId}:${request.sessionId ?? newSessionId ?? request.key}`);
    const allowDatabaseInsights = await identity(this.db, userId, "finance.view").then(() => true).catch(() => false);
    // Model/network work happens OUTSIDE any database transaction (R04).
    let plan: Plan;
    let attachments: PlannerAttachment[] = [];
    if (request.question) {
      if (!this.planner) throw new AgentError("PLANNER_UNAVAILABLE", 503);
      const lessons = await activeLessonStatements(this.db, scopeId);
      const recent = request.sessionId ? await this.db.aIChatMessage.findMany({
        where: { sessionId: request.sessionId, role: { in: ["user", "assistant"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 8,
      }) : [];
      const history = recent.reverse().map(m => ({ role: m.role as PlannerMessage["role"], content: m.content }));
      // R06: uploaded attachments' contents reach the planner as bounded,
      // clearly-labelled data. Ownership/scope checked; unknown ids rejected.
      attachments = await loadAttachmentContext(this.db, scopeId, userId, request.attachmentIds ?? []);
      plan = planSchema.parse(await this.planner(request.question, lessons, history, attachments, plannerSessionKey, allowDatabaseInsights));
    } else {
      plan = { steps: [proposalSchema.parse(request.proposal!)] };
    }
    return this.db.$transaction(async db => {
      for (const step of plan.steps) await identity(db, userId, TOOL_CONTRACTS[step.tool].permission);
      // Recheck after model/network work; the same key can race across requests.
      const duplicate = await db.agentRun.findUnique({ where: { scopeId_userId_key: { scopeId, userId, key: request.key } } });
      if (duplicate) {
        if (duplicate.requestHash !== requestHash) throw new AgentError("IDEMPOTENCY_CONFLICT");
        return duplicate;
      }
      await this.sessionForWrite(db, userId, request.sessionId);
      // First messages need a durable conversation too; otherwise the UI has
      // no session to reload when the worker finishes.
      const sessionId = request.sessionId ?? (request.question ? (await db.aIChatSession.create({
        data: { id: newSessionId!, ownerId: userId, userId, title: request.question.replace(/\s+/g, " ").slice(0, 60) },
      })).id : null);
      const firstWrite = plan.steps.find(p => WRITE_TOOLS.has(p.tool));
      const snapshot = firstWrite ? await writeSnapshot(db, firstWrite.tool, firstWrite.input as Record<string, unknown>) : null;
      const bindTool = firstWrite?.tool ?? plan.steps[0].tool;
      const bindInput = JSON.stringify(firstWrite?.input ?? plan.steps[0].input);
      const run = await db.agentRun.create({ data: {
        id: randomUUID(), scopeId, userId, key: request.key, requestHash,
        traceId: randomBytes(16).toString("hex"), tool: plan.steps[0].tool, input: JSON.stringify(plan.steps[0].input),
        inputHash: hash(JSON.stringify({ scopeId, userId, tool: bindTool, input: bindInput, version: snapshot?.version ?? null })),
        version: snapshot?.version, previous: snapshot?.previous ?? null,
        state: snapshot ? "waiting_approval" : "queued",
        expiresAt: snapshot ? new Date(Date.now() + 600000) : null,
        sessionId,
        planKind: plan.steps.length > 1 ? "plan" : "single",
        modelId: process.env.AI_MODEL ?? null,
        promptVersion: PROMPT_VERSION,
      } });
      for (const [idx, step] of plan.steps.entries()) {
        await db.agentStep.create({ data: { id: randomUUID(), runId: run.id, scopeId, idx, tool: step.tool, input: JSON.stringify(step.input) } });
      }
      if (request.attachmentIds?.length) {
        await db.agentArtifact.updateMany({ where: { id: { in: request.attachmentIds }, scopeId, createdBy: userId }, data: { runId: run.id, sessionId } });
      }
      // Conversation continuity (R02): the user's message is persisted with
      // the conversation; the verified answer is persisted at completion.
      if (sessionId) {
        const attachmentNames = attachments.length ? `\n[پیوست: ${attachments.map(a => a.filename).join("، ")}]` : "";
        await db.aIChatMessage.create({ data: { sessionId, role: "user", content: `${request.question ?? `[ابزار] ${plan.steps[0].tool}`}${attachmentNames}`.slice(0, 1200) } });
        await db.aIChatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
      }
      await event(db, run, "run.created");
      return run;
    });
  }

  async control(userId: string, id: string, action: string, inputHash?: string, note?: string, subtask?: { task: string; role: keyof typeof SUBAGENT_ROLES; proposal: Proposal }) {
    if (action === "execute") return this.execute(userId, id);
    return this.db.$transaction(async db => {
      let run = await scoped(db, userId, id);
      if (action !== "correct" && terminal.has(run.state)) throw new AgentError("TERMINAL_RUN");
      let state: string;
      const data: Prisma.AgentRunUpdateInput = {};
      switch (action) {
        case "approve":
          await identity(db, userId, "ai.configure");
          if (!writes()) throw new AgentError("WRITES_DISABLED", 503);
          if (run.state !== "waiting_approval" || inputHash !== run.inputHash) throw new AgentError("APPROVAL_MISMATCH");
          if (!run.expiresAt || run.expiresAt.getTime() <= Date.now()) throw new AgentError("APPROVAL_EXPIRED");
          // Revalidate the pending write's source version right now (R05).
          await this.assertPendingWriteFresh(db, run);
          data.approvedBy = userId; data.approvedHash = run.inputHash; state = "queued"; break;
        case "reject":
          if (run.state !== "waiting_approval") throw new AgentError("INVALID_STATE");
          state = "cancelled"; break;
        case "correct": {
          // Corrections are valid for any run not mid-flight, including
          // policy-blocked ones (they stay retryable but the episode fact stands).
          if (run.state === "running") throw new AgentError("INVALID_STATE");
          if (!note || note.length < 2 || note.length > 500) throw new AgentError("INVALID_NOTE", 400);
          await episode(db, run, { note });
          return run;
        }
        case "cancel": {
          state = "cancelled";
          break;
        }
        case "spawn": {
          if (!subtask) throw new AgentError("SPAWN_REQUIRES_SUBTASK", 400);
          if (run.parentRunId) throw new AgentError("SUBAGENT_DEPTH_EXCEEDED"); // depth 1: children never spawn
          if (terminal.has(run.state) || run.state === "running") throw new AgentError("INVALID_STATE");
          const roleTools = SUBAGENT_ROLES[subtask.role];
          if (!roleTools.includes(subtask.proposal.tool as never)) throw new AgentError("SUBAGENT_TOOL_FORBIDDEN", 403);
          if (TOOL_CONTRACTS[subtask.proposal.tool].risk !== "read") throw new AgentError("SUBAGENT_WRITE_FORBIDDEN", 403);
          await identity(db, userId, TOOL_CONTRACTS[subtask.proposal.tool].permission);
          // Budget is deducted from the parent: total bounded by toolCallBudget,
          // concurrency bounded by maxConcurrentChildren (defaults from the plan).
          const total = await db.agentRun.count({ where: { parentRunId: id } });
          if (total >= run.toolCallBudget) throw new AgentError("SUBAGENT_BUDGET_EXCEEDED", 403);
          const concurrent = await db.agentRun.count({ where: { parentRunId: id, state: { notIn: [...terminal] } } });
          if (concurrent >= SUBAGENT_LIMITS.maxConcurrentChildren) throw new AgentError("SUBAGENT_CONCURRENCY_EXCEEDED", 403);
          const input = JSON.stringify(subtask.proposal.input);
          const child = await db.agentRun.create({ data: {
            id: randomUUID(), scopeId: run.scopeId, userId, key: `sub-${randomUUID()}`, requestHash: hash(JSON.stringify(subtask)),
            traceId: randomBytes(16).toString("hex"), tool: subtask.proposal.tool, input,
            inputHash: hash(JSON.stringify({ tool: subtask.proposal.tool, input })), state: "queued",
            parentRunId: run.id, toolCallBudget: run.toolCallBudget - total,
          } });
          await db.agentStep.create({ data: { id: randomUUID(), runId: child.id, scopeId: run.scopeId, idx: 0, tool: subtask.proposal.tool, input } });
          await event(db, child, "run.created");
          await event(db, run, "run.spawned");
          return child;
        }
        case "pause":
          if (run.state !== "queued") throw new AgentError("INVALID_STATE");
          state = "paused"; break;
        case "resume":
          if (!enabled()) throw new AgentError("AGENT_DISABLED", 503);
          if (run.state !== "paused") throw new AgentError("INVALID_STATE");
          state = "queued"; break;
        default: throw new AgentError("INVALID_ACTION", 400);
      }
      run = await db.agentRun.update({ where: { id }, data: { ...data, state } });
      await event(db, run, `control.${action}`);
      // Cascade: cancelling a supervisor cancels its non-terminal children
      // (depth 1); a child already executing finishes its atomic transaction
      // and reconciles through its durable receipt.
      if (action === "cancel") {
        const children = await db.agentRun.findMany({ where: { parentRunId: id, state: { notIn: [...terminal] } } });
        for (const child of children) {
          const updated = await db.agentRun.update({ where: { id: child.id }, data: { state: "cancelled" } });
          await event(db, updated, "control.cancel");
          await episode(db, updated);
        }
      }
      return run;
    });
  }

  /** The approval must still match the live pending write step (hash + version). */
  private async assertPendingWriteFresh(db: DB, run: AgentRun) {
    const pending = await db.agentStep.findFirst({
      where: { runId: run.id, state: { notIn: ["succeeded", "failed", "cancelled", "skipped"] } },
      orderBy: { idx: "asc" },
    });
    if (!pending || !WRITE_TOOLS.has(pending.tool)) return;
    const snapshot = await writeSnapshot(db, pending.tool, JSON.parse(pending.input));
    const expected = this.writeInputHash(run.scopeId, run.userId, pending.tool, pending.input, snapshot?.version ?? null);
    if (expected !== run.inputHash || !snapshot || snapshot.version !== run.version) throw new AgentError("STALE_SOURCE");
  }

  private writeInputHash(scopeId: string, userId: string, tool: string, input: string, version: string | null) {
    return hash(JSON.stringify({ scopeId, userId, tool, input, version }));
  }

  /* ── Lessons (Phase 4): unchanged semantics ─────────────────────────── */

  async proposeLesson(userId: string, raw: unknown) {
    const scopeId = await identity(this.db, userId, "ai.use");
    const input = lessonProposalSchema.parse(raw);
    return this.db.$transaction(async db => {
      const runs = await db.agentRun.findMany({ where: { id: { in: input.evidence }, scopeId, userId }, select: { id: true, state: true, lastError: true } });
      if (runs.length !== input.evidence.length) throw new AgentError("EVIDENCE_NOT_FOUND");
      if (!runs.every(r => terminal.has(r.state) || r.lastError !== null)) throw new AgentError("EVIDENCE_NOT_TERMINAL");
      return db.agentLesson.create({
        data: { id: randomUUID(), scopeId, topic: input.topic, statement: input.statement, status: "draft", evidence: JSON.stringify(input.evidence), proposedBy: userId, validFrom: new Date() },
      });
    });
  }

  async controlLesson(userId: string, id: string, action: string) {
    return this.db.$transaction(async db => {
      await identity(db, userId, "ai.configure");
      const lesson = await db.agentLesson.findFirst({ where: { id, scopeId: process.env.AGENT_CAFE_ID } });
      if (!lesson) throw new AgentError("NOT_FOUND", 404);
      const now = new Date();
      if (action === "activate") {
        if (lesson.status !== "draft") throw new AgentError("INVALID_STATE");
        await db.agentLesson.updateMany({ where: { scopeId: lesson.scopeId, topic: lesson.topic, status: "active" }, data: { status: "superseded", validTo: now, reviewedBy: userId } });
        return db.agentLesson.update({ where: { id }, data: { status: "active", reviewedBy: userId, validFrom: now, validTo: null } });
      }
      if (action === "reject") {
        if (lesson.status !== "draft") throw new AgentError("INVALID_STATE");
        return db.agentLesson.update({ where: { id }, data: { status: "rejected", reviewedBy: userId } });
      }
      if (lesson.status !== "active" || (lesson.validTo && lesson.validTo.getTime() <= now.getTime())) throw new AgentError("INVALID_STATE");
      return db.agentLesson.update({ where: { id }, data: { validTo: now, reviewedBy: userId } });
    });
  }

  async listLessons(userId: string, opts?: { includeDrafts?: boolean; topic?: string }) {
    const scopeId = await identity(this.db, userId, "ai.use");
    const now = new Date();
    const rows = await this.db.agentLesson.findMany({
      where: {
        scopeId,
        ...(opts?.includeDrafts
          ? { status: { in: ["draft", "active"] } }
          : { status: "active", validFrom: { lte: now }, AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }] }),
        ...(opts?.topic ? { topic: opts.topic } : {}),
      },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    const evidenceRunIds = [...new Set(rows.flatMap(r => JSON.parse(r.evidence) as string[]))];
    const runs = await this.db.agentRun.findMany({ where: { id: { in: evidenceRunIds }, scopeId }, select: { id: true, tool: true, state: true, lastError: true } });
    const byId = new Map(runs.map(r => [r.id, r]));
    return rows.map(r => ({
      id: r.id, topic: r.topic, statement: r.statement, status: r.status, proposedBy: r.proposedBy, reviewedBy: r.reviewedBy,
      validFrom: r.validFrom.toISOString(), validTo: r.validTo?.toISOString() ?? null,
      evidence: (JSON.parse(r.evidence) as string[]).map(rid => byId.get(rid)).filter((e): e is NonNullable<typeof e> => Boolean(e)),
    }));
  }

  /* ── Skills (Phase 5 + R08): structured criteria, execution in the loop ── */

  async createSkillDraft(userId: string, raw: unknown) {
    const scopeId = await identity(this.db, userId, "ai.use");
    const { sourceEpisodes: requested, ...rest } = (raw ?? {}) as { sourceEpisodes?: unknown };
    const definition = skillDefinitionSchema.parse(rest);
    const ids = Array.isArray(requested) && requested.every(s => typeof s === "string") ? (requested as string[]) : [];
    return this.db.$transaction(async db => {
      const episodes = await db.agentEpisode.findMany({ where: { scopeId, id: { in: ids } }, select: { id: true } });
      if (episodes.length !== ids.length) throw new AgentError("EVIDENCE_NOT_FOUND");
      return db.agentSkill.create({
        data: { id: randomUUID(), scopeId, slug: definition.slug, version: definition.version, status: "draft", definition: JSON.stringify(definition), sourceEpisodes: JSON.stringify(ids), createdBy: userId },
      });
    });
  }

  async testSkill(userId: string, id: string) {
    const scopeId = await identity(this.db, userId, "ai.use");
    const skill = await this.db.agentSkill.findFirst({ where: { id, scopeId } });
    if (!skill) throw new AgentError("NOT_FOUND", 404);
    const definition = skillDefinitionSchema.parse(JSON.parse(skill.definition));
    const steps: { tool: string; mocked: boolean; ok: boolean; detail: string; result?: unknown }[] = [];
    for (const step of definition.steps) {
      const proposal = { tool: step.tool, input: step.input } as Proposal;
      if (WRITE_TOOLS.has(proposal.tool) || proposal.tool === "analyze_attachment" || proposal.tool === "generate_sales_artifact") {
        // Sandbox: no side effects (no business write, no real artifact file) —
        // a skill test records the intent instead of acting on live data.
        steps.push({ tool: proposal.tool, mocked: true, ok: true, detail: "sandbox: intent recorded, no effect", result: proposal.input });
        continue;
      }
      try {
        const result = await this.runReadToolDirect(scopeId, userId, proposal);
        steps.push({ tool: proposal.tool, mocked: false, ok: true, detail: "ok", result });
      } catch (e) {
        steps.push({ tool: step.tool, mocked: false, ok: false, detail: e instanceof AgentError ? e.code : "STEP_ERROR" });
      }
    }
    const evaluation = evaluateCriteria(definition.successCriteria, steps);
    const passed = steps.every(s => s.ok) && evaluation.evaluated && evaluation.passed;
    const testResult = JSON.stringify({ passed, evaluated: evaluation.evaluated, criteria: evaluation.results, steps });
    return this.db.agentSkill.update({ where: { id: skill.id }, data: { testResult, testedAt: new Date() } });
  }

  async controlSkill(userId: string, id: string, action: string) {
    return this.db.$transaction(async db => {
      await identity(db, userId, "ai.configure");
      const skill = await db.agentSkill.findFirst({ where: { id, scopeId: process.env.AGENT_CAFE_ID } });
      if (!skill) throw new AgentError("NOT_FOUND", 404);
      if (action === "activate") {
        if (skill.status === "active") throw new AgentError("INVALID_STATE");
        if (!skill.testResult || !JSON.parse(skill.testResult).passed) throw new AgentError("EVALUATION_REQUIRED");
        const test = JSON.parse(skill.testResult) as { evaluated?: boolean };
        // Unevaluable criteria keep the version visibly unverified (R08).
        if (test.evaluated === false) throw new AgentError("CRITERIA_UNEVALUABLE");
        await db.agentSkill.updateMany({ where: { scopeId: skill.scopeId, slug: skill.slug, status: "active" }, data: { status: "retired" } });
        return db.agentSkill.update({ where: { id }, data: { status: "active", activatedBy: userId, activatedAt: new Date() } });
      }
      if (action === "deactivate") {
        if (skill.status !== "active") throw new AgentError("INVALID_STATE");
        return db.agentSkill.update({ where: { id }, data: { status: "retired" } });
      }
      throw new AgentError("INVALID_ACTION", 400);
    });
  }

  /** Rollback = explicit re-activation of an older version via controlSkill(activate). */
  async rollbackSkill(userId: string, slug: string) {
    const scopeId = await identity(this.db, userId, "ai.configure");
    const retired = await this.db.agentSkill.findMany({ where: { scopeId, slug, status: "retired" }, orderBy: { activatedAt: "desc" } });
    const target = retired.find(s => s.testResult && JSON.parse(s.testResult).passed);
    if (!target) throw new AgentError("NO_ROLLBACK_TARGET");
    return this.controlSkill(userId, target.id, "activate");
  }

  async listSkills(userId: string, opts?: { slug?: string }) {
    const scopeId = await identity(this.db, userId, "ai.use");
    const rows = await this.db.agentSkill.findMany({ where: { scopeId, ...(opts?.slug ? { slug: opts.slug } : {}) }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map(r => ({ id: r.id, slug: r.slug, version: r.version, status: r.status, createdBy: r.createdBy, activatedBy: r.activatedBy, activatedAt: r.activatedAt?.toISOString() ?? null, testedAt: r.testedAt?.toISOString() ?? null, definition: JSON.parse(r.definition), sourceEpisodes: JSON.parse(r.sourceEpisodes), testResult: r.testResult ? JSON.parse(r.testResult) : null }));
  }

  /**
   * Connect skills to the task loop (R08): executing an ACTIVE skill version
   * creates a real governed run whose plan is the skill's validated steps.
   * Normal permission/approval/kill-switch checks apply to every step.
   */
  async executeSkill(userId: string, slug: string, key?: string) {
    const scopeId = await identity(this.db, userId, "ai.use");
    const skill = await this.db.agentSkill.findFirst({ where: { scopeId, slug, status: "active" }, orderBy: { activatedAt: "desc" } });
    if (!skill) throw new AgentError("SKILL_NOT_ACTIVE", 404);
    const definition = skillDefinitionSchema.parse(JSON.parse(skill.definition));
    const steps = definition.steps.map(s => ({ tool: s.tool, input: s.input })) as Plan["steps"];
    return this.db.$transaction(async db => {
      for (const step of steps) await identity(db, userId, TOOL_CONTRACTS[step.tool].permission);
      const firstWrite = steps.find(p => WRITE_TOOLS.has(p.tool));
      const snapshot = firstWrite ? await writeSnapshot(db, firstWrite.tool, firstWrite.input as Record<string, unknown>) : null;
      const bindTool = firstWrite?.tool ?? steps[0].tool;
      const bindInput = JSON.stringify(firstWrite?.input ?? steps[0].input);
      const run = await db.agentRun.create({ data: {
        id: randomUUID(), scopeId, userId, key: key ?? `skill-${randomUUID()}`, requestHash: hash(JSON.stringify({ slug, steps })),
        traceId: randomBytes(16).toString("hex"), tool: steps[0].tool, input: JSON.stringify(steps[0].input),
        inputHash: this.writeInputHash(scopeId, userId, bindTool, bindInput, snapshot?.version ?? null),
        version: snapshot?.version, previous: snapshot?.previous ?? null,
        state: snapshot ? "waiting_approval" : "queued",
        expiresAt: snapshot ? new Date(Date.now() + 600000) : null,
        planKind: steps.length > 1 ? "plan" : "single",
        skillVersion: `${slug}@${definition.version}`,
        modelId: process.env.AI_MODEL ?? null, promptVersion: PROMPT_VERSION,
      } });
      for (const [idx, step] of steps.entries()) {
        await db.agentStep.create({ data: { id: randomUUID(), runId: run.id, scopeId, idx, tool: step.tool, input: JSON.stringify(step.input) } });
      }
      await event(db, run, "run.created");
      return run;
    });
  }

  async execute(userId: string, id: string) {
    let attempts = 0;
    let lastError: unknown;
    for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt++) {
      attempts = attempt;
      try { return await this.attempt(userId, id); }
      catch (e) {
        lastError = e;
        if (!transient(e)) break;
        if (attempt < TRANSIENT_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 50 * 2 ** (attempt - 1)));
      }
    }
    const failed = lastError instanceof AgentError && lastError.phase === "execution";
    const code = lastError instanceof AgentError ? lastError.code : "EXECUTION_ERROR";
    await this.record(userId, id, attempts, code, failed).catch(() => undefined);
    throw lastError;
  }

  /** Best-effort durable record of a failed attempt in its own transaction. */
  private async record(userId: string, id: string, attempts: number, code: string, failed: boolean) {
    await this.db.$transaction(async db => {
      const run = await scoped(db, userId, id);
      if (terminal.has(run.state)) return; // lost a race; keep the original outcome
      const updated = await db.agentRun.update({
        where: { id },
        data: { attemptCount: { increment: attempts }, lastError: code, ...(failed ? { state: "failed" } : {}), leaseOwner: null, leaseUntil: null },
      });
      await event(db, updated, failed ? "run.failed" : "run.attempt_failed");
      await episode(db, updated, { errorCode: code });
    }, { timeout: 5000 });
  }

  /**
   * Bounded plan/execute/verify/respond loop (R04), one SQLite transaction per
   * invocation: read steps execute automatically; the first not-yet-approved
   * write step pauses the run at waiting_approval bound to that step's exact
   * input hash + live version. Succeeded steps are never re-executed
   * (idempotent resume after pause/crash). Terminal runs replay their receipt.
   */
  private async attempt(userId: string, id: string) {
    return this.db.$transaction(async db => {
      let run = await scoped(db, userId, id);
      if (terminal.has(run.state)) return run;
      if (!enabled()) throw new AgentError("AGENT_DISABLED", 503);
      if (run.state !== "queued") throw new AgentError("INVALID_STATE");
      const claimed = await db.agentRun.updateMany({
        where: { id, scopeId: run.scopeId, userId: run.userId, state: "queued" },
        data: { state: "running" },
      });
      if (claimed.count !== 1) {
        run = await scoped(db, userId, id);
        if (terminal.has(run.state)) return run;
        throw new AgentError("INVALID_STATE");
      }
      run = await scoped(db, userId, id);
      const steps = await db.agentStep.findMany({ where: { runId: id }, orderBy: { idx: "asc" } });
      if (!steps.length) throw new AgentError("INVALID_STATE");
      const results: { tool: string; state: string; result: unknown }[] = [];
      for (const step of steps) {
        if (step.state === "succeeded") {
          results.push({ tool: step.tool, state: "succeeded", result: JSON.parse(step.result ?? "null") });
          continue;
        }
        const proposal = proposalSchema.parse({ tool: step.tool, input: JSON.parse(step.input) });
        await identity(db, userId, TOOL_CONTRACTS[proposal.tool].permission);
        if (WRITE_TOOLS.has(proposal.tool)) {
          if (shadow()) throw new AgentError("SHADOW_MODE", 403);
          if (!writes()) throw new AgentError("WRITES_DISABLED", 503);
          if (!run.approvedBy || run.approvedHash !== run.inputHash) throw new AgentError("APPROVAL_REQUIRED", 403);
          if (run.inputHash !== this.writeInputHash(run.scopeId, run.userId, step.tool, step.input, run.version)) {
            throw new AgentError("APPROVAL_MISMATCH");
          }
          await identity(db, run.approvedBy, "ai.configure");
          if (!run.expiresAt || run.expiresAt.getTime() <= Date.now()) throw new AgentError("APPROVAL_EXPIRED");
          const current = await writeSnapshot(db, proposal.tool, proposal.input as Record<string, unknown>);
          if (!current || current.version !== run.version) throw new AgentError("STALE_SOURCE");
        }
        await db.agentStep.update({ where: { runId_idx: { runId: id, idx: step.idx } }, data: { state: "running" } });
        const stepStart = Date.now();
        await event(db, { ...run, state: "running" }, "tool.started", steps.length > 1 ? `step:${step.idx}` : run.state);
        let result: object;
        try {
          result = await this.executeTool(db, run, proposal, step.idx);
        } catch (e) {
          await db.agentStep.update({ where: { runId_idx: { runId: id, idx: step.idx } }, data: { state: "failed", error: e instanceof AgentError ? e.code : "STEP_ERROR" } });
          throw e;
        }
        const stepMs = Date.now() - stepStart;
        await db.agentStep.update({ where: { runId_idx: { runId: id, idx: step.idx } }, data: { state: "succeeded", result: JSON.stringify(result) } });
        results.push({ tool: step.tool, state: "succeeded", result });
        await event(db, run, "tool.verified", steps.length > 1 ? `step:${step.idx}` : run.state, { durationMs: stepMs });
        // After a verified write step, later steps of the same plan require a
        // fresh approval bound to their own target; pause here (defensive:
        // create() already pauses plans containing a write up front).
        if (WRITE_TOOLS.has(proposal.tool) && steps.findIndex(s => s.id === step.id) < steps.length - 1) {
          const next = steps[steps.indexOf(step) + 1];
          if (next && WRITE_TOOLS.has(next.tool)) {
            const updated = await db.agentRun.update({ where: { id }, data: { state: "queued" } });
            await event(db, updated, "approval.required", `step:${next.idx}`);
            return updated;
          }
        }
      }
      const final = results[results.length - 1]?.result ?? {};
      const resultJson = steps.length > 1 ? JSON.stringify({ steps: results, final }) : JSON.stringify(final);
      run = await db.agentRun.update({ where: { id }, data: { state: "succeeded", result: resultJson, lastError: null, leaseOwner: null, leaseUntil: null } });
      await event(db, run, "run.completed");
      await episode(db, run);
      // Persist the verified answer into the conversation (R02): one source of
      // truth for reload, export and future bounded context.
      if (run.sessionId) {
        await db.aIChatMessage.create({ data: { sessionId: run.sessionId, role: "assistant", content: responseText(run) } });
        await db.aIChatSession.update({ where: { id: run.sessionId }, data: { updatedAt: new Date() } });
      }
      return run;
    }, { timeout: 8000 });
  }

  /** Single-tool execution with verification; runs inside the run transaction. */
  /**
 * Admin-section read tools (R05 extension): one implementation shared by the
 * run path and the skill sandbox so their semantics can never diverge.
 * Bounded, no free-form SQL, no secrets (passwordHash/phone/QR codes stay
 * out of receipts where the field is not the section's own purpose).
 */
  private async readReceipt(db: DB, ctx: { scopeId: string; userId: string; runId?: string | null }, proposal: Proposal): Promise<object> {
    const input = proposal.input as Record<string, unknown>;
    switch (proposal.tool) {
      case "get_ai_status":
        return { ...await setting(db), source: "Setting:ai.enabled", verified: true };
      case "search_catalog": {
        let synced = false;
        try { await syncGraph(db, ctx.scopeId); synced = true; } catch { synced = false; }
        const catalog = await searchCatalog(db, ctx.scopeId, proposal.input.query);
        return { ...catalog, synced, source: "Graph:catalog", verified: true };
      }
      case "list_lessons": {
        const lessons = await this.listLessons(ctx.userId, { topic: proposal.input.topic });
        return { count: lessons.length, lessons: lessons.slice(0, 10).map(l => ({ topic: l.topic, statement: l.statement, evidence: l.evidence.map(e => ({ runId: e.id, tool: e.tool, state: e.state, lastError: e.lastError })), validFrom: l.validFrom, validTo: l.validTo })), source: "AgentLesson", verified: true };
      }
      case "calculate_sales_report": {
        // R07: the agent uses the SAME shared reporting service as the
        // finance pages — byDay/byProduct/byCategory come from the one
        // source, so chat answers and the UI never disagree.
        const summary = await completedSalesSummary(new Date(proposal.input.from), new Date(proposal.input.to), 10, db).catch(e => {
          if (e instanceof Error && ["UNSAFE_MONEY_VALUE", "INVALID_INTERVAL"].includes(e.message)) throw new AgentError(e.message, 409, "execution");
          throw e;
        });
        return { ...summary, source: "Order:COMPLETED", verified: true, text: summaryToFaText(summary) };
      }
      case "calculate_profit_report": {
        // Real data only: recipes + recorded costs must be complete, otherwise
        // the receipt reports insufficiency instead of an estimate.
        const profit = await completedProfitSummary(new Date(proposal.input.from), new Date(proposal.input.to), db).catch(e => {
          if (e instanceof Error && ["UNSAFE_MONEY_VALUE", "INVALID_INTERVAL"].includes(e.message)) throw new AgentError(e.message, 409, "execution");
          throw e;
        });
        return { ...profit, source: "Order:COMPLETED+Recipe", verified: true, text: profitToFaText(profit) };
      }
      case "get_order": {
        const order = await db.order.findUnique({ where: { id: String(input.orderId) }, include: { items: { select: { id: true, productId: true, quantity: true, price: true, optionPrice: true, product: { select: { nameFa: true } }, coffeeLineName: true } }, table: { select: { number: true } } } });
        if (!order) throw new AgentError("TARGET_NOT_FOUND", 404);
        return { order: { id: order.id, status: order.status, orderType: order.orderType, total: order.total, createdAt: order.createdAt.toISOString(), table: order.table?.number ?? null, items: order.items.map(i => ({ productId: i.productId, productName: i.product.nameFa, quantity: i.quantity, price: i.price, optionPrice: i.optionPrice, coffeeLine: i.coffeeLineName })) }, source: "Order:live", verified: true };
      }
      case "list_orders": {
        const orders = await db.order.findMany({
          where: input.status ? { status: String(input.status) } : {},
          orderBy: { createdAt: "desc" }, take: Number(input.take ?? 10),
          select: { id: true, status: true, orderType: true, total: true, createdAt: true, customerName: true },
        });
        return { count: orders.length, totalCount: await db.order.count({ where: input.status ? { status: String(input.status) } : {} }), orders: orders.map(o => ({ ...o, createdAt: o.createdAt.toISOString() })), source: "Order:live", verified: true };
      }
      case "get_product": {
        const product = await db.product.findUnique({ where: { id: String(input.productId) }, include: { coffeeLines: { select: { coffeeLineId: true, price: true, isActive: true } }, category: { select: { nameFa: true } } } });
        if (!product) throw new AgentError("TARGET_NOT_FOUND", 404);
        return { product: { id: product.id, nameFa: product.nameFa, price: product.price, category: product.category.nameFa, isAvailable: product.isAvailable, coffeeLines: product.coffeeLines }, source: "Product:live", verified: true };
      }
      case "list_inventory": {
        const take = Number(input.take ?? 20);
        const rows = await db.ingredient.findMany({
          where: { isActive: true },
          orderBy: { nameFa: "asc" },
          select: { id: true, nameFa: true, unit: true, stockQuantity: true, minQuantity: true },
        });
        const filtered = input.lowOnly ? rows.filter(i => i.minQuantity != null && i.stockQuantity <= i.minQuantity) : rows;
        return { count: filtered.length, totalCount: filtered.length, ingredients: filtered.slice(0, take), source: "Ingredient:live", verified: true };
      }
      case "list_staff":
        return { staff: await db.staff.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, role: true, isActive: true } }), source: "Staff:live", verified: true };
      case "suggest_staff_per_hour": {
        const to = new Date();
        const from = new Date(to.getTime() - Number(input.days ?? 14) * 86400000);
        const staffing = await suggestStaffPerHour(from, to);
        return { ...staffing, hours: staffing.hours.filter((hour) => hour.peak), source: "Order:live:Tehran-hour", verified: true };
      }
      case "list_reservations": {
        const rows = await db.tableReservation.findMany({
          orderBy: { reservedAt: "asc" }, take: Number(input.take ?? 10),
          where: { reservedAt: { gte: new Date() } },
          select: { id: true, customerName: true, guests: true, reservedAt: true, status: true, table: { select: { number: true } } },
        });
        return { count: rows.length, reservations: rows.map(r => ({ ...r, reservedAt: r.reservedAt.toISOString() })), source: "TableReservation:live", verified: true };
      }
      case "list_products":
      case "list_categories":
      case "list_tables":
      case "list_qr_codes":
      case "list_users":
      case "list_ratings":
      case "list_allergens":
        return this.sectionRead(db, proposal);
      default: throw new AgentError("UNKNOWN_TOOL", 400);
    }
  }

  private async sectionRead(db: DB, proposal: Proposal): Promise<object> {
    const input = proposal.input as Record<string, unknown>;
    switch (proposal.tool) {
      case "list_products": {
        const rows = await db.product.findMany({
          orderBy: { nameFa: "asc" }, take: Number(input.take ?? 20),
          select: { id: true, nameFa: true, price: true, isAvailable: true, categoryId: true },
        });
        return { count: rows.length, totalCount: await db.product.count(), products: rows, source: "Product:live", verified: true };
      }
      case "list_categories": {
        const rows = await db.category.findMany({
          orderBy: { nameFa: "asc" },
          select: { id: true, nameFa: true, isActive: true, _count: { select: { products: true } } },
        });
        return { count: rows.length, categories: rows.map(c => ({ id: c.id, nameFa: c.nameFa, isActive: c.isActive, productCount: c._count.products })), source: "Category:live", verified: true };
      }
      case "list_tables": {
        const rows = await db.cafeTable.findMany({
          orderBy: { number: "asc" }, take: 20,
          select: { id: true, number: true, label: true, isActive: true, isOccupied: true },
        });
        return { count: rows.length, totalCount: await db.cafeTable.count(), tables: rows, source: "CafeTable:live", verified: true };
      }
      case "list_qr_codes": {
        const rows = await db.qRCode.findMany({
          orderBy: { createdAt: "desc" }, take: Number(input.take ?? 10),
          select: { id: true, code: true, label: true, isActive: true, expiresAt: true, tableId: true },
        });
        return { count: rows.length, totalCount: await db.qRCode.count(), qrCodes: rows.map(r => ({ ...r, expiresAt: r.expiresAt?.toISOString() ?? null })), source: "QRCode:live", verified: true };
      }
      case "list_users": {
        const rows = await db.user.findMany({
          orderBy: { createdAt: "desc" }, take: Number(input.take ?? 10),
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        return { count: rows.length, totalCount: await db.user.count(), users: rows.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })), source: "User:live", verified: true };
      }
      case "list_ratings": {
        const rows = await db.rating.findMany({
          orderBy: { createdAt: "desc" }, take: Number(input.take ?? 10),
          select: { id: true, rating: true, review: true, createdAt: true, product: { select: { nameFa: true } } },
        });
        return { count: rows.length, totalCount: await db.rating.count(), ratings: rows.map(r => ({ id: r.id, rating: r.rating, review: r.review, createdAt: r.createdAt.toISOString(), productName: r.product.nameFa })), source: "Rating:live", verified: true };
      }
      case "list_allergens": {
        const rows = await db.allergen.findMany({
          orderBy: { nameFa: "asc" },
          select: { id: true, key: true, nameFa: true, nameEn: true },
        });
        return { count: rows.length, allergens: rows, source: "Allergen:live", verified: true };
      }
      default: throw new AgentError("UNKNOWN_TOOL", 400);
    }
  }

  private async executeTool(db: DB, run: AgentRun, proposal: Proposal, stepIdx: number): Promise<object> {
    const scopeId = run.scopeId;
    const input = proposal.input as Record<string, unknown>;
    try {
      switch (proposal.tool) {
        case "set_ai_enabled": {
          await setAiEnabled(proposal.input.enabled, db);
          const actual = await setting(db);
          if (actual.enabled !== proposal.input.enabled) throw new AgentError("VERIFICATION_FAILED", 409, "execution");
          return { enabled: actual.enabled, version: actual.version, previous: JSON.parse(run.previous ?? "{}"), source: "Setting:ai.enabled", verified: true };
        }
        case "get_ai_status":
          return this.readReceipt(db, { scopeId, userId: run.userId, runId: run.id }, proposal);
        case "search_catalog":
        case "list_lessons":
case "calculate_sales_report":
        case "calculate_profit_report":
        case "get_order":
        case "list_orders":
        case "get_product":
        case "list_inventory":
        case "list_staff":
        case "suggest_staff_per_hour":
        case "list_reservations":
        case "list_products":
        case "list_categories":
        case "list_tables":
        case "list_qr_codes":
        case "list_users":
        case "list_ratings":
        case "list_allergens":
          // R05/R07: ONE read implementation shared with the skill sandbox so
          // sandbox results and run receipts can never diverge.
          return this.readReceipt(db, { scopeId, userId: run.userId, runId: run.id }, proposal);
        case "analyze_attachment": {
          // R06: analysis is computed from the stored bytes — one source for
          // planner context and the rendered answer. Ownership checked live.
          const kinds = ["upload_csv", "upload_xlsx", "upload_txt"];
          let owned = (await db.agentArtifact.findMany({
            where: { scopeId, ...(proposal.input.attachmentId ? { id: proposal.input.attachmentId } : { runId: run.id }) },
            orderBy: { createdAt: "asc" },
          })).filter(a => a.createdBy === run.userId);
          // Follow-up continuity: a later message in the same conversation can
          // reach the conversation's own uploads even though only the first run
          // carries the artifact link.
          if (!owned.length && run.sessionId) {
            owned = await db.agentArtifact.findMany({
              where: { scopeId, sessionId: run.sessionId, createdBy: run.userId, kind: { in: kinds } },
              orderBy: { createdAt: "desc" }, take: 5,
            });
          }
          if (proposal.input.attachmentId) {
            const wanted = String(proposal.input.attachmentId);
            // The planner sometimes copies the visible filename instead of the
            // id; both uniquely resolve within the caller's own artifacts, so
            // an exact id or filename match is accepted — anything else fails.
            const matched = owned.some(a => a.id === wanted || a.filename === wanted);
            if (!matched) throw new AgentError("TARGET_NOT_FOUND", 404);
            owned = owned.filter(a => a.id === wanted || a.filename === wanted);
          }
          const usable = owned.filter(a => kinds.includes(a.kind));
          if (!usable.length) throw new AgentError("ATTACHMENT_NOT_ANALYSABLE", 422);
          const analyses = await Promise.all(usable.slice(0, 5).map(a => analyzeArtifact(a)));
          return { count: analyses.length, artifacts: analyses, source: "AgentArtifact:stored-bytes", verified: true };
        }
        case "generate_sales_artifact": {
          // R07: same shared generator as the admin route — one source for
          // files, chat and UI. Creates a private artifact bound to the session.
          const { summary, artifact } = await generateSalesArtifact(db, { scopeId, userId: run.userId, sessionId: run.sessionId, runId: run.id }, {
            kind: proposal.input.kind, ...(proposal.input.day ? { day: proposal.input.day } : {}), ...(proposal.input.from ? { from: proposal.input.from } : {}), ...(proposal.input.to ? { to: proposal.input.to } : {}),
          });
          return { artifactId: artifact.artifactId, kind: artifact.kind, filename: artifact.filename, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes, checksum: artifact.checksum, from: summary.from, to: summary.to, total: summary.total, count: summary.count, basis: summary.basis, text: summaryToFaText(summary), source: "Order:COMPLETED", verified: true };
        }
        case "change_order_status": {
          // Business mutation + table release + step receipt in ONE transaction (R05).
          const { order, receipt } = await transitionOrderAtomic(db, String(input.orderId), String(input.status), async (receipt, tx) => {
            await tx.agentStep.update({ where: { runId_idx: { runId: run.id, idx: stepIdx } }, data: { result: JSON.stringify(receipt) } });
          });
          const readBack = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
          if (readBack?.status !== order.status) throw new AgentError("VERIFICATION_FAILED", 409, "execution");
          return { ...receipt, currency: "TOMAN", source: "Order:transition", verified: true };
        }
        case "update_price": {
          const target = input.coffeeLineId
            ? { kind: "coffee_line" as const, productId: String(input.productId), coffeeLineId: String(input.coffeeLineId), price: Number(input.price) }
            : { kind: "product" as const, productId: String(input.productId), price: Number(input.price) };
          const { receipt } = await updatePrice(db, target, async (r, tx) => {
            await tx.agentStep.update({ where: { runId_idx: { runId: run.id, idx: stepIdx } }, data: { result: JSON.stringify(r) } });
          });
          return { ...receipt, source: "Product:price", verified: true };
        }
        case "adjust_inventory": {
          const { receipt } = await adjustInventory(db, {
            ingredientId: String(input.ingredientId), delta: Number(input.delta), reason: String(input.reason),
            allowNegativeDelta: Boolean(input.allowNegativeDelta),
          }, async (r, tx) => {
            await tx.agentStep.update({ where: { runId_idx: { runId: run.id, idx: stepIdx } }, data: { result: JSON.stringify(r) } });
          });
          return { ...receipt, source: "Ingredient:stock", verified: true };
        }
        default: throw new AgentError("UNKNOWN_TOOL", 400);
      }
    } catch (e) {
      if (e instanceof AgentError) throw e;
      if (e instanceof OrderError) {
        // Deterministic business validation failure: the transaction rolled
        // back, so the run can become terminal failed (no partial effect).
        throw new AgentError(e.code, 409, "execution");
      }
      throw e;
    }
  }

  /** Read-tool execution outside a run (skill sandbox): delegates to the SAME
   *  implementation as the run path, so sandbox results and run receipts have
   *  identical shapes and semantics by construction. */
  private async runReadToolDirect(scopeId: string, userId: string, proposal: Proposal): Promise<object> {
    return this.readReceipt(this.db, { scopeId, userId }, proposal);
  }

  /* ── Durable-queue worker API (R04): atomic claiming, lease, recovery ─── */

  /** Atomically claim one queued, unleased (or lease-expired) run. */
  async claimNext(owner: string): Promise<AgentRun | null> {
    return this.db.$transaction(async db => {
      const now = new Date();
      const candidates = await db.agentRun.findMany({
        where: { state: "queued", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        orderBy: { createdAt: "asc" }, take: 5,
        select: { id: true },
      });
      for (const c of candidates) {
        const claimed = await db.agentRun.updateMany({
          where: { id: c.id, state: "queued", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS) },
        });
        if (claimed.count === 1) return (await db.agentRun.findUnique({ where: { id: c.id } })) ?? null;
      }
      return null;
    }, { timeout: 5000 });
  }

  /** Extend the lease while work is in flight. */
  async heartbeat(runId: string, owner: string): Promise<boolean> {
    const r = await this.db.agentRun.updateMany({
      where: { id: runId, leaseOwner: owner, state: { in: ["queued", "waiting_approval"] } },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    return r.count === 1;
  }

  /** Release a lease without changing state (graceful shutdown). */
  async releaseLease(runId: string, owner: string): Promise<void> {
    await this.db.agentRun.updateMany({ where: { id: runId, leaseOwner: owner, state: "queued" }, data: { leaseOwner: null, leaseUntil: null } });
  }

  /**
   * Restart recovery: a run stuck in `running` with an expired lease means its
   * worker died mid-transaction; the transaction rolled back, so there is no
   * effect to duplicate — return it to the queue with a durable attempt record.
   */
  async reclaimExpired(now = new Date()): Promise<number> {
    return this.db.$transaction(async db => {
      const stale = await db.agentRun.findMany({ where: { state: "running", leaseUntil: { lt: now } }, select: { id: true } });
      for (const run of stale) {
        const updated = await db.agentRun.update({ where: { id: run.id }, data: { state: "queued", leaseOwner: null, leaseUntil: null, lastError: "WORKER_LEASE_EXPIRED", attemptCount: { increment: 1 } } });
        await event(db, updated, "run.attempt_failed", "reclaimed");
        await episode(db, updated, { errorCode: "WORKER_LEASE_EXPIRED" });
      }
      return stale.length;
    });
  }

  /** Worker entry point: execute a claimed run on behalf of its owner. */
  async executeClaimed(runId: string, owner: string): Promise<AgentRun> {
    const run = await this.db.agentRun.findUnique({ where: { id: runId } });
    if (!run) throw new AgentError("NOT_FOUND", 404);
    if (run.leaseOwner !== owner) throw new AgentError("LEASE_MISMATCH", 409);
    try {
      return await this.execute(run.userId, runId);
    } catch (e) {
      // Bounded worker retries: a deterministic policy failure on a queued run
      // cannot succeed by re-claiming — fail it terminally instead of hot-looping
      // (previously the worker re-claimed such runs indefinitely).
      if (e instanceof AgentError && e.phase === "policy") {
        await this.record(run.userId, runId, 0, e.code, true).catch(() => undefined);
      }
      throw e;
    }
  }
}

/**
 * R08: structured, deterministic evaluation of skill success criteria.
 * A criterion of legacy free-text shape ({description}) is reported as
 * evaluated:false — the version stays visibly unverified until migrated.
 */
export function evaluateCriteria(
  criteria: (SuccessCriterion | { description: string } | string)[],
  steps: { tool: string; ok: boolean; result?: unknown }[],
): { evaluated: boolean; passed: boolean; results: { criterion: unknown; ok: boolean; evaluated: boolean }[] } {
  const normalized = criteria.map(c => (typeof c === "string" ? { description: c } : c));
  const results = normalized.map(c => {
    if ("description" in c) return { criterion: c, ok: false, evaluated: false };
    const step = steps[c.step];
    let ok = false;
    if (c.type === "step_succeeded") ok = Boolean(step?.ok);
    else if (c.type === "result_count_at_least") ok = Number((step?.result as { count?: number } | undefined)?.count ?? 0) >= c.value;
    else if (c.type === "result_field_equals") ok = JSON.stringify((step?.result as Record<string, unknown> | undefined)?.[c.field]) === JSON.stringify(c.value);
    return { criterion: c, ok, evaluated: true };
  });
  return { evaluated: results.every(r => r.evaluated), passed: results.every(r => r.ok), results };
}
