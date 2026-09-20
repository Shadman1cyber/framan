import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl, postgresReachable } from "../test-db-url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync, spawn } from "child_process";
import { createServer } from "http";
import { build } from "esbuild";
import { flushTelemetry } from "./telemetry";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";
import { proposalSchema } from "./contracts";

const dir = mkdtempSync(join(tmpdir(), "farman-agent-test-"));
const url = testDatabaseUrl("runtime");
const d = postgresReachable() ? describe : describe.skip;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const runtime = new AgentRuntime(db);
const create = (enabled = true) => runtime.create("owner", { key: randomUUID(), proposal: { tool: "set_ai_enabled", input: { enabled } } });
const read = () => runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
const env = { ...process.env };
const session = vi.hoisted(() => ({ user: { id: "owner", role: "OWNER" } as { id: string; role: string } | null }));
vi.mock("@/lib/db", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/guards", () => ({ getSessionUser: async () => session.user }));

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.cafe.create({ data: { id: "cafe", slug: "test", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "other", role: "OWNER" }, { id: "cashier", role: "CASHIER" }, { id: "customer", role: "CUSTOMER" }] });
}, 30000);
beforeEach(async () => {
  session.user = { id: "owner", role: "OWNER" };
  process.env.NEXTAUTH_URL = "http://localhost:3080";
  delete process.env.OPENOBSERVE_TRACES_URL; delete process.env.OPENOBSERVE_AUTHORIZATION;
  process.env.AGENT_ENABLED = "true";
  process.env.AGENT_WRITES_ENABLED = "true";
  process.env.AGENT_CAFE_ID = "cafe";
  process.env.AI_ENABLED = "false";
  await db.agentEvent.deleteMany(); await db.agentRun.deleteMany(); await db.setting.deleteMany(); await db.order.deleteMany();
  await db.user.update({ where: { id: "owner" }, data: { role: "OWNER" } });
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

d("real SQLite agent execution", () => {
  it("reads source and persists verification trace", async () => {
    const run = await read(); const result = await runtime.execute("owner", run.id);
    expect(result.state).toBe("succeeded"); expect(JSON.parse(result.result!).enabled).toBe(false);
    expect((await runtime.get("owner", run.id)).events.map(e => e.name)).toContain("tool.verified");
  });
  it("requires approval then writes, reads back, and reverses through a new approved operation", async () => {
    const run = await create(); await expect(runtime.execute("owner", run.id)).rejects.toThrow("INVALID_STATE");
    await runtime.control("owner", run.id, "approve", run.inputHash);
    expect((await runtime.execute("owner", run.id)).state).toBe("succeeded");
    expect((await db.setting.findUnique({ where: { key: "ai.enabled" } }))?.value).toBe("true");
    const inverse = await create(false); await runtime.control("owner", inverse.id, "approve", inverse.inputHash); await runtime.execute("owner", inverse.id);
    expect((await db.setting.findUnique({ where: { key: "ai.enabled" } }))?.value).toBe("false");
  });
  it("replays after lost reply without a second write or receipt", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    const first = await runtime.execute("owner", run.id); const stamp = await db.setting.findUnique({ where: { key: "ai.enabled" } });
    const second = await new AgentRuntime(db).execute("owner", run.id);
    expect(second.result).toBe(first.result); expect(await db.setting.findUnique({ where: { key: "ai.enabled" } })).toEqual(stamp);
    expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.verified" } })).toBe(1);
  });
  it("binds idempotency key to exact normalized request", async () => {
    const request = { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } };
    const a = await runtime.create("owner", request); expect((await runtime.create("owner", request)).id).toBe(a.id);
    await expect(runtime.create("owner", { ...request, proposal: { tool: "set_ai_enabled", input: { enabled: true } } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("rejects mismatched approval hash and expiry", async () => {
    const run = await create(); await expect(runtime.control("owner", run.id, "approve", "0".repeat(64))).rejects.toThrow("APPROVAL_MISMATCH");
    await db.agentRun.update({ where: { id: run.id }, data: { expiresAt: new Date(0) } });
    await expect(runtime.control("owner", run.id, "approve", run.inputHash)).rejects.toThrow("APPROVAL_EXPIRED");
  });
  it("rejects source changes after approval", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    await db.setting.create({ data: { key: "ai.enabled", value: "false" } });
    await expect(runtime.execute("owner", run.id)).rejects.toThrow("STALE_SOURCE");
  });
  it("checks kill switch after approval", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash); process.env.AGENT_WRITES_ENABLED = "false";
    await expect(runtime.execute("owner", run.id)).rejects.toThrow("WRITES_DISABLED"); expect(await db.setting.count()).toBe(0);
  });
  it.each(["cashier", "customer", "deleted"])("denies %s", async user => {
    await expect(runtime.create(user, { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } })).rejects.toThrow("FORBIDDEN");
  });
  it("reloads revoked owner role before execution", async () => {
    const run = await read(); await db.user.update({ where: { id: "owner" }, data: { role: "CUSTOMER" } });
    await expect(runtime.execute("owner", run.id)).rejects.toThrow("FORBIDDEN");
  });
  it("isolates runs by user and fails closed for multiple cafes", async () => {
    const run = await read(); await expect(runtime.get("other", run.id)).rejects.toThrow("NOT_FOUND");
    await db.cafe.create({ data: { id: "second", slug: "second", nameFa: "دوم" } });
    try { await expect(runtime.get("owner", run.id)).rejects.toThrow("SINGLE_CAFE_SCOPE_REQUIRED"); }
    finally { await db.cafe.delete({ where: { id: "second" } }); }
  });
  it("enforces pause/resume/cancel boundaries", async () => {
    const run = await read(); await runtime.control("owner", run.id, "pause"); await expect(runtime.execute("owner", run.id)).rejects.toThrow("INVALID_STATE");
    await runtime.control("owner", run.id, "resume"); await runtime.control("owner", run.id, "cancel");
    expect((await runtime.execute("owner", run.id)).state).toBe("cancelled"); expect(await db.agentEvent.count({ where: { name: "tool.started" } })).toBe(0);
  });
  it("refuses injected tools, identity fields and invalid money periods", () => {
    for (const v of [{ tool: "shell", input: {} }, { tool: "get_ai_status", input: {}, role: "OWNER" }, { tool: "set_ai_enabled", input: { enabled: true, tenant: "other" } }]) expect(proposalSchema.safeParse(v).success).toBe(false);
  });
  it("calculates authoritative completed sales with exact interval and currency", async () => {
    await db.order.createMany({ data: [
      { total: 12345, status: "COMPLETED", createdAt: new Date("2026-09-01T00:00:00Z") },
      { total: 999, status: "CANCELLED", createdAt: new Date("2026-09-01T01:00:00Z") },
      { total: 888, status: "COMPLETED", createdAt: new Date("2026-09-02T00:00:00Z") },
    ] });
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z" } } });
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!);
    expect(result).toMatchObject({ total: 12345, count: 1, currency: "TOMAN", verified: true });
  });
});


