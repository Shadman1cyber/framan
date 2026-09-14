import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    userAllergy: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getRecommendations } from "@/lib/recommendations";

describe("recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.userAllergy.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);
  });

  it("returns ranked products", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "p1",
        isFeatured: true,
        category: { slug: "coffee", nameFa: "قهوه" },
        ingredients: [],
        dietaryTags: [],
        ratings: [{ rating: 5 }],
        _count: { orderItems: 10 },
      },
    ] as never);
    const recs = await getRecommendations({}, "FEATURED", { limit: 4 });
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("p1");
    expect(recs[0].score).toBeGreaterThan(0);
  });
});
