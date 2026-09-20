import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl, postgresReachable } from "../test-db-url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";

const dir = mkdtempSync(join(tmpdir(), "farman-release-test-"));
const url = testDatabaseUrl("release");
const d = postgresReachable() ? describe : describe.skip;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const runtime = new AgentRuntime(db);
const env = { ...process.env };
const SC = "cafe";

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.cafe.create({ data: { id: SC, slug: "test", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "other", role: "OWNER" }, { id: "cashier", role: "CASHIER" }] });
}, 30000);
beforeEach(async () => {
  process.env.AGENT_ENABLED = "true"; process.env.AGENT_WRITES_ENABLED = "true"; process.env.AGENT_CAFE_ID = SC; process.env.AI_ENABLED = "false";
  delete process.env.AGENT_SHADOW_MODE; delete process.env.AGENT_CANARY_USERS;
  await db.agentEpisode.deleteMany(); await db.agentEvent.deleteMany(); await db.agentRun.deleteMany(); await db.setting.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

d("gradual release flags", () => {
  it("shadow mode exercises reads but blocks writes with an observable code", async () => {
    process.env.AGENT_SHADOW_MODE = "true";
    const read = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
    expect((await runtime.execute("owner", read.id)).state).toBe("succeeded");
    const write = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "set_ai_enabled", input: { enabled: true } } });
    await runtime.control("owner", write.id, "approve", write.inputHash);
    await expect(runtime.execute("owner", write.id)).rejects.toThrow("SHADOW_MODE");
    expect(await db.setting.count()).toBe(0);
  });
  it("canary blocks unlisted users server-side and admits listed ones", async () => {
    process.env.AGENT_CANARY_USERS = "owner";
    await expect(runtime.list("other")).rejects.toThrow("CANARY_NOT_ENROLLED");
    expect(await runtime.list("owner")).toEqual([]);
    delete process.env.AGENT_CANARY_USERS;
    expect(await runtime.list("other")).toEqual([]);
  });
  it("status reflects kill switch, shadow and queue counts", async () => {
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "set_ai_enabled", input: { enabled: true } } });
    process.env.AGENT_SHADOW_MODE = "true";
    const s = await runtime.status("owner");
    expect(s).toMatchObject({ enabled: true, writes: true, shadow: true, canaryActive: false, approvalQueue: 1, running: 0 });
    expect(run.state).toBe("waiting_approval");
  });
});
