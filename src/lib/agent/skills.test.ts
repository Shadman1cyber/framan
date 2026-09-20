import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl, postgresReachable } from "../test-db-url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";
import { skillDefinitionSchema } from "./contracts";

const dir = mkdtempSync(join(tmpdir(), "farman-skills-test-"));
const url = testDatabaseUrl("skills");
const d = postgresReachable() ? describe : describe.skip;
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
  process.env.AGENT_ENABLED = "true"; process.env.AGENT_WRITES_ENABLED = "true"; process.env.AGENT_CAFE_ID = SC; process.env.AI_ENABLED = "false";
  await db.agentSkill.deleteMany(); await db.agentEpisode.deleteMany(); await db.agentLesson.deleteMany();
  await db.agentEvent.deleteMany(); await db.agentRun.deleteMany(); await db.setting.deleteMany();
  // Business source rows are recreated per test; order deletes cascade items.
  await db.order.deleteMany(); await db.tableReservation.deleteMany(); await db.qRCode.deleteMany();
  await db.cafeTable.deleteMany(); await db.branch.deleteMany(); await db.staff.deleteMany();
  await db.product.deleteMany(); await db.ingredient.deleteMany(); await db.category.deleteMany(); await db.allergen.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

const makeEpisode = async (note?: string) => {
  const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "set_ai_enabled", input: { enabled: true } } });
  await runtime.control("owner", run.id, "approve", run.inputHash);
  process.env.AGENT_WRITES_ENABLED = "false";
  await expect(runtime.execute("owner", run.id)).rejects.toThrow("WRITES_DISABLED");
  process.env.AGENT_WRITES_ENABLED = "true";
  if (note) await runtime.control("owner", run.id, "correct", undefined, note);
  const ep = await db.agentEpisode.findUnique({ where: { scopeId_runId: { scopeId: SC, runId: run.id } } });
  return ep!.id;
};
const definition = (over: object = {}) => ({
  slug: "daily-close-check", version: "1.0.0", description: "بررسی وضعیت دستیار پیش از بستن روز",
  triggers: ["daily_close_requested"], allowedTools: ["get_ai_status", "set_ai_enabled"],
  steps: [{ tool: "get_ai_status", input: {} }], successCriteria: [{ type: "step_succeeded", step: 0 }], ...over,
});

d("material-cost profit: only with sufficient real data", () => {
  const profitRun = async (from: string, to: string) => {
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "calculate_profit_report", input: { from, to } } });
    const executed = await runtime.execute("owner", run.id);
    expect(executed.state).toBe("succeeded");
    return JSON.parse(executed.result!) as Record<string, unknown>;
  };
  const seedSold = async (productName: string, opts?: { noCost?: boolean; noRecipe?: boolean }) => {
    const cat = await db.category.create({ data: { slug: "c-" + randomUUID(), nameFa: "نوشیدنی" } });
    const product = await db.product.create({ data: { slug: "p-" + randomUUID(), nameFa: productName, price: 100000, description: "d", categoryId: cat.id } });
    if (!opts?.noRecipe) {
      const withCost = await db.ingredient.create({ data: { nameFa: "شیر " + randomUUID(), unit: "MILLILITER", stockQuantity: 5000, costPerUnit: opts?.noCost ? null : 10 } });
      await db.productIngredient.create({ data: { productId: product.id, ingredientId: withCost.id, quantity: 100, unit: "MILLILITER" } });
    }
    const order = await db.order.create({ data: { total: 100000, status: "COMPLETED", createdAt: new Date("2026-09-07T15:25:00Z") } });
    await db.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 2, price: 50000 } });
    return product;
  };

  it("computes real profit from recorded recipes and costs", async () => {
    await seedSold("لته تست");
    const r = await profitRun("2026-09-01T00:00:00Z", "2026-09-11T00:00:00Z");
    expect(r.available).toBe(true);
    expect(r.revenue).toBe(100000);
    expect(r.cost).toBe(2000); // 2 items × 100ml × 10 toman/ml
    expect(r.profit).toBe(98000);
    const { responseText } = await import("./responses");
    expect(responseText({ id: "x", state: "succeeded", result: JSON.stringify(r) } as never)).toContain("سود: 98000 تومان");
  });

  it("reports insufficiency honestly when a cost is unrecorded (no estimate)", async () => {
    await seedSold("بدون هزینه", { noCost: true });
    const r = await profitRun("2026-09-01T00:00:00Z", "2026-09-11T00:00:00Z");
    expect(r.available).toBe(false);
    expect(r.revenue).toBe(100000);
    expect(JSON.stringify(r.missing)).toContain("ثبت نشده");
    expect(r.profit).toBeUndefined();
    const { responseText } = await import("./responses");
    const text = responseText({ id: "x", state: "succeeded", result: JSON.stringify(r) } as never);
    expect(text).toContain("فرضی ارائه نمی‌شود");
    expect(text).toContain("100000");
  });

  it("reports a sold product without any recipe as insufficient data", async () => {
    await seedSold("بدون رسپی", { noRecipe: true });
    const r = await profitRun("2026-09-01T00:00:00Z", "2026-09-11T00:00:00Z");
    expect(r.available).toBe(false);
    expect(JSON.stringify(r.missing)).toContain("رسپی");
  });
});

