export type CartItemInput = {
  productId: string;
  quantity: number;
  coffeeLineId?: string | null;
};

export type CartItemResolved = {
  productId: string;
  quantity: number;
  unitPrice: number;
  coffeeLineId: string | null;
  coffeeLineName: string | null;
  optionPrice: number;
  name: string;
  prepBaseMin: number;
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
    select: {
      id: true,
      price: true,
      nameFa: true,
      isAvailable: true,
      prepBaseMin: true,
      coffeeLines: { where: { isActive: true }, select: { coffeeLineId: true, price: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Collect requested coffee lines and load their names.
  const requestedLineIds = Array.from(
    new Set(items.map((i) => i.coffeeLineId).filter((x): x is string => Boolean(x))),
  );
  const lines = requestedLineIds.length
    ? await prisma.coffeeLine.findMany({
        where: { id: { in: requestedLineIds }, isActive: true },
        select: { id: true, nameFa: true },
      })
    : [];
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const resolved: CartItemResolved[] = [];
  const unavailable: string[] = [];
  for (const i of items) {
    const p = byId.get(i.productId);
    if (!p || i.quantity <= 0) continue;
    if (!p.isAvailable) {
      unavailable.push(p.nameFa);
      continue;
    }

    let unitPrice = p.price;
    let coffeeLineId: string | null = null;
    let coffeeLineName: string | null = null;
    let optionPrice = 0;

    if (i.coffeeLineId) {
      const lineOption = p.coffeeLines.find((cl) => cl.coffeeLineId === i.coffeeLineId);
      const line = lineById.get(i.coffeeLineId);
      if (!lineOption || !line) {
        unavailable.push(p.nameFa);
        continue;
      }
      unitPrice = lineOption.price;
      coffeeLineId = line.id;
      coffeeLineName = line.nameFa;
      optionPrice = lineOption.price - p.price;
    }

    resolved.push({
      productId: p.id,
      quantity: i.quantity,
      unitPrice,
      coffeeLineId,
      coffeeLineName,
      optionPrice,
      name: p.nameFa,
      prepBaseMin: p.prepBaseMin,
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
