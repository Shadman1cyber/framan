import type { Prisma } from "@prisma/client";
import { OrderError } from "@/lib/orders";
import { orderEventKey, withdrawBatches } from "@/lib/business/inventory-flow";

type DB = Prisma.TransactionClient;

const scale: Record<string, { family: string; factor: number }> = {
  GRAM: { family: "mass", factor: 1 },
  KILOGRAM: { family: "mass", factor: 1000 },
  MILLILITER: { family: "volume", factor: 1 },
  LITER: { family: "volume", factor: 1000 },
  UNIT: { family: "count", factor: 1 },
};

export function recipeQuantityInStockUnit(quantity: number, recipeUnit: string, stockUnit: string): number {
  const from = scale[recipeUnit];
  const to = scale[stockUnit];
  if (!from || !to || from.family !== to.family || !Number.isFinite(quantity) || quantity <= 0) {
    throw new OrderError("INVALID_RECIPE", "مقدار یا واحد رسپی با مادهٔ انبار سازگار نیست");
  }
  const result = (quantity * from.factor) / to.factor;
  if (!Number.isFinite(result) || result <= 0) throw new OrderError("INVALID_RECIPE", "مقدار رسپی نامعتبر است");
  return result;
}

async function warn(db: DB, kind: string, severity: string, title: string, body: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const found = await db.aIInsight.findFirst({ where: { kind, title, createdAt: { gte: start } }, select: { id: true } });
  if (!found) await db.aIInsight.create({ data: { kind, severity, title, body } });
}

/** Called only inside the order status transaction, on PENDING -> CONFIRMED. */
export async function reserveOrderIngredients(db: DB, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { items: { select: { productId: true, quantity: true, product: { select: { nameFa: true, ingredients: { select: { quantity: true, unit: true, ingredient: { select: { id: true, nameFa: true, unit: true, stockQuantity: true, minQuantity: true, isActive: true } } } } } } } } },
  });
  if (!order) throw new OrderError("NOT_FOUND", "سفارش پیدا نشد");

  const totals = new Map<string, { ingredient: typeof order.items[number]["product"]["ingredients"][number]["ingredient"]; quantity: number }>();
  for (const item of order.items) {
    const recipe = item.product.ingredients;
    if (!recipe.length || recipe.some((r) => r.quantity <= 0)) {
      await warn(db, "INVENTORY", "WARNING", `رسپی ${item.product.nameFa} کامل نیست`, `برای سفارش ${orderId} برداشت خودکار این محصول انجام نشد؛ مقدار مواد رسپی را تکمیل کنید.`);
      continue;
    }
    for (const row of recipe) {
      const ingredient = row.ingredient;
      if (!ingredient.isActive) throw new OrderError("INACTIVE_INGREDIENT", `مادهٔ ${ingredient.nameFa} غیرفعال است`);
      const quantity = recipeQuantityInStockUnit(row.quantity * item.quantity, row.unit, ingredient.unit);
      const previous = totals.get(ingredient.id);
      totals.set(ingredient.id, { ingredient, quantity: (previous?.quantity ?? 0) + quantity });
    }
  }

  const used: { ingredientId: string; quantity: number; unit: string }[] = [];
  for (const { ingredient, quantity } of totals.values()) {
    const expired = await db.inventoryBatch.aggregate({
      where: { ingredientId: ingredient.id, expiresAt: { lt: new Date() }, remainingQuantity: { gt: 0 } },
      _sum: { remainingQuantity: true },
    });
    if (ingredient.stockQuantity - (expired._sum.remainingQuantity ?? 0) < quantity) {
      throw new OrderError("INSUFFICIENT_STOCK", `موجودی سالم ${ingredient.nameFa} برای تأیید سفارش کافی نیست`);
    }
    // Conditional update prevents concurrent confirmations from overdrawing stock.
    const changed = await db.ingredient.updateMany({
      where: { id: ingredient.id, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (changed.count !== 1) throw new OrderError("INSUFFICIENT_STOCK", `موجودی ${ingredient.nameFa} برای تأیید سفارش کافی نیست`);
    const usage = await db.orderIngredientUsage.create({ data: { orderId, ingredientId: ingredient.id, quantity, unit: ingredient.unit } });
    const allocations = await withdrawBatches(db, ingredient.id, quantity, true);
    if (allocations.length) await db.inventoryBatchAllocation.createMany({ data: allocations.map((a) => ({ usageId: usage.id, ...a })) });
    used.push({ ingredientId: ingredient.id, quantity, unit: ingredient.unit });
    const current = await db.ingredient.findUnique({ where: { id: ingredient.id }, select: { stockQuantity: true } });
    const after = current!.stockQuantity;
    await db.inventoryEvent.create({ data: {
      operationKey: orderEventKey(orderId, ingredient.id, "RESERVE"), ingredientId: ingredient.id,
      kind: "RESERVE", delta: -quantity, before: after + quantity, after,
      reason: `رزرو مواد سفارش ${orderId}`, orderId,
      allocations: allocations.length ? JSON.stringify(allocations) : null,
    } });
    if (ingredient.minQuantity != null && after <= ingredient.minQuantity) {
      await warn(db, "INVENTORY", after <= 0 ? "CRITICAL" : "WARNING", `موجودی ${ingredient.nameFa} کم است`, `پس از سفارش ${orderId} موجودی ${ingredient.nameFa} به ${after} ${ingredient.unit} رسید؛ حداقل ${ingredient.minQuantity} است.`);
    }
  }
  return used;
}

export async function finishOrderIngredients(db: DB, orderId: string, status: "COMPLETED" | "CANCELLED") {
  const usages = await db.orderIngredientUsage.findMany({ where: { orderId, state: "RESERVED" } });
  for (const usage of usages) {
    const changed = await db.orderIngredientUsage.updateMany({ where: { id: usage.id, state: "RESERVED" }, data: { state: status === "COMPLETED" ? "CONSUMED" : "RELEASED" } });
    if (changed.count === 1 && status === "CANCELLED") {
      const before = (await db.ingredient.findUniqueOrThrow({ where: { id: usage.ingredientId }, select: { stockQuantity: true } })).stockQuantity;
      await db.ingredient.update({ where: { id: usage.ingredientId }, data: { stockQuantity: { increment: usage.quantity } } });
      const allocations = await db.inventoryBatchAllocation.findMany({ where: { usageId: usage.id } });
      for (const allocation of allocations) {
        await db.inventoryBatch.update({ where: { id: allocation.batchId }, data: { remainingQuantity: { increment: allocation.quantity } } });
      }
      await db.inventoryEvent.create({ data: {
        operationKey: orderEventKey(orderId, usage.ingredientId, "RELEASE"), ingredientId: usage.ingredientId,
        kind: "RELEASE", delta: usage.quantity, before, after: before + usage.quantity,
        reason: `لغو سفارش ${orderId}`, orderId,
        allocations: allocations.length ? JSON.stringify(allocations.map((a) => ({ batchId: a.batchId, quantity: a.quantity }))) : null,
      } });
    }
  }
}
