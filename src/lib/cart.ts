export type CartItemInput = {
  productId: string;
  quantity: number;
};

export type CartItemResolved = {
  productId: string;
  quantity: number;
  unitPrice: number;
  name: string;
  isAvailable: boolean;
};

export type CartValidationResult = {
  ok: boolean;
  items: CartItemResolved[];
  total: number;
  unavailable: string[];
  empty: boolean;
};

import { prisma } from "./db";

export async function validateAndPriceCart(
  items: CartItemInput[],
): Promise<CartValidationResult> {
  if (!items.length) {
    return { ok: true, items: [], total: 0, unavailable: [], empty: true };
  }
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, nameFa: true, isAvailable: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const resolved: CartItemResolved[] = [];
  const unavailable: string[] = [];
  for (const i of items) {
    const p = byId.get(i.productId);
    if (!p || i.quantity <= 0) continue;
    if (!p.isAvailable) {
      unavailable.push(p.nameFa);
      continue;
    }
    resolved.push({
      productId: p.id,
      quantity: i.quantity,
      unitPrice: p.price,
      name: p.nameFa,
      isAvailable: p.isAvailable,
    });
  }
  const total = resolved.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return {
    ok: unavailable.length === 0 && resolved.length > 0,
    items: resolved,
    total,
    unavailable,
    empty: resolved.length === 0,
  };
}

export function cartCount(items: Array<{ quantity: number }>): number {
  return items.reduce((s, i) => s + (i.quantity > 0 ? i.quantity : 0), 0);
}