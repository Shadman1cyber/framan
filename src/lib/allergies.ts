import { prisma } from "./db";

/**
 * Allergen model has exactly two states (Rule 1):
 *   CONTAINS = حاوی است, FREE = حاوی نیست
 * A ProductAllergen row means the product CONTAINS that allergen.
 */
export type AllergenState = "CONTAINS" | "FREE";

export type ProductAllergyInfo = {
  productId: string;
  allergenStatus: AllergenState;
  conflictingAllergens: Array<{
    allergenId: string;
    key: string;
    nameFa: string;
  }>;
};

export async function buildAllergyInfoForProducts(
  productIds: string[],
  userAllergenIds: string[] = [],
): Promise<Map<string, ProductAllergyInfo>> {
  const map = new Map<string, ProductAllergyInfo>();
  if (productIds.length === 0) return map;

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, allergenStatus: true },
  });

  const productAllergens = userAllergenIds.length
    ? await prisma.productAllergen.findMany({
        where: {
          productId: { in: productIds },
          allergenId: { in: userAllergenIds },
        },
        include: { allergen: true },
      })
    : [];

  const byProduct = new Map<string, typeof productAllergens>();
  for (const pa of productAllergens) {
    const list = byProduct.get(pa.productId) ?? [];
    list.push(pa);
    byProduct.set(pa.productId, list);
  }

  for (const p of products) {
    const conflicts = (byProduct.get(p.id) ?? []).map((pa) => ({
      allergenId: pa.allergenId,
      key: pa.allergen.key,
      nameFa: pa.allergen.nameFa,
    }));
    map.set(p.id, {
      productId: p.id,
      allergenStatus:
        p.allergenStatus === "CONTAINS" ? "CONTAINS" : "FREE",
      conflictingAllergens: conflicts,
    });
  }
  return map;
}

export type ProductAllergyFilter = "ALL" | "SAFE";

export function isProductSafe(info: ProductAllergyInfo): boolean {
  if (info.allergenStatus === "CONTAINS") return false;
  if (info.conflictingAllergens.length > 0) return false;
  return true;
}

export function isProductConflicting(info: ProductAllergyInfo): boolean {
  return info.conflictingAllergens.length > 0;
}

export function applyAllergyFilter(
  products: Array<{ id: string }>,
  infos: Map<string, ProductAllergyInfo>,
  filter: ProductAllergyFilter,
): Array<{ id: string }> {
  if (filter === "ALL") return products;
  return products.filter((p) => {
    const info = infos.get(p.id);
    if (!info) return true;
    return isProductSafe(info);
  });
}

export function filterBySelectedAllergens<T extends { id: string }>(
  products: T[],
  infos: Map<string, ProductAllergyInfo>,
  selectedAllergenIds: string[],
): T[] {
  if (selectedAllergenIds.length === 0) return products;
  const selected = new Set(selectedAllergenIds);
  return products.filter((p) => {
    const info = infos.get(p.id);
    if (!info) return true;
    return info.conflictingAllergens.every((c) => !selected.has(c.allergenId));
  });
}