d("phase 2 recovery and races", () => {
  it("records policy rejections durably without changing retryable state", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    process.env.AGENT_WRITES_ENABLED = "false";
    await expect(runtime.execute("owner", run.id)).rejects.toThrow("WRITES_DISABLED");
    expect(await db.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ state: "queued", lastError: "WRITES_DISABLED", attemptCount: 1 });
    expect((await runtime.get("owner", run.id)).events.map(e => e.name)).toContain("run.attempt_failed");
    process.env.AGENT_WRITES_ENABLED = "true";
    expect((await runtime.execute("owner", run.id)).state).toBe("succeeded");
    expect((await db.agentRun.findUnique({ where: { id: run.id } }))?.lastError).toBeNull();
  });
  it("fails a queued run terminally when the worker hits a deterministic policy error (no hot loop)", async () => {
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_order", input: { orderId: "eval-missing-order" } } });
    const claimed = await runtime.claimNext("w1");
    expect(claimed?.id).toBe(run.id);
    await expect(runtime.executeClaimed(run.id, "w1")).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
    expect(await db.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ state: "failed", lastError: "TARGET_NOT_FOUND" });
  });
  it("marks deterministic verification failure terminal and durable", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    await db.$executeRawUnsafe("CREATE TRIGGER flip AFTER INSERT ON Setting WHEN NEW.key = 'ai.enabled' AND NEW.value = 'true' BEGIN UPDATE Setting SET value = 'false' WHERE key = 'ai.enabled'; END");
    try { await expect(runtime.execute("owner", run.id)).rejects.toThrow("VERIFICATION_FAILED"); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER flip"); }
    expect(await db.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ state: "failed", lastError: "VERIFICATION_FAILED", attemptCount: 1 });
    expect(await db.setting.count()).toBe(0);
    expect((await runtime.get("owner", run.id)).events.map(e => e.name)).not.toContain("tool.verified");
    expect((await runtime.execute("owner", run.id)).state).toBe("failed");
  });
  it("retries transient infrastructure errors with bounded backoff", async () => {
    const run = await read();
    const target = runtime as unknown as { attempt: (u: string, id: string) => Promise<unknown> };
    const original = target.attempt; let calls = 0;
    const busy = () => { const e = new Error("SQLITE_BUSY: database is locked"); (e as { code?: string }).code = "P2024"; return e; };
    target.attempt = vi.fn(async (u: string, id: string) => { if (++calls < 3) throw busy(); return original.call(runtime, u, id); });
    try { expect((await runtime.execute("owner", run.id)).state).toBe("succeeded"); } finally { target.attempt = original; }
    expect(calls).toBe(3);
    expect(await db.agentEvent.count({ where: { runId: run.id, name: "run.attempt_failed" } })).toBe(0);
  });
  it("records exhausted transient failures without making the run terminal", async () => {
    const run = await read();
    const target = runtime as unknown as { attempt: (u: string, id: string) => Promise<unknown> };
    const original = target.attempt;
    target.attempt = vi.fn(async () => { const e = new Error("SQLITE_BUSY: database is locked"); (e as { code?: string }).code = "P2024"; throw e; });
    try { await expect(runtime.execute("owner", run.id)).rejects.toThrow("SQLITE_BUSY"); }
    finally { target.attempt = original; }
    expect(await db.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ state: "queued", lastError: "EXECUTION_ERROR", attemptCount: 3 });
  });
  it("executes concurrent requests without a duplicate effect", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    const results = await Promise.allSettled([new AgentRuntime(db).execute("owner", run.id), new AgentRuntime(db).execute("owner", run.id)]);
    const receipts = results.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<{ result: string | null }>).value.result!);
    expect(receipts.length).toBeGreaterThan(0);
    expect(new Set(receipts).size).toBe(1);
    expect(JSON.parse(receipts[0])).toMatchObject({ enabled: true, verified: true });
    expect((await db.setting.findUnique({ where: { key: "ai.enabled" } }))?.value).toBe("true");
    expect((await db.agentRun.findUnique({ where: { id: run.id } }))?.state).toBe("succeeded");
    expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.verified" } })).toBe(1);
  }, 30000);
  it("resolves approve and cancel races to one coherent outcome", async () => {
    const run = await create();
    await Promise.allSettled([runtime.control("owner", run.id, "approve", run.inputHash), new AgentRuntime(db).control("owner", run.id, "cancel")]);
    const stored = await db.agentRun.findUnique({ where: { id: run.id } });
    const coherent = stored!.state === "cancelled" || (stored!.state === "queued" && stored!.approvedBy === "owner" && stored!.approvedHash === run.inputHash);
    expect(coherent).toBe(true);
    expect(await db.setting.count()).toBe(0);
    expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.started" } })).toBe(0);
  }, 30000);
  it("survives a real process kill after commit and replays the durable receipt", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    const cache = join(process.cwd(), "node_modules/.cache");
    mkdirSync(cache, { recursive: true });
    const outfile = join(cache, `farman-crash-child-${randomUUID()}.cjs`);
    await build({
      stdin: { contents: `
        import { PrismaClient } from "@prisma/client";
        import { AgentRuntime } from "./runtime";
        const db = new PrismaClient();
        const [runId] = process.argv.slice(2);
        new AgentRuntime(db).execute("owner", runId)
          .then(async r => { process.stdout.write("COMMITTED " + r.state + "\\n"); await db.$disconnect(); setInterval(() => undefined, 1 << 30); })
          .catch(e => { process.stdout.write("FAILED " + String((e && e.message) || e) + "\\n"); process.exit(1); });
      `, resolveDir: join(process.cwd(), "src/lib/agent"), loader: "ts" },
      bundle: true, platform: "node", format: "cjs", outfile, external: ["@prisma/client"],
      alias: { "@": join(process.cwd(), "src") }, logLevel: "silent",
    });
    const child = spawn(process.execPath, [outfile, run.id], {
      cwd: process.cwd(), stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, DATABASE_URL: url, AGENT_ENABLED: "true", AGENT_WRITES_ENABLED: "true", AGENT_CAFE_ID: "cafe" },
    });
    let out = "";
    child.stdout!.on("data", (chunk: Buffer) => { out += chunk.toString(); if (out.includes("COMMITTED") || out.includes("FAILED")) child.kill("SIGKILL"); });
    await new Promise<void>(resolve => child.on("exit", () => resolve()));
    expect(out).toContain("COMMITTED");
    const stored = await db.agentRun.findUnique({ where: { id: run.id } });
    expect(stored?.state).toBe("succeeded");
    expect((await db.setting.findUnique({ where: { key: "ai.enabled" } }))?.value).toBe("true");
    expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.verified" } })).toBe(1);
    const replay = await new AgentRuntime(db).execute("owner", run.id);
    expect(replay.result).toBe(stored?.result);
    expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.started" } })).toBe(1);
    rmSync(outfile, { force: true });
  }, 60000);
});

