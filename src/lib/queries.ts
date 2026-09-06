import { prisma } from "@/lib/db";

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
  allergens: Array<{
    id: string;
    key: string;
    nameFa: string;
    status: "CONTAINS" | "MAY_CONTAIN";
  }>;
  dietaryTags: Array<{ id: string; key: string; nameFa: string; icon: string | null }>;
  ratingAvg: number | null;
  ratingCount: number;
  allergenStatus: "CONTAINS" | "MAY_CONTAIN" | "UNKNOWN";
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
  allergens: Array<{
    allergen: { id: string; key: string; nameFa: string };
    status: string;
  }>;
  dietaryTags: Array<{
    dietaryTag: { id: string; key: string; nameFa: string; icon: string | null };
  }>;
  ratings: Array<{ rating: number }>;
};

function mapProduct(p: ProductWithRelations): PublicProduct {
  const ratings = p.ratings ?? [];
  const ratingAvg = ratings.length
    ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
    : null;
  return {
    id: p.id,
    slug: p.slug,
    nameFa: p.nameFa,
    nameEn: p.nameEn,
    description: p.description,
    price: p.price,
    image: p.image,
    isFeatured: p.isFeatured,
    isAvailable: p.isAvailable,
    category: p.category,
    ingredients: (p.ingredients ?? []).map((pi) => pi.ingredient),
    allergens: (p.allergens ?? []).map((pa) => ({
      id: pa.allergen.id,
      key: pa.allergen.key,
      nameFa: pa.allergen.nameFa,
      status: (pa.status as "CONTAINS" | "MAY_CONTAIN") ?? "CONTAINS",
    })),
    dietaryTags: (p.dietaryTags ?? []).map((pd) => pd.dietaryTag),
    ratingAvg,
    ratingCount: ratings.length,
    allergenStatus: (p as ProductWithRelations & { allergenStatus?: string })
      .allergenStatus as PublicProduct["allergenStatus"] ?? "UNKNOWN",
  };
}

export async function getCategories(): Promise<PublicCategory[]> {
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
}

export async function getProducts(opts: {
  categorySlug?: string;
  search?: string;
  limit?: number;
} = {}): Promise<PublicProduct[]> {
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
    include: {
      category: { select: { id: true, slug: true, nameFa: true } },
      ingredients: { include: { ingredient: true } },
      allergens: { include: { allergen: true } },
      dietaryTags: { include: { dietaryTag: true } },
      ratings: { select: { rating: true } },
    },
    take: opts.limit ?? 100,
  });
  return products.map(mapProduct);
}

export async function getProductBySlug(slug: string): Promise<PublicProduct | null> {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, slug: true, nameFa: true } },
      ingredients: { include: { ingredient: true } },
      allergens: { include: { allergen: true } },
      dietaryTags: { include: { dietaryTag: true } },
      ratings: { select: { rating: true } },
    },
  });
  if (!p) return null;
  return mapProduct(p);
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function getAllergens() {
  return prisma.allergen.findMany({ orderBy: { nameFa: "asc" } });
}

export async function getDietaryTags() {
  return prisma.dietaryTag.findMany({ orderBy: { nameFa: "asc" } });
}