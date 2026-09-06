import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    userAllergy: {
      findMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    productAllergen: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { getRecommendations } from "@/lib/recommendations";

const milk = { id: "a1", key: "milk", nameFa: "شیر", nameEn: "Milk", description: null, icon: null, createdAt: new Date(), updatedAt: new Date() };
const nut = { id: "a2", key: "peanut", nameFa: "بادام زمینی", nameEn: "Peanut", description: null, icon: null, createdAt: new Date(), updatedAt: new Date() };

function product(id: string, over = {}) {
  return {
    id,
    slug: id,
    nameFa: id,
    nameEn: null,
    description: "desc",
    price: 100,
    image: null,
    isFeatured: false,
    isAvailable: true,
    order: 0,
    allergenStatus: "CONTAINS",
    categoryId: "c1",
    category: { slug: "coffee", nameFa: "قهوه" },
    ingredients: [{ ingredient: { id: "i1", nameFa: "قند" } }],
    dietaryTags: [],
    ratings: [{ rating: 5 }],
    _count: { orderItems: 10 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("recommendation engine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excludes products containing a user allergen even when popular/rated", async () => {
    vi.mocked(prisma.userAllergy.findMany).mockResolvedValue([
      { id: "ua1", userId: "u1", allergenId: milk.id, severity: "AVOID" },
    ] as never);

    const conflicting = product("cream-latte", {
      nameFa: "لاته شیر",
      allergenStatus: "CONTAINS",
      allergens: undefined,
    });
    const safe = product("black-coffee", {
      nameFa: "قهوه تلخ",
      allergenStatus: "CONTAINS",
      allergens: undefined,
    });

    vi.mocked(prisma.product.findMany).mockResolvedValue([conflicting, safe] as never);
    // conflicting product has milk allergen; safe product has none
    vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([
      { productId: conflicting.id, allergenId: milk.id, status: "CONTAINS", allergen: milk },
    ] as never);

    const ranked = await getRecommendations(
      { userId: "u1" },
      "PERSONAL",
      { limit: 10 },
    );

    const ids = ranked.map((r) => r.id);
    expect(ids).not.toContain(conflicting.id);
    expect(ids).toContain(safe.id);
  });

  it("recommends based on favorite category after safety filter", async () => {
    vi.mocked(prisma.userAllergy.findMany).mockResolvedValue([] as never);
    const fav = product("espresso", { nameFa: "اسپرسو" });
    const other = product("tea", {
      nameFa: "چای",
      category: { slug: "hot-drinks", nameFa: "نوشیدنی گرم" },
    });
    vi.mocked(prisma.product.findMany).mockResolvedValue([fav, other] as never);
    vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([] as never);

    const ranked = await getRecommendations(
      { favoriteCategories: ["coffee"] },
      "PERSONAL",
      { limit: 10 },
    );

    expect(ranked[0].id).toBe(fav.id);
    expect(ranked[0].score).toBeGreaterThan(ranked.find((r) => r.id === other.id)!.score);
  });

  it("does not recommend products the user dislikes", async () => {
    vi.mocked(prisma.userAllergy.findMany).mockResolvedValue([] as never);
    const disliked = product("sugar-cake", {
      nameFa: "کیک قند",
      ingredients: [{ ingredient: { id: "i-sugar", nameFa: "شکر" } }],
    });
    const ok = product("bread", { nameFa: "نان" });
    vi.mocked(prisma.product.findMany).mockResolvedValue([disliked, ok] as never);
    vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([] as never);

    const ranked = await getRecommendations(
      { dislikedIngredients: ["شکر"] },
      "PERSONAL",
      { limit: 10 },
    );

    const ids = ranked.map((r) => r.id);
    expect(ids).not.toContain(disliked.id);
    expect(ids).toContain(ok.id);
  });
});