d("transport and atomic rollback", () => {
  it("rolls back a real mutation when persisting its verification event fails", async () => {
    const run = await create(); await runtime.control("owner", run.id, "approve", run.inputHash);
    await db.$executeRawUnsafe("CREATE TRIGGER fail_receipt BEFORE INSERT ON AgentEvent WHEN NEW.name = 'tool.verified' BEGIN SELECT RAISE(ABORT, 'test receipt failure'); END");
    try { await expect(runtime.execute("owner", run.id)).rejects.toThrow(); expect(await db.setting.count()).toBe(0); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_receipt"); }
    expect((await runtime.execute("owner", run.id)).state).toBe("succeeded");
  });
  it("runs authenticated HTTP handlers against the real database", async () => {
    const routes = await import("@/app/api/admin/agent/runs/route");
    const controls = await import("@/app/api/admin/agent/runs/[id]/route");
    const req = (data: object) => new Request("http://localhost:3080/api/admin/agent/runs", { method: "POST", headers: { origin: "http://localhost:3080", "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const res = await routes.POST(req({ key: randomUUID(), proposal: { tool: "set_ai_enabled", input: { enabled: true } } }));
    expect(res.status).toBe(200); const { run } = await res.json();
    expect((await controls.POST(req({ action: "approve", inputHash: run.inputHash }), { params: { id: run.id } })).status).toBe(200);
    const executed = await controls.POST(req({ action: "execute" }), { params: { id: run.id } });
    expect((await executed.json()).run.state).toBe("succeeded");
    expect((await db.setting.findUnique({ where: { key: "ai.enabled" } }))?.value).toBe("true");
    session.user = null; expect((await routes.GET(new Request("http://localhost:3080/api/admin/agent/runs"))).status).toBe(401);
  });
  it("rejects cross-origin and oversized HTTP input", async () => {
    const { POST } = await import("@/app/api/admin/agent/runs/route");
    for (const [origin, body, status] of [["https://evil.test", "{}", 403], ["http://localhost:3080", "x".repeat(9000), 413]] as const) {
      const res = await POST(new Request("http://localhost:3080/api/admin/agent/runs", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body })); expect(res.status).toBe(status);
    }
    expect(await db.agentRun.count()).toBe(0);
  });
  it("covers every admin section with bounded read tools and no secrets", async () => {
    const cat = await db.category.create({ data: { slug: "sec-test", nameFa: "بخش تست" } });
    await db.product.create({ data: { slug: "sec-prod", nameFa: "محصول تست", description: "د", price: 1000, categoryId: cat.id } });
    const branch = await db.branch.create({ data: { id: "sec-branch", cafeId: "cafe", nameFa: "شعبه", slug: "sec-branch" } }).catch(() => null);
    const branchId = branch?.id ?? (await db.branch.findFirst())!.id;
    const table = await db.cafeTable.create({ data: { branchId, number: "T-99" } });
    const qr = await db.qRCode.create({ data: { code: "sec-qr-code", branchId, tableId: table.id, label: "میز ۹۹" } });
    await db.rating.create({ data: { userId: "customer", productId: (await db.product.findFirst({ where: { slug: "sec-prod" } }))!.id, rating: 4, review: "خوب" } });
    await db.allergen.create({ data: { key: "sec-nut", nameFa: "گردوی تست", nameEn: "test walnut" } }).catch(() => null);
    const cases: [string, Record<string, unknown>, (r: Record<string, unknown>) => void][] = [
      ["list_products", {}, r => { expect(r.source).toBe("Product:live"); expect((r.products as Record<string, unknown>[]).some(p => p.nameFa === "محصول تست")).toBe(true); }],
      ["list_categories", {}, r => { expect((r.categories as Record<string, unknown>[]).some(c => (c.productCount as number) >= 1)).toBe(true); }],
      ["list_tables", {}, r => { expect((r.tables as Record<string, unknown>[]).some(t => t.number === "T-99")).toBe(true); }],
      ["list_qr_codes", {}, r => { expect((r.qrCodes as unknown[]).some((q) => (q as { code: string }).code === "sec-qr-code")).toBe(true); }],
      ["list_users", {}, r => { const users = r.users as Record<string, unknown>[]; expect(users.every(u => !("passwordHash" in u) && !("phone" in u))).toBe(true); expect(users.some(u => u.role === "OWNER")).toBe(true); }],
      ["list_ratings", {}, r => { expect((r.ratings as unknown[]).some((x) => (x as { productName: string }).productName === "محصول تست")).toBe(true); }],
      ["list_allergens", {}, r => { expect(Array.isArray(r.allergens)).toBe(true); }],
      ["list_products", { take: 1 }, r => { expect((r.products as unknown[]).length).toBeLessThanOrEqual(1); }],
    ];
    for (const [tool, input, check] of cases) {
      const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: tool as never, input: input as never } });
      const result = await runtime.execute("owner", run.id);
      expect(result.state).toBe("succeeded");
      check(JSON.parse(result.result!));
    }
    await db.qRCode.delete({ where: { id: qr.id } }).catch(() => undefined);
    await db.rating.deleteMany({}); await db.cafeTable.delete({ where: { id: table.id } }).catch(() => undefined);
    if (branch) await db.branch.delete({ where: { id: branch.id } }).catch(() => undefined);
  });
  it("exports sanitized OTLP to an actual HTTP sink and retries failed ingestion", async () => {
    const run = await read(); await runtime.execute("owner", run.id);
    let status = 503; let payload = "";
    const server = createServer((req, res) => { payload = ""; req.on("data", chunk => { payload += chunk; }); req.on("end", () => { res.writeHead(status, { "Content-Type": "application/json" }); res.end("{}"); }); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    process.env.OPENOBSERVE_TRACES_URL = `http://127.0.0.1:${address.port}/api/default/v1/traces`;
    process.env.OPENOBSERVE_AUTHORIZATION = "Basic test-only";
    try {
      expect((await flushTelemetry(db)).sent).toBe(0); expect(await db.agentEvent.count({ where: { exportedAt: null } })).toBe(4);
      status = 200; expect((await flushTelemetry(db)).sent).toBe(4);
      expect(JSON.parse(payload).resourceSpans[0].scopeSpans[0].spans[0].traceId).toBe(run.traceId);
      expect(payload).not.toContain("owner"); expect(payload).not.toContain("test-only"); expect(payload).not.toContain("approvedHash");
      expect((await flushTelemetry(db)).sent).toBe(0);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

d("conversation and answer regressions", () => {
  it("creates a session for the first question and persists the worker answer exactly once", async () => {
    const planner = vi.fn(async () => ({ steps: [{ tool: "get_ai_status" as const, input: {} }] }));
    const rt = new AgentRuntime(db, planner);
    const request = { key: randomUUID(), question: "وضعیت دستیار؟" };
    const run = await rt.create("owner", request);
    expect(run.sessionId).toBeTruthy();
    expect((await db.aIChatSession.findUnique({ where: { id: run.sessionId! } }))?.ownerId).toBe("owner");
    await rt.execute("owner", run.id);
    await rt.execute("owner", run.id);
    expect(await db.aIChatMessage.count({ where: { sessionId: run.sessionId! } })).toBe(2);
    expect((await rt.create("owner", request)).id).toBe(run.id);
    expect(planner).toHaveBeenCalledTimes(1);
  });

  it("passes only the current owner's recent chronological history to the planner", async () => {
    const chat = await db.aIChatSession.create({ data: { ownerId: "owner", userId: "owner" } });
    for (let i = 0; i < 10; i++) await db.aIChatMessage.create({ data: {
      sessionId: chat.id, role: i % 2 ? "assistant" : "user", content: `message-${i}`, createdAt: new Date(1000 + i),
    } });
    const planner = vi.fn(async () => ({ steps: [{ tool: "get_ai_status" as const, input: {} }] }));
    const rt = new AgentRuntime(db, planner);
    await expect(rt.create("other", { key: randomUUID(), sessionId: chat.id, question: "قیمتش چنده؟" })).rejects.toThrow("NOT_FOUND");
    expect(planner).not.toHaveBeenCalled();
    await rt.create("owner", { key: randomUUID(), sessionId: chat.id, question: "قیمتش چنده؟" });
    expect((planner.mock.calls[0] as unknown as [string, string[], {content:string}[]])[2].map(m => m.content)).toEqual(
      Array.from({ length: 8 }, (_, i) => `message-${i + 2}`),
    );
  });

  it("does not reuse an idempotency key for a different conversation", async () => {
    const a = await db.aIChatSession.create({ data: { ownerId: "owner", userId: "owner" } });
    const b = await db.aIChatSession.create({ data: { ownerId: "owner", userId: "owner" } });
    const request = { key: randomUUID(), sessionId: a.id, proposal: { tool: "get_ai_status", input: {} } };
    await runtime.create("owner", request);
    await expect(runtime.create("owner", { ...request, sessionId: b.id })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("returns a live named-product price and distinguishes list size from total", async () => {
    const cat = await db.category.create({ data: { slug: randomUUID(), nameFa: "آزمایش قیمت" } });
    const product = await db.product.create({ data: { slug: randomUUID(), nameFa: "موکا تست زنده", description: "تست", price: 65000, categoryId: cat.id } });
    const search = async () => {
      const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "search_catalog", input: { query: "موکا تست زنده" } } });
      return JSON.parse((await runtime.execute("owner", run.id)).result!);
    };
    expect((await search()).results.find((r: {refId:string}) => r.refId === product.id).price).toBe(65000);
    await db.product.update({ where: { id: product.id }, data: { price: 78000 } });
    expect((await search()).results.find((r: {refId:string}) => r.refId === product.id).price).toBe(78000);
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "list_products", input: { take: 1 } } });
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!);
    expect(result.products).toHaveLength(1);
    expect(result.totalCount).toBe(await db.product.count());
    expect(result.totalCount).toBeGreaterThan(1);
  });

  it("rejects plans with two writes before creating a run or changing data", async () => {
    const rt = new AgentRuntime(db, async () => ({ steps: [
      { tool: "set_ai_enabled", input: { enabled: true } },
      { tool: "set_ai_enabled", input: { enabled: false } },
    ] }));
    await expect(rt.create("owner", { key: randomUUID(), question: "روشن کن بعد خاموش کن" })).rejects.toThrow("at most one write");
    expect(await db.agentRun.count()).toBe(0);
    expect(await db.setting.count()).toBe(0);
  });
});