d("skill drafts from corrective experience", () => {
  it("requires real in-scope episodes as learning source", async () => {
    await expect(runtime.createSkillDraft("owner", { ...definition(), sourceEpisodes: ["ghost"] })).rejects.toThrow("EVIDENCE_NOT_FOUND");
    const episodeId = await makeEpisode("برای بستن روز، دستیار باید فعال باشد");
    const draft = await runtime.createSkillDraft("owner", { ...definition(), sourceEpisodes: [episodeId] });
    expect(draft).toMatchObject({ status: "draft", createdBy: "owner", slug: "daily-close-check" });
    expect(JSON.parse(draft.sourceEpisodes)).toEqual([episodeId]);
  });
  it("rejects definitions with unknown, unallowed or invalid tool steps", () => {
    expect(skillDefinitionSchema.safeParse(definition({ allowedTools: ["shell"] })).success).toBe(false);
    expect(skillDefinitionSchema.safeParse(definition({ allowedTools: ["get_ai_status"], steps: [{ tool: "set_ai_enabled", input: { enabled: true } }] })).success).toBe(false);
    expect(skillDefinitionSchema.safeParse(definition({ steps: [{ tool: "get_ai_status", input: { rogue: 1 } }] })).success).toBe(false);
    expect(skillDefinitionSchema.safeParse(definition({ version: "1.0" })).success).toBe(false);
    expect(skillDefinitionSchema.safeParse(definition()).success).toBe(true);
  });
  it("denies non-privileged proposers", async () => {
    await expect(runtime.createSkillDraft("cashier", { ...definition(), sourceEpisodes: [] })).rejects.toThrow("FORBIDDEN");
  });
});

