import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "child_process";
import { postgresReachable, testDatabaseUrl } from "../test-db-url";
import { transitionOrderAtomic } from "./orders-write";
import { recipeQuantityInStockUnit } from "./order-ingredients";
import { recordInventoryAction } from "./inventory-flow";
import { randomUUID } from "node:crypto";

const url = testDatabaseUrl("inventory");
const suite = postgresReachable() ? describe : describe.skip;

suite("automatic recipe inventory", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  let productId: string;
  let ingredientId: string;

  beforeAll(async () => {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
      { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
    );
    const category = await db.category.create({ data: { slug: `inventory-test-${Date.now()}`, nameFa: "آزمون انبار" } });
    const ingredient = await db.ingredient.create({ data: { nameFa: "شیر آزمون", unit: "LITER", stockQuantity: 1, minQuantity: 0.6 } });
    const product = await db.product.create({ data: {
      slug: `inventory-product-${Date.now()}`, nameFa: "لاته آزمون", description: "آزمون", price: 100000, categoryId: category.id,
      ingredients: { create: { ingredientId: ingredient.id, quantity: 250, unit: "MILLILITER" } },
    } });
    productId = product.id;
    ingredientId = ingredient.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  async function order(quantity: number) {
    return db.order.create({ data: { total: 100000 * quantity, items: { create: { productId, quantity, price: 100000 } } } });
  }

  it("converts recipe units and rejects incompatible units", () => {
    expect(recipeQuantityInStockUnit(250, "MILLILITER", "LITER")).toBe(0.25);
    expect(() => recipeQuantityInStockUnit(2, "GRAM", "LITER")).toThrow();
  });

  it("deducts on confirmation, warns below minimum, and restores on cancellation", async () => {
    const created = await order(2);
    const confirmed = await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "CONFIRMED"));
    expect(confirmed.receipt.ingredientUsage).toEqual([{ ingredientId, quantity: 0.5, unit: "LITER" }]);
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stockQuantity).toBe(0.5);
    expect((await db.orderIngredientUsage.findFirstOrThrow({ where: { orderId: created.id } })).state).toBe("RESERVED");
    expect(await db.aIInsight.count({ where: { kind: "INVENTORY", severity: "WARNING" } })).toBeGreaterThan(0);
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "CANCELLED"));
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stockQuantity).toBe(1);
    expect((await db.orderIngredientUsage.findFirstOrThrow({ where: { orderId: created.id } })).state).toBe("RELEASED");
  });

  it("rejects insufficient stock without changing the order or inventory", async () => {
    const created = await order(5);
    await expect(db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "CONFIRMED"))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect((await db.order.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("PENDING");
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stockQuantity).toBe(1);
    expect(await db.orderIngredientUsage.count({ where: { orderId: created.id } })).toBe(0);
  });

  it("marks reserved ingredients consumed on completion", async () => {
    const created = await order(1);
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "CONFIRMED"));
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "PREPARING"));
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "READY"));
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "COMPLETED"));
    expect((await db.orderIngredientUsage.findFirstOrThrow({ where: { orderId: created.id } })).state).toBe("CONSUMED");
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stockQuantity).toBe(0.75);
  });

  it("allocates the earliest expiry batch and restores it when an order is cancelled", async () => {
    const category = await db.category.create({ data: { slug: `batch-${randomUUID()}`, nameFa: "آزمون بچ" } });
    const ingredient = await db.ingredient.create({ data: { nameFa: `قهوه ${randomUUID()}`, unit: "GRAM" } });
    const product = await db.product.create({ data: {
      slug: `batch-product-${randomUUID()}`, nameFa: "نوشیدنی آزمون", description: "آزمون", price: 1000, categoryId: category.id,
      ingredients: { create: { ingredientId: ingredient.id, quantity: 150, unit: "GRAM" } },
    } });
    for (const days of [20, 5]) {
      await db.$transaction((tx) => recordInventoryAction(tx, {
        ingredientId: ingredient.id, kind: "PURCHASE", quantity: 200, reason: "خرید آزمون",
        operationKey: randomUUID(), actorId: "owner-test", expiresAt: new Date(Date.now() + days * 86400000),
      }));
    }
    const created = await db.order.create({ data: { total: 1000, items: { create: { productId: product.id, quantity: 1, price: 1000 } } } });
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "CONFIRMED"));
    const batches = await db.inventoryBatch.findMany({ where: { ingredientId: ingredient.id }, orderBy: { expiresAt: "asc" } });
    expect(batches.map((b) => b.remainingQuantity)).toEqual([50, 200]);
    expect(await db.inventoryBatchAllocation.count({ where: { batchId: batches[0].id } })).toBe(1);
    await db.$transaction((tx) => transitionOrderAtomic(tx, created.id, "CANCELLED"));
    const restored = await db.inventoryBatch.findMany({ where: { ingredientId: ingredient.id }, orderBy: { expiresAt: "asc" } });
    expect(restored.map((b) => b.remainingQuantity)).toEqual([200, 200]);
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stockQuantity).toBe(400);
  });
});
