import { OrderError } from "@/lib/orders";
import { UNITS } from "@/lib/constants";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { withdrawBatches } from "@/lib/business/inventory-flow";

type DB = Prisma.TransactionClient;

/**
 * Single authoritative inventory-adjustment service shared by the admin UI
 * and the agent (R05). Every adjustment records before/after/delta and a
 * reason; the resulting quantity must be finite and >= 0; the ingredient's
 * existing unit is preserved. Historical adjustments are immutable rows.
 */

export type InventoryAdjustmentReceipt = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  before: number;
  delta: number;
  after: number;
  reason: string;
  changedAt: string;
};

export async function adjustInventory(
  db: DB,
  input: { ingredientId: string; delta: number; reason: string; allowNegativeDelta?: boolean },
  writeReceipt?: (receipt: InventoryAdjustmentReceipt, tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ receipt: InventoryAdjustmentReceipt }> {
  const { ingredientId, delta, reason } = input;
  if (!reason || reason.trim().length < 3 || reason.length > 300) {
    throw new OrderError("INVALID_REASON", "دلیل تعدیل باید بین ۳ تا ۳۰۰ کاراکتر باشد");
  }
  if (typeof delta !== "number" || !Number.isFinite(delta)) {
    throw new OrderError("INVALID_DELTA", "مقدار تغییر باید عدد محدود باشد");
  }
  if (delta === 0) throw new OrderError("INVALID_DELTA", "مقدار تغییر باید غیرصفر باشد");
  if (delta < 0 && !input.allowNegativeDelta) {
    throw new OrderError("NEGATIVE_DELTA_FORBIDDEN", "کاهش موجودی با مجوز صریح مجاز است");
  }
  const tx = db;
  const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ing) throw new OrderError("NOT_FOUND", "ماده اولیه یافت نشد");
  if (!ing.isActive) throw new OrderError("INACTIVE_INGREDIENT", "ماده اولیه غیرفعال است");
  const after = ing.stockQuantity + delta;
  if (!Number.isFinite(after)) throw new OrderError("INVALID_DELTA", "نتیجه تعدیل باید عدد محدود باشد");
  if (after < 0) throw new OrderError("NEGATIVE_STOCK", "موجودی نهایی نمی‌تواند منفی باشد");
  const changed = await tx.ingredient.updateMany({
    where: { id: ing.id, stockQuantity: ing.stockQuantity },
    data: { stockQuantity: { increment: delta } },
  });
  if (changed.count !== 1) throw new OrderError("STOCK_CONFLICT", "موجودی تغییر کرده است؛ دوباره تلاش کنید");
  const allocations = delta < 0 ? await withdrawBatches(tx, ing.id, -delta) : [];
  await tx.inventoryEvent.create({ data: {
    operationKey: randomUUID(), ingredientId: ing.id, kind: "CORRECTION", delta,
    before: ing.stockQuantity, after, reason: reason.trim(),
    allocations: allocations.length ? JSON.stringify(allocations) : null,
  } });
  const receipt: InventoryAdjustmentReceipt = {
    ingredientId: ing.id, ingredientName: ing.nameFa, unit: ing.unit,
    before: ing.stockQuantity, delta, after, reason: reason.trim(), changedAt: new Date().toISOString(),
  };
  if (writeReceipt) await writeReceipt(receipt, tx);
  return { receipt };
}

export const INVENTORY_UNITS = UNITS;