d("sandbox evaluation", () => {
  it("returns run-path-shaped receipts for every read tool (no sandbox divergence)", async () => {
    // Minimal live source rows so every read tool has real data.
    const cat = await db.category.create({ data: { slug: "hot-" + randomUUID(), nameFa: "نوشیدنی گرم" } });
    const product = await db.product.create({ data: { slug: "moka-" + randomUUID(), nameFa: "موکا", price: 140000, description: "قهوه", categoryId: cat.id } });
    const branch = await db.branch.create({ data: { cafeId: "cafe", slug: "b1-" + randomUUID(), nameFa: "شعبه یک" } });
    await db.cafeTable.create({ data: { number: "1", branchId: branch.id } });
    const table = await db.cafeTable.findFirstOrThrow({ where: { branchId: branch.id } });
    const qr = await db.qRCode.create({ data: { code: "T1-" + randomUUID(), branchId: branch.id, tableId: table.id } });
    const order = await db.order.create({ data: { total: 140000, status: "COMPLETED", createdAt: new Date("2026-09-07T15:25:00Z") } });
    await db.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 1, price: 140000 } });
    await db.ingredient.create({ data: { nameFa: "شیر", unit: "MILLILITER", stockQuantity: 1000 } });
    await db.staff.create({ data: { name: "رضا" } });
    await db.tableReservation.create({ data: { tableId: table.id, customerName: "مهمان", guests: 2, reservedAt: new Date(Date.now() + 86400000) } });
    await db.allergen.create({ data: { key: "dairy-" + randomUUID(), nameFa: "لبنیات", nameEn: "Dairy" } });

    const cases: Array<{ tool: string; input?: object }> = [
      { tool: "get_ai_status" }, { tool: "search_catalog", input: { query: "موکا" } }, { tool: "list_lessons" },
      { tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00Z", to: "2026-09-11T00:00:00Z" } },
      { tool: "get_order", input: { orderId: order.id } }, { tool: "list_orders" }, { tool: "get_product", input: { productId: product.id } },
      { tool: "list_inventory" }, { tool: "list_staff" }, { tool: "list_reservations" }, { tool: "list_products" },
      { tool: "list_categories" }, { tool: "list_tables" }, { tool: "list_qr_codes" }, { tool: "list_users" },
      { tool: "list_ratings" }, { tool: "list_allergens" },
    ];
    for (const c of cases) {
      // 1) governed run path
      const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: c.tool as never, input: (c.input ?? {}) as never } });
      const executed = await runtime.execute("owner", run.id);
      expect(executed.state).toBe(c.tool === "get_order" ? "succeeded" : "succeeded");
      const runReceipt = JSON.parse(executed.result!);
      // 2) skill sandbox on the same source
      const draft = await runtime.createSkillDraft("owner", {
        slug: "shape-parity-" + randomUUID().slice(0, 8), version: "1.0.0", description: "تساوی شکل خروجی sandbox و اجرا",
        triggers: ["shape_parity"], allowedTools: [c.tool], steps: [{ tool: c.tool, input: c.input ?? {} }], successCriteria: [{ type: "step_succeeded", step: 0 }],
      });
      const tested = await runtime.testSkill("owner", draft.id);
      const sandbox = JSON.parse(tested.testResult!);
      expect(sandbox.steps[0].mocked).toBe(false);
      expect(sandbox.steps[0].ok).toBe(true);
      // graphAsOf is a freshness watermark rewritten by each sync attempt; it
      // is not part of the receipt shape. Everything else must be identical.
      const a = { ...(JSON.parse(executed.result!) as Record<string, unknown>) };
      const b = { ...(sandbox.steps[0].result as Record<string, unknown>) };
      delete a.graphAsOf; delete b.graphAsOf;
      expect(b).toEqual(a);
    }
  });

  it("runs read steps for real and mocks writes without side effects", async () => {
    const episodeId = await makeEpisode();
    const draft = await runtime.createSkillDraft("owner", { ...definition({ steps: [{ tool: "get_ai_status", input: {} }, { tool: "set_ai_enabled", input: { enabled: true } }] }), sourceEpisodes: [episodeId] });
    await db.order.create({ data: { total: 7000, status: "COMPLETED", createdAt: new Date("2026-09-01T00:00:00Z") } });
    const tested = await runtime.testSkill("owner", draft.id);
    const result = JSON.parse(tested.testResult!);
    expect(result.passed).toBe(true);
    expect(result.steps.find((s: { tool: string }) => s.tool === "get_ai_status")).toMatchObject({ mocked: false, ok: true });
    expect(result.steps.find((s: { tool: string }) => s.tool === "set_ai_enabled")).toMatchObject({ mocked: true, detail: expect.stringContaining("no effect") });
    expect(await db.setting.count()).toBe(0);
  });
  it("activation gate blocks a failing evaluation before promotion", async () => {
    const episodeId = await makeEpisode();
    const draft = await runtime.createSkillDraft("owner", { ...definition(), sourceEpisodes: [episodeId] });
    // Simulate a recorded failing evaluation (read-step error path).
    await db.agentSkill.update({ where: { id: draft.id }, data: { testResult: JSON.stringify({ passed: false, steps: [{ tool: "get_ai_status", mocked: false, ok: false, detail: "STEP_ERROR" }] }), testedAt: new Date() } });
    await expect(runtime.controlSkill("owner", draft.id, "activate")).rejects.toThrow("EVALUATION_REQUIRED");
  });
});

