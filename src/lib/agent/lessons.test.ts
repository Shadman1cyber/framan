import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl, postgresReachable } from "../test-db-url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";

const dir = mkdtempSync(join(tmpdir(), "farman-lessons-test-"));
const url = testDatabaseUrl("lessons");
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
  await db.agentEpisode.deleteMany(); await db.agentLesson.deleteMany(); await db.agentEvent.deleteMany();
  await db.agentRun.deleteMany(); await db.setting.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

const readRun = async () => {
  const run = await runtime.create("owner", { key: crypto.randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
  await runtime.execute("owner", run.id);
  return run;
};
const failedRun = async () => {
  const run = await runtime.create("owner", { key: crypto.randomUUID(), proposal: { tool: "set_ai_enabled", input: { enabled: true } } });
  await runtime.control("owner", run.id, "approve", run.inputHash);
  process.env.AGENT_WRITES_ENABLED = "false";
  await expect(runtime.execute("owner", run.id)).rejects.toThrow("WRITES_DISABLED");
  process.env.AGENT_WRITES_ENABLED = "true";
  return run;
};

d("episodic memory", () => {
  it("records episodes from real outcomes, never from the model", async () => {
    const ok = await readRun(); const bad = await failedRun();
    expect(await db.agentEpisode.findUnique({ where: { scopeId_runId: { scopeId: SC, runId: ok.id } } })).toMatchObject({ state: "succeeded", errorCode: null, note: null });
    expect(await db.agentEpisode.findUnique({ where: { scopeId_runId: { scopeId: SC, runId: bad.id } } })).toMatchObject({ state: "queued", errorCode: "WRITES_DISABLED" });
  });
  it("records bounded user corrections on any non-running run", async () => {
    const ok = await readRun();
    await runtime.control("owner", ok.id, "correct", undefined, "پاسخ درست بود اما باید واحد پول هم ذکر شود");
    expect(await db.agentEpisode.findUnique({ where: { scopeId_runId: { scopeId: SC, runId: ok.id } } })).toMatchObject({ note: expect.stringContaining("واحد پول") });
    const queued = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
    await runtime.control("owner", queued.id, "correct", undefined, "اصلاح روی اجرای سیاستی‌مسدود هم معتبر است");
    await expect(runtime.control("owner", queued.id, "correct", undefined, "ن")).rejects.toThrow();
  });
});

d("evidence-backed lessons", () => {
  it("requires real, terminal, caller-owned evidence", async () => {
    await expect(runtime.proposeLesson("owner", { topic: "topic", statement: "متن درس", evidence: ["nonexistent"] })).rejects.toThrow("EVIDENCE_NOT_FOUND");
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
    await expect(runtime.proposeLesson("owner", { topic: "topic", statement: "متن درس", evidence: [run.id] })).rejects.toThrow("EVIDENCE_NOT_TERMINAL");
    const ok = await readRun();
    await expect(runtime.proposeLesson("other", { topic: "topic", statement: "متن درس", evidence: [ok.id] })).rejects.toThrow("EVIDENCE_NOT_FOUND");
    const lesson = await runtime.proposeLesson("owner", { topic: "money-unit", statement: "در گزارش مالی واحد پومان ذکر شود", evidence: [ok.id] });
    expect(lesson).toMatchObject({ status: "draft", proposedBy: "owner" });
    expect(JSON.parse(lesson.evidence)).toEqual([ok.id]);
  });
  it("activates explicitly, supersedes same-topic conflicts, and never self-activates", async () => {
    const ok = await readRun();
    const a = await runtime.proposeLesson("owner", { topic: "money-unit", statement: "درس اول", evidence: [ok.id] });
    await expect(runtime.controlLesson("cashier", a.id, "activate")).rejects.toThrow("FORBIDDEN");
    expect((await db.agentLesson.findUnique({ where: { id: a.id } }))?.status).toBe("draft");
    await runtime.controlLesson("owner", a.id, "activate");
    const b = await runtime.proposeLesson("owner", { topic: "money-unit", statement: "درس دوم جایگزین", evidence: [ok.id] });
    await runtime.controlLesson("owner", b.id, "activate");
    const stored = await db.agentLesson.findMany({ where: { topic: "money-unit" } });
    expect(stored.find(l => l.id === a.id)).toMatchObject({ status: "superseded" });
    expect(stored.find(l => l.id === b.id)).toMatchObject({ status: "active", reviewedBy: "owner" });
  });
  it("reject and expire work on the right states", async () => {
    const ok = await readRun();
    const a = await runtime.proposeLesson("owner", { topic: "topic-one", statement: "درس ردشدنی", evidence: [ok.id] });
    await runtime.controlLesson("owner", a.id, "reject");
    await expect(runtime.controlLesson("owner", a.id, "activate")).rejects.toThrow("INVALID_STATE");
    const b = await runtime.proposeLesson("owner", { topic: "topic-two", statement: "درس منقضی‌شدنی", evidence: [ok.id] });
    await runtime.controlLesson("owner", b.id, "activate");
    await runtime.controlLesson("owner", b.id, "expire");
    expect((await db.agentLesson.findUnique({ where: { id: b.id } }))?.validTo).not.toBeNull();
  });
  it("read path surfaces only valid active lessons with live evidence", async () => {
    const ok = await readRun();
    const a = await runtime.proposeLesson("owner", { topic: "money-unit", statement: "واحد پول ذکر شود", evidence: [ok.id] });
    await runtime.controlLesson("owner", a.id, "activate");
    const superseded = await runtime.proposeLesson("owner", { topic: "money-unit", statement: "نسخه قدیمی", evidence: [ok.id] });
    expect((await runtime.listLessons("owner", { topic: "money-unit" })).map(l => l.id)).toEqual([a.id]);
    await runtime.controlLesson("owner", superseded.id, "activate");
    expect((await runtime.listLessons("owner")).map(l => l.statement)).toEqual(["نسخه قدیمی"]);
    const draft = await runtime.proposeLesson("owner", { topic: "draft-topic", statement: "پیش‌نویس دیده نشود", evidence: [ok.id] });
    expect((await runtime.listLessons("owner")).map(l => l.id)).not.toContain(draft.id ?? draft.id);
    expect((await runtime.listLessons("owner", { includeDrafts: true })).map(l => l.id)).toEqual(expect.arrayContaining([draft?.id, superseded.id].filter(Boolean)));
    expect((await runtime.listLessons("owner"))[0].evidence[0]).toMatchObject({ id: ok.id, state: "succeeded" });
  });
});

d("list_lessons tool end-to-end", () => {
  it("a valid correction reaches the next response with provenance", async () => {
    const bad = await failedRun();
    await runtime.control("owner", bad.id, "correct", undefined, "برای نوشتن، ابتدا AGENT_WRITES_ENABLED را فعال کن");
    const lesson = await runtime.proposeLesson("owner", { topic: "writes-disabled", statement: "خطای WRITES_DISABLED یعنی کلید سراسری نوشتن خاموش است؛ اول آن را فعال کن", evidence: [bad.id] });
    await runtime.controlLesson("owner", lesson.id, "activate");
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "list_lessons", input: { topic: "writes-disabled" } } });
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!);
    expect(result).toMatchObject({ count: 1, source: "AgentLesson", verified: true });
    expect(result.lessons[0]).toMatchObject({ topic: "writes-disabled" });
    expect(result.lessons[0].evidence[0]).toMatchObject({ runId: bad.id, lastError: "WRITES_DISABLED" });
  });
  it("denies non-owners and unknown topics return empty valid results", async () => {
    await expect(runtime.create("cashier", { key: randomUUID(), proposal: { tool: "list_lessons", input: {} } })).rejects.toThrow("FORBIDDEN");
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "list_lessons", input: { topic: "nothing" } } });
    expect(JSON.parse((await runtime.execute("owner", run.id)).result!)).toMatchObject({ count: 0 });
  });
});
