import { prisma } from "./db";
import {
  buildAllergyInfoForProducts,
  isProductConflicting,
  isProductSafe,
  type ProductAllergyInfo,
} from "./allergies";

export type RecommendationUserContext = {
  userId?: string | null;
  favoriteCategories?: string[];
  favoriteIngredients?: string[];
  dislikedIngredients?: string[];
  dietaryPreferences?: string[];
};

export type RankedProduct = {
  id: string;
  score: number;
  reason: string;
  allergyInfo: ProductAllergyInfo;
};

export type RecommendationOptions = {
  limit?: number;
  excludeProductIds?: string[];
};

export type RecommendationStrategy = "ALL" | "FEATURED" | "POPULAR" | "PERSONAL";

export async function getRecommendations(
  context: RecommendationUserContext,
  strategy: RecommendationStrategy,
  options: RecommendationOptions = {},
): Promise<RankedProduct[]> {
  const userAllergenIds = context.userId
    ? (
        await prisma.userAllergy.findMany({
          where: { userId: context.userId },
          select: { allergenId: true },
        })
      ).map((u) => u.allergenId)
    : [];

  let products = await prisma.product.findMany({
    where: {
      isAvailable: true,
      ...(options.excludeProductIds?.length
        ? { id: { notIn: options.excludeProductIds } }
        : {}),
    },
    select: {
      id: true,
      isFeatured: true,
      category: { select: { slug: true, nameFa: true } },
      ingredients: { select: { ingredient: { select: { nameFa: true } } } },
      dietaryTags: { select: { dietaryTag: { select: { key: true } } } },
      ratings: { select: { rating: true } },
      _count: { select: { orderItems: true } },
    },
    take: 50,
  });

  if (strategy === "FEATURED") {
    products = products.filter((p) => p.isFeatured);
  }

  const allergyInfos = await buildAllergyInfoForProducts(
    products.map((p) => p.id),
    userAllergenIds,
  );

  const filtered = products.filter((p) => {
    const info = allergyInfos.get(p.id);
    if (!info) return true;
    if (isProductConflicting(info)) return false;
    return true;
  });

  const dislikedFiltered =
    strategy === "PERSONAL" && (context.dislikedIngredients?.length ?? 0) > 0
      ? filtered.filter((p) => {
          const ingredientNames = p.ingredients.map((pi) => pi.ingredient.nameFa);
          return !context.dislikedIngredients!.some((n) => ingredientNames.includes(n));
        })
      : filtered;

  const ranked: RankedProduct[] = dislikedFiltered.map((p) => {
    const allergyInfo = allergyInfos.get(p.id)!;
    let score = 0;
    const reasons: string[] = [];

    if (strategy === "PERSONAL") {
      if (
        context.favoriteCategories?.includes(p.category.slug)
      ) {
        score += 50;
        reasons.push("دسته‌ی مورد علاقه");
      }
      const ingredientNames = p.ingredients.map((pi) => pi.ingredient.nameFa);
      const favHits = (context.favoriteIngredients ?? []).filter((n) =>
        ingredientNames.includes(n),
      );
      if (favHits.length) {
        score += favHits.length * 20;
        reasons.push("مواد مورد علاقه");
      }
      const tagKeys = p.dietaryTags.map((d) => d.dietaryTag.key);
      const dietHits = (context.dietaryPreferences ?? []).filter((d) =>
        tagKeys.includes(d),
      );
      if (dietHits.length) {
        score += dietHits.length * 15;
        reasons.push("ترجیح غذایی");
      }
    }

    if (p.isFeatured) {
      score += 30;
      if (strategy !== "PERSONAL") reasons.push("پیشنهاد ویژه");
    }

    if (p.ratings.length) {
      const avg =
        p.ratings.reduce((s, r) => s + r.rating, 0) / p.ratings.length;
      score += avg * 8;
      if (avg >= 4 && strategy === "POPULAR") reasons.push("محبوب");
    }

    score += p._count.orderItems * 2;

    if (isProductSafe(allergyInfo) && userAllergenIds.length > 0) {
      score += 25;
      reasons.push("ایمن برای شما");
    }

    return {
      id: p.id,
      score,
      reason: reasons[0] ?? "پیشنهاد ما",
      allergyInfo,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, options.limit ?? 8);
}