d("promotion, rollback and governance", () => {
  it("activation requires a recorded passing evaluation and explicit ai.configure", async () => {
    const episodeId = await makeEpisode();
    const draft = await runtime.createSkillDraft("owner", { ...definition(), sourceEpisodes: [episodeId] });
    await expect(runtime.controlSkill("owner", draft.id, "activate")).rejects.toThrow("EVALUATION_REQUIRED");
    await expect(runtime.controlSkill("cashier", draft.id, "activate")).rejects.toThrow("FORBIDDEN");
    await runtime.testSkill("owner", draft.id);
    const active = await runtime.controlSkill("owner", draft.id, "activate");
    expect(active).toMatchObject({ status: "active", activatedBy: "owner" });
    await expect(runtime.controlSkill("owner", draft.id, "activate")).rejects.toThrow("INVALID_STATE");
  });
  it("keeps legacy free-text criteria versions visibly unverified (unevaluable)", async () => {
    const episodeId = await makeEpisode();
    // Plain-string criteria = legacy shape: schema accepts, evaluation cannot.
    const draft = await runtime.createSkillDraft("owner", { ...definition({ successCriteria: ["status_reported"] }), sourceEpisodes: [episodeId] });
    const tested = await runtime.testSkill("owner", draft.id);
    const result = JSON.parse(tested.testResult!);
    expect(result.evaluated).toBe(false);
    expect(result.passed).toBe(false);
    // Evaluation never passes for unevaluable criteria, so activation is
    // blocked at the EVALUATION_REQUIRED gate (CRITERIA_UNEVALUABLE is the
    // recorded marker; both codes keep the version visibly unverified).
    await expect(runtime.controlSkill("owner", draft.id, "activate")).rejects.toThrow(/EVALUATION_REQUIRED|CRITERIA_UNEVALUABLE/);
    // Migrating to a structured criterion makes it evaluable and activatable.
    const migrated = await runtime.createSkillDraft("owner", { ...definition({ version: "1.1.0" }), sourceEpisodes: [episodeId] });
    await runtime.testSkill("owner", migrated.id);
    const active = await runtime.controlSkill("owner", migrated.id, "activate");
    expect(active).toMatchObject({ status: "active", version: "1.1.0" });
  });
  it("new version retires the old one and rollback reactivates it explicitly", async () => {
    const episodeId = await makeEpisode();
    const v1 = await runtime.createSkillDraft("owner", { ...definition(), version: "1.0.0", sourceEpisodes: [episodeId] });
    await runtime.testSkill("owner", v1.id); await runtime.controlSkill("owner", v1.id, "activate");
    const v2 = await runtime.createSkillDraft("owner", { ...definition({ description: "نسخه دوم با شرط بیشتر" }), version: "1.1.0", sourceEpisodes: [episodeId] });
    await runtime.testSkill("owner", v2.id); await runtime.controlSkill("owner", v2.id, "activate");
    expect((await db.agentSkill.findUnique({ where: { id: v1.id } }))?.status).toBe("retired");
    const rolled = await runtime.rollbackSkill("owner", "daily-close-check");
    expect(rolled).toMatchObject({ status: "active", version: "1.0.0" });
    expect((await db.agentSkill.findUnique({ where: { id: v2.id } }))?.status).toBe("retired");
    await expect(runtime.rollbackSkill("cashier", "daily-close-check")).rejects.toThrow("FORBIDDEN");
  });
  it("deactivate and list respect state and permissions", async () => {
    const episodeId = await makeEpisode();
    const draft = await runtime.createSkillDraft("owner", { ...definition(), sourceEpisodes: [episodeId] });
    await runtime.testSkill("owner", draft.id); await runtime.controlSkill("owner", draft.id, "activate");
    await runtime.controlSkill("owner", draft.id, "deactivate");
    expect((await runtime.listSkills("owner", { slug: "daily-close-check" }))[0]).toMatchObject({ status: "retired" });
    await expect(runtime.listSkills("cashier")).rejects.toThrow("FORBIDDEN");
  });
});
