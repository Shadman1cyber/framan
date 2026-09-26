import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { OrderError } from "@/lib/orders";

type DB = Prisma.TransactionClient;
export type InventoryAction = "PURCHASE" | "WASTE" | "CORRECTION";

export type InventoryActionInput = {
  ingredientId: string;
  kind: InventoryAction;
  quantity: number;
  reason: string;
  operationKey: string;
  actorId: string;
  expiresAt?: Date | null;
  supplier?: string | null;
  costPerPurchaseUnit?: number | null;
};

const EPSILON = 0.000001;

export async function withdrawBatches(db: DB, ingredientId: string, quantity: number, skipExpired = false) {
  const batches = await db.inventoryBatch.findMany({
    where: { ingredientId, remainingQuantity: { gt: 0 } },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
  });
  batches.sort((a, b) => {
    if (!a.expiresAt) return b.expiresAt ? 1 : a.receivedAt.getTime() - b.receivedAt.getTime();
    if (!b.expiresAt) return -1;
    return a.expiresAt.getTime() - b.expiresAt.getTime() || a.receivedAt.getTime() - b.receivedAt.getTime();
  });
  const allocations: { batchId: string; quantity: number }[] = [];
  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= EPSILON) break;
    if (skipExpired && batch.expiresAt && batch.expiresAt.getTime() < Date.now()) continue;
    const take = Math.min(remaining, batch.remainingQuantity);
    const updated = await db.inventoryBatch.updateMany({
      where: { id: batch.id, remainingQuantity: { gte: take } },
      data: { remainingQuantity: { decrement: take } },
    });
    if (updated.count !== 1) throw new OrderError("STOCK_CONFLICT", "موجودی بچ تغییر کرده است؛ دوباره تلاش کنید");
    allocations.push({ batchId: batch.id, quantity: take });
    remaining -= take;
  }
  // Remaining quantity comes from stock that predates batch tracking.
  return allocations;
}

export async function recordInventoryAction(db: DB, input: InventoryActionInput) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) throw new OrderError("INVALID_REASON", "دلیل باید بین ۳ تا ۳۰۰ کاراکتر باشد");
  if (!Number.isFinite(input.quantity) || input.quantity === 0 || (input.kind !== "CORRECTION" && input.quantity < 0)) {
    throw new OrderError("INVALID_QUANTITY", "مقدار نامعتبر است");
  }
  const ingredient = await db.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ingredient || !ingredient.isActive) throw new OrderError("NOT_FOUND", "ماده اولیه فعال پیدا نشد");

  const amount = input.kind === "PURCHASE" ? input.quantity * ingredient.purchaseFactor : Math.abs(input.quantity);
  if (!Number.isFinite(amount) || amount <= 0) throw new OrderError("INVALID_QUANTITY", "مقدار تبدیل‌شده نامعتبر است");
  const delta = input.kind === "PURCHASE" ? amount : input.kind === "WASTE" ? -amount : input.quantity;
  const existing = await db.inventoryEvent.findUnique({ where: { operationKey: input.operationKey } });
  if (existing) {
    if (existing.ingredientId !== input.ingredientId || existing.kind !== input.kind || existing.delta !== delta || existing.reason !== reason) {
      throw new OrderError("IDEMPOTENCY_CONFLICT", "شناسه عملیات قبلاً با دادهٔ دیگری استفاده شده است");
    }
    return existing;
  }
  if (input.kind === "CORRECTION" && reason.length < 3) throw new OrderError("INVALID_REASON", "دلیل اصلاح لازم است");
  const before = ingredient.stockQuantity;
  const after = before + delta;
  if (after < -EPSILON) throw new OrderError("NEGATIVE_STOCK", "موجودی کافی نیست");

  const changed = await db.ingredient.updateMany({
    where: { id: ingredient.id, stockQuantity: delta < 0 ? { gte: amount } : before },
    data: { stockQuantity: delta < 0 ? { decrement: amount } : { increment: amount } },
  });
  if (changed.count !== 1) throw new OrderError("STOCK_CONFLICT", "موجودی تغییر کرده است؛ دوباره تلاش کنید");

  let allocations: { batchId: string; quantity: number }[] = [];
  if (input.kind === "PURCHASE") {
    const expiresAt = input.expiresAt ?? null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now())) {
      throw new OrderError("INVALID_EXPIRY", "تاریخ انقضا باید در آینده باشد");
    }
    if (input.costPerPurchaseUnit != null && (!Number.isFinite(input.costPerPurchaseUnit) || input.costPerPurchaseUnit < 0)) {
      throw new OrderError("INVALID_COST", "قیمت خرید نامعتبر است");
    }
    await db.inventoryBatch.create({ data: {
      ingredientId: ingredient.id, initialQuantity: amount, remainingQuantity: amount,
      costPerBaseUnit: input.costPerPurchaseUnit == null ? null : input.costPerPurchaseUnit / ingredient.purchaseFactor,
      supplier: input.supplier?.trim() || ingredient.supplier,
      expiresAt,
    } });
    if (input.costPerPurchaseUnit != null) {
      await db.ingredient.update({ where: { id: ingredient.id }, data: { costPerUnit: input.costPerPurchaseUnit / ingredient.purchaseFactor } });
    }
  } else if (delta < 0) {
    allocations = await withdrawBatches(db, ingredient.id, amount);
  }

  return db.inventoryEvent.create({ data: {
    operationKey: input.operationKey, ingredientId: ingredient.id, kind: input.kind,
    delta, before, after: Math.max(0, after), reason,
    actorId: input.actorId, allocations: allocations.length ? JSON.stringify(allocations) : null,
  } });
}

export function orderEventKey(orderId: string, ingredientId: string, kind: "RESERVE" | "RELEASE") {
  return `${kind}:${orderId}:${ingredientId}`;
}

export function newInventoryOperationKey() { return randomUUID(); }
