import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl, postgresReachable } from "../test-db-url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { syncGraph, graphFreshness } from "./graph/sync";

/** R09 regression: unchanged/empty catalog categories must not make a freshly
 *  synchronized graph immediately stale; neighbor nodes honor validity. */
const dir = mkdtempSync(join(tmpdir(), "farman-graph-fresh-"));
const url = testDatabaseUrl("graph-freshness");
const d = postgresReachable() ? describe : describe.skip;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.cafe.create({ data: { id: "cafe", slug: "test", nameFa: "تست" } });
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });
const env = { ...process.env };

d("graph freshness (R09)", () => {
  it("an unchanged catalog synced long ago stays fresh relative to sync time", async () => {
    // Source rows exist with old updatedAt; sync runs NOW.
    await db.category.create({ data: { id: "c1", slug: "coffee", nameFa: "قهوه", updatedAt: new Date(Date.now() - 10 * 86400000) } });
    await syncGraph(db, "cafe", new Date());
    const fresh = await graphFreshness(db, "cafe", 300);
    expect(fresh.stale).toBe(false);
    expect(fresh.asOf).not.toBeNull();
  });
  it("an EMPTY source kind does not poison freshness of a fresh sync", async () => {
    // DietaryTag table empty: watermark epoch must not poison min(); syncedAt is recent.
    const fresh = await graphFreshness(db, "cafe", 300);
    expect(fresh.stale).toBe(false);
  });
  it("a genuinely unsynced graph is stale", async () => {
    const stale = await graphFreshness(db, "other-scope", 300);
    expect(stale.stale).toBe(true);
    expect(stale.asOf).toBeNull();
  });
  it("neighbor nodes with expired validity never surface in retrieval", async () => {
    await db.category.createMany({ data: [{ id: "c2", slug: "tea", nameFa: "چای" }] });
    await db.product.create({ data: { id: "p1", slug: "chai", nameFa: "چای سیاه", description: "d", price: 90000, categoryId: "c2" } });
    await syncGraph(db, "cafe", new Date());
    const { searchCatalog } = await import("./graph/retrieval");
    const ok = await db.$transaction(tx => searchCatalog(tx, "cafe", "چای"));
    expect(ok.count).toBeGreaterThan(0);
    // Expire the product node directly, then retrieve: neither primary nor neighbor.
    await db.graphNode.updateMany({ where: { scopeId: "cafe", refId: "p1" }, data: { validTo: new Date(Date.now() - 1000) } });
    const filtered = await db.$transaction(tx => searchCatalog(tx, "cafe", "چای"));
    expect(filtered.results.some(r => r.refId === "p1")).toBe(false);
    expect(filtered.results.some(r => r.relations.some(rel => rel.other.label === "چای سیاه"))).toBe(false);
  });
});
