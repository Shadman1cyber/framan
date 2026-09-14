import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";

const dir = mkdtempSync(join(tmpdir(), "farman-subagent-test-"));
const url = `file:${join(dir, "test.db")}`;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const runtime = new AgentRuntime(db);
const env = { ...process.env };
const SC = "cafe";

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.cafe.create({ data: { id: SC, slug: "test", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "cashier", role: "CASHIER" }] });
}, 30000);
beforeEach(async () => {
  process.env.AGENT_ENABLED = "true"; process.env.AGENT_CAFE_ID = SC; process.env.AI_ENABLED = "false";
  await db.agentEpisode.deleteMany(); await db.agentEvent.deleteMany(); await db.agentRun.deleteMany(); await db.setting.deleteMany(); await db.order.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

const supervisor = async () => runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
const spawn = (parentId: string, proposal: object, role: "data_research" | "finance" = "data_research") =>
  runtime.control("owner", parentId, "spawn", undefined, undefined, { task: "زیرکار مستقل پژوهش", role, proposal } as never);

describe("bounded subagents", () => {
  it("spawns a bounded child with subset tools and executes it with full governance", async () => {
    const parent = await supervisor();
    const child = await spawn(parent.id, { tool: "get_ai_status", input: {} });
    expect(child).toMatchObject({ parentRunId: parent.id, state: "queued", tool: "get_ai_status" });
    expect(child.traceId).not.toBe((await db.agentRun.findUnique({ where: { id: parent.id } }))!.traceId);
    expect((await runtime.execute("owner", child.id)).state).toBe("succeeded");
    // Supervisor verifies child output before answering.
    const view = await runtime.get("owner", parent.id);
    expect(view.children[0]).toMatchObject({ state: "succeeded" });
    expect(view.children[0].result).toMatchObject({ enabled: false, verified: true });
  });
  it("finance role works with live numbers; wrong-role tool is forbidden", async () => {
    await db.order.create({ data: { total: 44000, status: "COMPLETED", createdAt: new Date("2026-09-01T00:00:00Z") } });
    const parent = await supervisor();
    const child = await spawn(parent.id, { tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z" } }, "finance");
    expect(JSON.parse((await runtime.execute("owner", child.id)).result!)).toMatchObject({ total: 44000, verified: true });
    await expect(spawn(parent.id, { tool: "search_catalog", input: { query: "لاته" } }, "finance")).rejects.toThrow("SUBAGENT_TOOL_FORBIDDEN");
  });
  it("write tools are forbidden for subagents even with valid role tools", async () => {
    const parent = await supervisor();
    await expect(spawn(parent.id, { tool: "set_ai_enabled", input: { enabled: true } })).rejects.toThrow(/SUBAGENT_WRITE_FORBIDDEN|SUBAGENT_TOOL_FORBIDDEN/);
  });
  it("enforces depth 1: children can never spawn", async () => {
    const parent = await supervisor();
    const child = await spawn(parent.id, { tool: "get_ai_status", input: {} });
    await expect(spawn(child.id, { tool: "get_ai_status", input: {} })).rejects.toThrow("SUBAGENT_DEPTH_EXCEEDED");
  });
  it("deducts budget from the parent and blocks the 13th call", async () => {
    const parent = await supervisor();
    for (let i = 0; i < 12; i++) {
      const child = await spawn(parent.id, { tool: "get_ai_status", input: {} });
      await runtime.execute("owner", child.id); // terminal children keep budget slots free
    }
    await expect(spawn(parent.id, { tool: "get_ai_status", input: {} })).rejects.toThrow("SUBAGENT_BUDGET_EXCEEDED");
    expect(await db.agentRun.count({ where: { parentRunId: parent.id } })).toBe(12);
  });
  it("caps concurrent non-terminal children at 3", async () => {
    const parent = await supervisor();
    for (let i = 0; i < 3; i++) await spawn(parent.id, { tool: "get_ai_status", input: {} });
    await expect(spawn(parent.id, { tool: "get_ai_status", input: {} })).rejects.toThrow("SUBAGENT_CONCURRENCY_EXCEEDED");
    // Terminal children free budget slots back up.
    const first = (await db.agentRun.findMany({ where: { parentRunId: parent.id } }))[0];
    await runtime.execute("owner", first.id);
    const fourth = await spawn(parent.id, { tool: "get_ai_status", input: {} });
    expect(fourth.parentRunId).toBe(parent.id);
  });
  it("cancelling the parent cascades to non-terminal children", async () => {
    const parent = await supervisor();
    const a = await spawn(parent.id, { tool: "get_ai_status", input: {} });
    const b = await spawn(parent.id, { tool: "get_ai_status", input: {} });
    await runtime.execute("owner", a.id); // terminal child must stay succeeded
    await runtime.control("owner", parent.id, "cancel");
    expect((await db.agentRun.findUnique({ where: { id: b.id } }))?.state).toBe("cancelled");
    expect((await db.agentRun.findUnique({ where: { id: a.id } }))?.state).toBe("succeeded");
    // Cancelled terminal replay: no effect, state stays cancelled.
    expect((await runtime.execute("owner", b.id)).state).toBe("cancelled");
    expect(await db.agentEvent.count({ where: { runId: b.id, name: "tool.started" } })).toBe(0);
  });
  it("denies unprivileged spawners and keeps child runs user-scoped", async () => {
    const parent = await supervisor();
    await expect(runtime.control("cashier", parent.id, "spawn", undefined, undefined, { task: "زیرکار پژوهش", role: "data_research", proposal: { tool: "get_ai_status", input: {} } } as never)).rejects.toThrow("FORBIDDEN");
    const child = await spawn(parent.id, { tool: "get_ai_status", input: {} });
    await expect(runtime.get("cashier", child.id)).rejects.toThrow("FORBIDDEN");
  });
});
