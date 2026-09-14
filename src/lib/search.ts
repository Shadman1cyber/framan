import { prisma } from "./db";
import { normalizeFa } from "./search-normalize";
import { getProducts, type PublicProduct } from "./queries";

export { normalizeFa } from "./search-normalize";

export type SearchHit = {
  type: "product" | "category" | "ingredient";
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchSuggestion = SearchHit & { image: string | null; price: number | null };

/**
 * Full in-memory search over the (small) menu with Persian text normalization.
 * Correctly handles Arabic/Persian Kaf/Yeh variants and diacritics.
 */
export async function searchProducts(query: string, limit = 30): Promise<PublicProduct[]> {
  const q = normalizeFa(query);
  if (!q) return [];
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: {
      id: true,
      nameFa: true,
      nameEn: true,
      description: true,
      ingredients: { include: { ingredient: { select: { nameFa: true } } } },
    },
    take: 500,
  });
  const matched = products
    .map((p) => {
      const name = normalizeFa(p.nameFa);
      const nameEn = normalizeFa(p.nameEn ?? "");
      const ingredients = normalizeFa(p.ingredients.map((pi) => pi.ingredient.nameFa).join(" "));
      let score = 0;
      if (name.includes(q)) score += name.startsWith(q) ? 100 : 60;
      if (nameEn.includes(q)) score += 50;
      if (ingredients.includes(q)) score += 25;
      if (normalizeFa(p.description).includes(q)) score += 10;
      return { id: p.id, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const all = await getProducts({ limit: 500 });
  return matched
    .map((m) => all.find((p) => p.id === m.id))
    .filter((p): p is PublicProduct => Boolean(p));
}

/** Fast autocomplete suggestions across products, categories and ingredient names. */
export async function getSuggestions(query: string, limit = 8): Promise<SearchSuggestion[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const nq = normalizeFa(q);

  const [products, categories, ingredients] = await Promise.all([
    prisma.product.findMany({
      where: { isAvailable: true },
      include: {
        category: { select: { nameFa: true } },
        images: { take: 1, orderBy: { order: "asc" } },
      },
      take: 500,
    }),
    prisma.category.findMany({ where: { isActive: true }, take: 100 }),
    prisma.ingredient.findMany({
      take: 500,
      include: {
        products: {
          where: { product: { isAvailable: true } },
          take: 1,
          select: { product: { select: { slug: true } } },
        },
      },
    }),
  ]);

  const hits: Array<SearchSuggestion & { score: number }> = [];

  for (const p of products) {
    const name = normalizeFa(p.nameFa);
    const nameEn = normalizeFa(p.nameEn ?? "");
    let score = 0;
    if (name.includes(nq)) score += name.startsWith(nq) ? 3 : 2;
    if (nameEn.includes(nq)) score += 2;
    if (score > 0) {
      hits.push({
        type: "product",
        id: p.id,
        slug: p.slug,
        title: p.nameFa,
        subtitle: p.category.nameFa,
        href: `/product/${p.slug}`,
        image: p.image ?? p.images[0]?.url ?? null,
        price: p.price,
        score,
      });
    }
  }

  for (const c of categories) {
    if (normalizeFa(c.nameFa).includes(nq) || normalizeFa(c.nameEn ?? "").includes(nq)) {
      hits.push({
        type: "category",
        id: c.id,
        slug: c.slug,
        title: c.nameFa,
        subtitle: "دسته‌بندی",
        href: `/menu/${c.slug}`,
        image: c.image,
        price: null,
        score: 2,
      });
    }
  }

  for (const ing of ingredients) {
    if (normalizeFa(ing.nameFa).includes(nq) || normalizeFa(ing.nameEn ?? "").includes(nq)) {
      const first = ing.products[0]?.product?.slug;
      if (!first) continue;
      hits.push({
        type: "ingredient",
        id: ing.id,
        slug: null,
        title: ing.nameFa,
        subtitle: "ترکیب",
        href: `/search?q=${encodeURIComponent(ing.nameFa)}`,
        image: null,
        price: null,
        score: 1,
      });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}
