import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { postgresReachable, testDatabaseUrl } from "../test-db-url";
import { recordInventoryAction } from "./inventory-flow";

const url = testDatabaseUrl("inventory_flow");
const suite = postgresReachable() ? describe : describe.skip;

suite("inventory receipts and FEFO", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  let ingredientId: string;
  const actorId = "owner-test";
  const reason = "فاکتور آزمون";

  beforeAll(async () => {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    const ingredient = await db.ingredient.create({ data: { nameFa: "قهوه آزمون", unit: "GRAM", purchaseUnit: "کیسه", purchaseFactor: 1000 } });
    ingredientId = ingredient.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  it("converts purchases, preserves retries, withdraws earliest expiry, and records balances", async () => {
    const firstKey = randomUUID();
    const first = { ingredientId, kind: "PURCHASE" as const, quantity: 2, reason, operationKey: firstKey, actorId,
      expiresAt: new Date(Date.now() + 5 * 86400000), costPerPurchaseUnit: 300000 };
    await db.$transaction((tx) => recordInventoryAction(tx, first));
    await db.$transaction((tx) => recordInventoryAction(tx, first));
    await db.$transaction((tx) => recordInventoryAction(tx, { ...first, operationKey: randomUUID(), quantity: 1, expiresAt: new Date(Date.now() + 20 * 86400000) }));
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stockQuantity).toBe(3000);
    expect(await db.inventoryBatch.count({ where: { ingredientId } })).toBe(2);
    await db.$transaction((tx) => recordInventoryAction(tx, { ingredientId, kind: "WASTE", quantity: 500, reason: "دورریز آزمون", operationKey: randomUUID(), actorId }));
    const batches = await db.inventoryBatch.findMany({ where: { ingredientId }, orderBy: { expiresAt: "asc" } });
    expect(batches.map((b) => b.remainingQuantity)).toEqual([1500, 1000]);
    const events = await db.inventoryEvent.findMany({ where: { ingredientId }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ kind: "WASTE", before: 3000, after: 2500, delta: -500 });
  });

  it("rejects a withdrawal larger than stock without changing balances", async () => {
    await expect(db.$transaction((tx) => recordInventoryAction(tx, {
      ingredientId, kind: "WASTE", quantity: 3000, reason: "دورریز آزمون", operationKey: randomUUID(), actorId,
    }))).rejects.toMatchObject({ code: "NEGATIVE_STOCK" });
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stockQuantity).toBe(2500);
  });
});
