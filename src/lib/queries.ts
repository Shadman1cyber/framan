import { prisma } from "@/lib/db";
import { cached, cacheKeys, CACHE_TTL } from "@/lib/cache";

export type PublicProduct = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  description: string;
  price: number;
  image: string | null;
  isFeatured: boolean;
  isAvailable: boolean;
  category: { id: string; slug: string; nameFa: string };
  ingredients: Array<{ id: string; nameFa: string }>;
  allergens: Array<{ id: string; key: string; nameFa: string; icon: string | null }>;
  dietaryTags: Array<{ id: string; key: string; nameFa: string; icon: string | null }>;
  coffeeLines: Array<{ id: string; nameFa: string; price: number }>;
  images: Array<{ id: string; url: string; isPrimary: boolean }>;
  ratingAvg: number | null;
  ratingCount: number;
  allergenStatus: "CONTAINS" | "FREE";
};

export type PublicCategory = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  icon: string | null;
  description: string | null;
  image: string | null;
  order: number;
  productCount: number;
};

type ProductWithRelations = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  description: string;
  price: number;
  image: string | null;
  isFeatured: boolean;
  isAvailable: boolean;
  category: { id: string; slug: string; nameFa: string };
  ingredients: Array<{ ingredient: { id: string; nameFa: string } }>;
  allergens: Array<{ allergen: { id: string; key: string; nameFa: string; icon: string | null } }>;
  dietaryTags: Array<{
    dietaryTag: { id: string; key: string; nameFa: string; icon: string | null };
  }>;
  coffeeLines: Array<{ coffeeLine: { id: string; nameFa: string }; price: number }>;
  images: Array<{ id: string; url: string; isPrimary: boolean }>;
  ratings: Array<{ rating: number }>;
};

// NOTE: internal recipe quantities (ProductIngredient.quantity) are never selected here.
const productInclude = {
  category: { select: { id: true, slug: true, nameFa: true } },
  ingredients: { include: { ingredient: { select: { id: true, nameFa: true } } } },
  allergens: { include: { allergen: { select: { id: true, key: true, nameFa: true, icon: true } } } },
  dietaryTags: { include: { dietaryTag: { select: { id: true, key: true, nameFa: true, icon: true } } } },
  coffeeLines: {
    where: { isActive: true, coffeeLine: { isActive: true } },
    select: { price: true, coffeeLine: { select: { id: true, nameFa: true } } },
    orderBy: { price: "asc" },
  },
  images: { select: { id: true, url: true, isPrimary: true }, orderBy: { order: "asc" } },
  ratings: { select: { rating: true } },
};

function mapProduct(p: ProductWithRelations): PublicProduct {
  const ratings = p.ratings ?? [];
  const ratingAvg = ratings.length
    ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
    : null;
  const primaryImage = p.images?.find((i) => i.isPrimary)?.url ?? p.images?.[0]?.url ?? null;
  return {
    id: p.id,
    slug: p.slug,
    nameFa: p.nameFa,
    nameEn: p.nameEn,
    description: p.description,
    price: p.price,
    image: p.image ?? primaryImage,
    isFeatured: p.isFeatured,
    isAvailable: p.isAvailable,
    category: p.category,
    ingredients: (p.ingredients ?? []).map((pi) => pi.ingredient),
    allergens: (p.allergens ?? []).map((pa) => pa.allergen),
    dietaryTags: (p.dietaryTags ?? []).map((pd) => pd.dietaryTag),
    coffeeLines: (p.coffeeLines ?? []).map((cl) => ({
      id: cl.coffeeLine.id,
      nameFa: cl.coffeeLine.nameFa,
      price: cl.price,
    })),
    images: (p.images ?? []).map((i) => ({ id: i.id, url: i.url, isPrimary: i.isPrimary })),
    ratingAvg,
    ratingCount: ratings.length,
    allergenStatus: (p.allergens ?? []).length > 0 ? "CONTAINS" : "FREE",
  };
}

export async function getCategories(): Promise<PublicCategory[]> {
  return cached(cacheKeys.categories, CACHE_TTL.MENU, async () => {
    const cats = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameFa: c.nameFa,
      nameEn: c.nameEn,
      icon: c.icon,
      description: c.description,
      image: c.image,
      order: c.order,
      productCount: c._count.products,
    }));
  });
}

export async function getProducts(opts: {
  categorySlug?: string;
  search?: string;
  limit?: number;
} = {}): Promise<PublicProduct[]> {
  const key = cacheKeys.products(opts);
  return cached(key, CACHE_TTL.MENU, async () => {
    const products = await prisma.product.findMany({
      where: {
        isAvailable: true,
        ...(opts.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
        ...(opts.search
          ? {
              OR: [
                { nameFa: { contains: opts.search } },
                { nameEn: { contains: opts.search } },
                { description: { contains: opts.search } },
              ],
            }
          : {}),
      },
      orderBy: [{ isFeatured: "desc" }, { order: "asc" }],
      include: productInclude as never,
      take: opts.limit ?? 100,
    });
    return products.map((p) => mapProduct(p as unknown as ProductWithRelations));
  });
}

export async function getProductBySlug(slug: string): Promise<PublicProduct | null> {
  return cached(cacheKeys.productSlug(slug), CACHE_TTL.PRODUCT, async () => {
    const p = await prisma.product.findUnique({
      where: { slug },
      include: productInclude as never,
    });
    if (!p) return null;
    return mapProduct(p as unknown as ProductWithRelations);
  });
}

export async function getProductById(id: string): Promise<PublicProduct | null> {
  return cached(cacheKeys.productId(id), CACHE_TTL.PRODUCT, async () => {
    const p = await prisma.product.findUnique({
      where: { id },
      include: productInclude as never,
    });
    if (!p) return null;
    return mapProduct(p as unknown as ProductWithRelations);
  });
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function getAllergens() {
  return cached(cacheKeys.allergens, CACHE_TTL.MENU, () =>
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" } }),
  );
}

export async function getDietaryTags() {
  return cached(cacheKeys.dietaryTags, CACHE_TTL.MENU, () =>
    prisma.dietaryTag.findMany({ orderBy: { nameFa: "asc" } }),
  );
}

export async function getProductsByIds(ids: string[]): Promise<PublicProduct[]> {
  if (ids.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isAvailable: true },
    orderBy: [{ isFeatured: "desc" }, { order: "asc" }],
    include: productInclude as never,
  });
  return products.map((p) => mapProduct(p as unknown as ProductWithRelations));
}
