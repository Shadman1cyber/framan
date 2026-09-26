import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { transitionOrderAtomic } from "@/lib/business/orders-write";
import { getInventoryStatus } from "@/lib/analytics";
import { suggestStaffPerHour } from "@/lib/operations";

if (!process.env.DATABASE_URL?.includes("farman_n8n_scenarios_test")) {
  throw new Error("This script only runs against farman_n8n_scenarios_test");
}

const db = new PrismaClient();

function tehranYesterdayAt(hour: number): Date {
  const local = new Date(Date.now() + 210 * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1, hour) - 210 * 60_000);
}

async function main() {
  const slug = `n8n-test-${Date.now()}`;
  const category = await db.category.create({ data: { slug, nameFa: "دادهٔ آزمایشی n8n" } });
  const ingredient = await db.ingredient.create({ data: {
    nameFa: "چای سیاه آزمایشی", unit: "GRAM", stockQuantity: 100, minQuantity: 50,
  } });
  const tea = await db.product.create({ data: {
    slug: `${slug}-tea`, nameFa: "چای سیاه آزمایشی", description: "فقط برای سناریوی تست",
    price: 100000, categoryId: category.id,
    ingredients: { create: { ingredientId: ingredient.id, quantity: 5, unit: "GRAM" } },
  } });
  const noRecipe = await db.product.create({ data: {
    slug: `${slug}-no-recipe`, nameFa: "آیتم بدون رسپی آزمایشی", description: "فقط برای سناریوی تست",
    price: 100000, categoryId: category.id,
  } });

  async function order(productId: string, quantity: number, hour: number) {
    return db.order.create({ data: {
      total: 100000 * quantity, createdAt: tehranYesterdayAt(hour),
      items: { create: { productId, quantity, price: 100000 } },
    } });
  }

  const first = await order(tea.id, 2, 9);
  const firstReceipt = await db.$transaction(tx => transitionOrderAtomic(tx, first.id, "CONFIRMED"));
  assert.deepEqual(firstReceipt.receipt.ingredientUsage, [{ ingredientId: ingredient.id, quantity: 10, unit: "GRAM" }]);
  assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stockQuantity, 90);

  const second = await order(tea.id, 1, 9);
  await db.$transaction(tx => transitionOrderAtomic(tx, second.id, "CONFIRMED"));
  const evening: string[] = [];
  for (let i = 0; i < 8; i++) {
    const created = await order(tea.id, 1, 18);
    await db.$transaction(tx => transitionOrderAtomic(tx, created.id, "CONFIRMED"));
    evening.push(created.id);
  }

  const stock = await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(stock.stockQuantity, 45);
  const low = (await getInventoryStatus()).find(row => row.ingredientId === ingredient.id);
  assert.equal(low?.isLow, true);
  assert.ok(await db.aIInsight.findFirst({ where: { kind: "INVENTORY", title: `موجودی ${ingredient.nameFa} کم است` } }));

  const to = new Date();
  const staffing = await suggestStaffPerHour(new Date(to.getTime() - 14 * 86400000), to);
  const peak = staffing.hours.find(row => row.hour === 18);
  assert.deepEqual({ orders: peak?.avgOrders, staff: peak?.suggested, peak: peak?.peak }, { orders: 8, staff: 2, peak: true });
  assert.equal(staffing.hours.find(row => row.hour === 9)?.suggested, 1);

  const missing = await order(noRecipe.id, 1, 12);
  await db.$transaction(tx => transitionOrderAtomic(tx, missing.id, "CONFIRMED"));
  assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stockQuantity, 45);
  assert.ok(await db.aIInsight.findFirst({ where: { kind: "INVENTORY", title: `رسپی ${noRecipe.nameFa} کامل نیست` } }));

  await db.$transaction(tx => transitionOrderAtomic(tx, evening[0], "CANCELLED"));
  assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stockQuantity, 50);
  await db.$transaction(tx => transitionOrderAtomic(tx, first.id, "PREPARING"));
  await db.$transaction(tx => transitionOrderAtomic(tx, first.id, "READY"));
  await db.$transaction(tx => transitionOrderAtomic(tx, first.id, "COMPLETED"));
  assert.equal((await db.orderIngredientUsage.findFirstOrThrow({ where: { orderId: first.id } })).state, "CONSUMED");

  const shortage = await order(tea.id, 100, 18);
  await assert.rejects(db.$transaction(tx => transitionOrderAtomic(tx, shortage.id, "CONFIRMED")), { code: "INSUFFICIENT_STOCK" });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: shortage.id } })).status, "PENDING");

  console.log(JSON.stringify({
    database: "farman_n8n_scenarios_test", categoryId: category.id, teaId: tea.id,
    firstOrderDeductionGrams: 10, stockAfterTenOrdersGrams: 45,
    lowStockAlert: true, peakHourTehran: 18, averageOrdersAtPeak: 8, suggestedStaffAtPeak: 2,
    missingRecipeAlert: true, stockAfterCancellationGrams: 50,
    completionState: "CONSUMED", shortageRejected: true,
  }));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
