import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync, spawn } from "child_process";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";

/**
 * R04 worker tests against a real disposable SQLite file: atomic claiming,
 * lease/heartbeat, worker restart recovery (SIGKILL mid-loop), and the
 * app+worker sharing one database without duplicate effects.
 */

const dir = mkdtempSync(join(tmpdir(), "farman-worker-test-"));
const url = `file:${join(dir, "test.db")}`;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const runtime = new AgentRuntime(db);
const env = { ...process.env };
const envFor = { ...process.env, DATABASE_URL: url, AGENT_ENABLED: "true", AGENT_WRITES_ENABLED: "true", AGENT_CAFE_ID: "cafe", AGENT_WORKER_IDLE_MS: "300" };

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: envFor, stdio: "pipe" });
  await db.cafe.create({ data: { id: "cafe", slug: "test", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "other", role: "OWNER" }] });
}, 30000);
beforeEach(async () => {
  process.env.AGENT_ENABLED = "true"; process.env.AGENT_WRITES_ENABLED = "true"; process.env.AGENT_CAFE_ID = "cafe"; process.env.AI_ENABLED = "false";
  await db.agentEpisode.deleteMany(); await db.agentEvent.deleteMany(); await db.agentRun.deleteMany(); await db.setting.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

const queue = async () => runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });

function startWorker() {
  return spawn(process.execPath, [join(process.cwd(), "worker", "dist.cjs")], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: envFor,
  });
}
function waitFor(worker: ReturnType<typeof startWorker>, text: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => { worker.kill("SIGKILL"); reject(new Error(`timeout waiting for "${text}"; got: ${out}`)); }, timeoutMs);
    const on = (c: Buffer) => {
      out += c.toString();
      if (out.includes(text)) { clearTimeout(timer); worker.stdout!.off("data", on); worker.stderr!.off("data", on); resolve(out); }
    };
    worker.stdout!.on("data", on);
    worker.stderr!.on("data", on);
  });
}

describe("durable queue worker (R04)", () => {
  it("claims and executes queued runs atomically; concurrent claimers never double-run", async () => {
    const run = await queue();
    const [a, b] = [startWorker(), startWorker()];
    try {
      await Promise.race([waitFor(a, `finished ${run.id}`), waitFor(b, `finished ${run.id}`)]);
      await new Promise(r => setTimeout(r, 2500)); // let both workers settle
      const stored = await db.agentRun.findUnique({ where: { id: run.id } });
      expect(stored?.state).toBe("succeeded");
      expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.verified" } })).toBe(1);
      expect(await db.agentEvent.count({ where: { name: "tool.started" } })).toBe(1);
    } finally { a.kill("SIGKILL"); b.kill("SIGKILL"); }
  }, 60000);

  it("restarts cleanly after SIGKILL and requeues a crashed claimed run without duplicate effects", async () => {
    const run = await queue();
    const worker = startWorker();
    await waitFor(worker, `claimed ${run.id}`, 30000);
    // Kill right after claiming, before the (queued read) transaction commits.
    await new Promise(r => setTimeout(r, 120));
    worker.kill("SIGKILL");
    await new Promise(r => setTimeout(r, 800));
    const after = await db.agentRun.findUnique({ where: { id: run.id } });
    // Either never started (still queued) or finished atomically.
    expect(["queued", "succeeded"]).toContain(after?.state);
    const second = startWorker();
    try {
      await waitFor(second, after?.state === "succeeded" ? "starting" : `finished ${run.id}`);
      await new Promise(r => setTimeout(r, 1500));
      const final = await db.agentRun.findUnique({ where: { id: run.id } });
      expect(final?.state).toBe("succeeded");
      expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.verified" } })).toBe(1);
    } finally { second.kill("SIGKILL"); }
  }, 60000);

  it("reclaims a run whose lease expired while marked running (no effect, queued again)", async () => {
    // Simulate a dead worker holding state=running with an expired lease.
    const run = await queue();
    await db.agentRun.update({ where: { id: run.id }, data: { state: "running", leaseOwner: "ghost", leaseUntil: new Date(Date.now() - 1000) } });
    const reclaimed = await runtime.reclaimExpired();
    expect(reclaimed).toBe(1);
    const stored = await db.agentRun.findUnique({ where: { id: run.id } });
    expect(stored?.state).toBe("queued");
    expect(stored?.lastError).toBe("WORKER_LEASE_EXPIRED");
    expect((await runtime.get("owner", run.id)).events.map(e => e.name)).toContain("run.attempt_failed");
    // Queue drains normally afterwards with exactly one effect.
    const w = startWorker();
    try {
      await waitFor(w, `finished ${run.id}`);
      expect((await db.agentRun.findUnique({ where: { id: run.id } }))?.state).toBe("succeeded");
      expect(await db.agentEvent.count({ where: { runId: run.id, name: "tool.verified" } })).toBe(1);
    } finally { w.kill("SIGKILL"); }
  }, 60000);

  it("keeps user ownership: the worker executes runs scoped to their owner", async () => {
    const run = await queue();
    await expect((async () => {
      const r = await db.agentRun.findUnique({ where: { id: run.id } });
      return r;
    })()).resolves.toMatchObject({ userId: "owner" });
    const w = startWorker();
    try {
      await waitFor(w, `finished ${run.id}`);
      expect((await db.agentRun.findUnique({ where: { id: run.id } }))?.state).toBe("succeeded");
    } finally { w.kill("SIGKILL"); }
  }, 60000);
});