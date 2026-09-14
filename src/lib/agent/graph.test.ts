import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";
import { graphFreshness, syncGraph } from "./graph/sync";
import { RETRIEVAL_BUDGET, searchCatalog } from "./graph/retrieval";

const dir = mkdtempSync(join(tmpdir(), "farman-graph-test-"));
const url = `file:${join(dir, "test.db")}`;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const runtime = new AgentRuntime(db);
const env = { ...process.env };
const SC = "cafe";
const sync = () => db.$transaction(db => syncGraph(db, SC));

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.cafe.create({ data: { id: SC, slug: "test", nameFa: "تست" } });
  await db.user.create({ data: { id: "owner", role: "OWNER" } });
}, 30000);
beforeEach(async () => {
  process.env.AGENT_ENABLED = "true"; process.env.AGENT_CAFE_ID = SC; process.env.AI_ENABLED = "false";
  await db.graphEdge.deleteMany(); await db.graphNode.deleteMany(); await db.graphSync.deleteMany();
  await db.productDietaryTag.deleteMany(); await db.productAllergen.deleteMany(); await db.productIngredient.deleteMany();
  await db.order.deleteMany(); await db.product.deleteMany(); await db.dietaryTag.deleteMany();
  await db.allergen.deleteMany(); await db.ingredient.deleteMany(); await db.category.deleteMany(); await db.setting.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

const seedCatalog = async () => {
  const category = await db.category.create({ data: { slug: "hot", nameFa: "نوشیدنی گرم", nameEn: "Hot" } });
  const allergen = await db.allergen.create({ data: { key: "milk", nameFa: "شیر", nameEn: "Milk" } });
  const ingredient = await db.ingredient.create({ data: { nameFa: "شیر پرچرب", nameEn: "Whole milk" } });
  const tag = await db.dietaryTag.create({ data: { key: "veg", nameFa: "گیاهی", nameEn: "Vegetarian" } });
  const product = await db.product.create({
    data: { slug: "latte", nameFa: "لاته", nameEn: "Latte", description: "قهوه با شیر", price: 89000, categoryId: category.id },
  });
  await db.productAllergen.create({ data: { productId: product.id, allergenId: allergen.id } });
  await db.productIngredient.create({ data: { productId: product.id, ingredientId: ingredient.id } });
  await db.productDietaryTag.create({ data: { productId: product.id, dietaryTagId: tag.id } });
  return { category, allergen, ingredient, tag, product };
};

describe("graph synchronization", () => {
  it("backfills nodes and edges with full provenance and watermarks", async () => {
    const { product } = await seedCatalog();
    await sync();
    const node = await db.graphNode.findUnique({ where: { scopeId_kind_refId: { scopeId: SC, kind: "Product", refId: product.id } } });
    expect(node).toMatchObject({ sourceId: `Product:${product.id}`, status: "active", confidence: 1 });
    expect(node!.sourceVersion).toContain(product.updatedAt.toISOString());
    expect(await db.graphEdge.count({ where: { scopeId: SC, relation: "CONTAINS" } })).toBe(1);
    expect(await db.graphSync.count({ where: { scopeId: SC } })).toBe(5);
    expect((await graphFreshness(db, SC)).stale).toBe(false);
  });
  it("re-syncs incrementally without duplicating nodes", async () => {
    const { product } = await seedCatalog();
    await sync();
    await db.product.update({ where: { id: product.id }, data: { nameFa: "لاته ویژه" } });
    await sync();
    expect(await db.graphNode.count({ where: { scopeId: SC } })).toBe(5);
    expect((await db.graphNode.findUnique({ where: { scopeId_kind_refId: { scopeId: SC, kind: "Product", refId: product.id } } }))!.label).toBe("لاته ویژه");
  });
  it("skips events older than the watermark cursor", async () => {
    const { product } = await seedCatalog();
    await sync();
    // Simulate an out-of-order consumer: the cursor is ahead of a new source write.
    await db.graphSync.update({ where: { scopeId_entity: { scopeId: SC, entity: "Product" } }, data: { watermark: new Date(Date.now() + 86400000) } });
    await db.product.update({ where: { id: product.id }, data: { nameFa: "قدیمی" } });
    await sync();
    expect((await db.graphNode.findUnique({ where: { scopeId_kind_refId: { scopeId: SC, kind: "Product", refId: product.id } } }))!.label).toBe("لاته");
  });
  it("stale events never overwrite newer graph versions", async () => {
    const { product } = await seedCatalog();
    await db.graphNode.create({
      data: {
        id: randomUUID(), scopeId: SC, kind: "Product", refId: product.id, label: "نسخه آینده", searchText: "لاته",
        properties: "{}", sourceId: `Product:${product.id}`, sourceVersion: `${new Date(Date.now() + 86400000).toISOString()}:deadbeef`, observedAt: new Date(), validFrom: new Date(),
      },
    });
    await sync();
    expect((await db.graphNode.findUnique({ where: { scopeId_kind_refId: { scopeId: SC, kind: "Product", refId: product.id } } }))!.label).toBe("نسخه آینده");
  });
  it("propagates deletions to nodes and edges", async () => {
    const { product } = await seedCatalog();
    await sync();
    await db.product.delete({ where: { id: product.id } });
    await sync();
    const node = await db.graphNode.findUnique({ where: { scopeId_kind_refId: { scopeId: SC, kind: "Product", refId: product.id } } });
    expect(node).toMatchObject({ status: "deleted" });
    expect(node!.validTo).not.toBeNull();
    expect(await db.graphEdge.count({ where: { scopeId: SC, status: "active" } })).toBe(0);
    const fresh = await db.$transaction(tx => searchCatalog(tx, SC, "لاته"));
    expect(fresh.count).toBe(0);
  });
  it("never surfaces expired nodes", async () => {
    const { product } = await seedCatalog();
    await sync();
    await db.graphNode.update({ where: { scopeId_kind_refId: { scopeId: SC, kind: "Product", refId: product.id } }, data: { validTo: new Date(Date.now() - 1000) } });
    expect((await db.$transaction(tx => searchCatalog(tx, SC, "لاته"))).count).toBe(0);
  });
  it("bounds retrieval to the configured budget", async () => {
    const category = await db.category.create({ data: { slug: "hot", nameFa: "گرم" } });
    for (let i = 0; i < 25; i++) await db.product.create({ data: { slug: `tea-${i}`, nameFa: `چای ${i}`, description: "چای", price: 1000 + i, categoryId: category.id } });
    await sync();
    // 20 direct matches + at most one 1-hop neighbor (the category) — the
    // budget stays bounded, neighbors included (R09).
    const r = await db.$transaction(tx => searchCatalog(tx, SC, "چای"));
    expect(r.count).toBeLessThanOrEqual(RETRIEVAL_BUDGET.candidates + RETRIEVAL_BUDGET.neighbors);
    expect(r.count).toBeGreaterThanOrEqual(20);
  });
});

describe("search_catalog agent tool", () => {
  it("runs end-to-end with provenance, relations and freshness", async () => {
    await seedCatalog();
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "search_catalog", input: { query: "لاته" } } });
    expect(run.state).toBe("queued");
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!);
    expect(result).toMatchObject({ synced: true, stale: false, source: "Graph:catalog", verified: true });
    // direct product match first (no via marker) + 1-hop neighbors (via: neighbor)
    const hit = result.results[0];
    expect(hit).toMatchObject({ kind: "Product", sourceId: `Product:${hit.refId}` });
    expect(hit.via).toBeUndefined();
    expect(hit.relations.map((r: { relation: string }) => r.relation)).toEqual(expect.arrayContaining(["BELONGS_TO", "CONTAINS", "USES", "TAGGED"]));
    expect(hit.observedAt).toBeTruthy();
    const neighbor = result.results.find((r: { via?: string }) => r.via === "neighbor");
    expect(neighbor).toBeTruthy();
    expect(neighbor.sourceId).toBeTruthy();
  });
  it("rejects queries that are too short and denied identities", async () => {
    await expect(runtime.create("owner", { key: randomUUID(), proposal: { tool: "search_catalog", input: { query: "ل" } } })).rejects.toThrow();
    await expect(runtime.create("cashier", { key: randomUUID(), proposal: { tool: "search_catalog", input: { query: "لاته" } } })).rejects.toThrow("FORBIDDEN");
  });
  it("keeps financial answers on the live source, not the graph", async () => {
    await seedCatalog();
    await sync();
    await db.order.create({ data: { total: 5000, status: "COMPLETED", createdAt: new Date("2026-09-01T00:00:00Z") } });
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z" } } });
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!);
    expect(result).toMatchObject({ total: 5000, source: "Order:COMPLETED" });
    expect(result.source).not.toContain("Graph");
  });
});
