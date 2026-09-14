import { OrderError } from "@/lib/orders";
import type { Prisma } from "@prisma/client";

type DB = Prisma.TransactionClient;

/**
 * Narrow price-update service (R05). Changes ONLY the current price of a
 * product or of one product/coffee-line pair. It deliberately does NOT reuse
 * the full product PUT route, which rebuilds unrelated associations
 * (ingredients/allergens/images/coffee-lines). Historical order-item prices
 * are never modified: past OrderItem.price rows are immutable records.
 */

export type PriceTarget =
  | { kind: "product"; productId: string; price: number }
  | { kind: "coffee_line"; productId: string; coffeeLineId: string; price: number };

export type PriceUpdateReceipt = {
  target: string;
  targetLabel: string;
  before: number;
  after: number;
  currency: "TOMAN";
  changedAt: string;
};

function assertPrice(price: number) {
  if (!Number.isSafeInteger(price) || price <= 0) {
    throw new OrderError("INVALID_PRICE", "قیمت باید عدد صحیح مثبت تومان باشد");
  }
}

export async function updatePrice(
  db: DB,
  target: PriceTarget,
  writeReceipt?: (receipt: PriceUpdateReceipt, tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ receipt: PriceUpdateReceipt }> {
  assertPrice(target.price);
  const tx = db;
  if (target.kind === "coffee_line") {
    const row = await tx.productCoffeeLine.findUnique({
      where: { productId_coffeeLineId: { productId: target.productId, coffeeLineId: target.coffeeLineId } },
      include: { product: { select: { nameFa: true } }, coffeeLine: { select: { nameFa: true } } },
    });
    if (!row) throw new OrderError("PRICE_TARGET_NOT_FOUND", "این خط قهوه برای محصول یافت نشد");
    const before = row.price;
    await tx.productCoffeeLine.update({ where: { id: row.id }, data: { price: target.price } });
    const receipt: PriceUpdateReceipt = {
      target: `ProductCoffeeLine:${row.id}`, targetLabel: `${row.product.nameFa} — خط ${row.coffeeLine.nameFa}`,
      before, after: target.price, currency: "TOMAN", changedAt: new Date().toISOString(),
    };
    if (writeReceipt) await writeReceipt(receipt, tx);
    return { receipt };
  }
  const product = await tx.product.findUnique({ where: { id: target.productId }, select: { id: true, nameFa: true, price: true } });
  if (!product) throw new OrderError("PRICE_TARGET_NOT_FOUND", "محصول یافت نشد");
  const before = product.price;
  await tx.product.update({ where: { id: product.id }, data: { price: target.price } });
  const receipt: PriceUpdateReceipt = {
    target: `Product:${product.id}`, targetLabel: product.nameFa,
    before, after: target.price, currency: "TOMAN", changedAt: new Date().toISOString(),
  };
  if (writeReceipt) await writeReceipt(receipt, tx);
  return { receipt };
}
