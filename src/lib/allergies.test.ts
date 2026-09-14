import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    productAllergen: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  buildAllergyInfoForProducts,
  filterBySelectedAllergens,
  isProductSafe,
} from "@/lib/allergies";
import { ALLERGEN_STATUSES, ALLERGEN_STATUS_LABELS_FA } from "@/lib/constants";

describe("allergen status model (Rule 1)", () => {
  it("has exactly two states", () => {
    expect(ALLERGEN_STATUSES).toHaveLength(2);
    expect(ALLERGEN_STATUSES).toEqual(["CONTAINS", "FREE"]);
  });

  it("labels the two states as حاوی است / حاوی نیست", () => {
    expect(ALLERGEN_STATUS_LABELS_FA.CONTAINS).toBe("حاوی است");
    expect(ALLERGEN_STATUS_LABELS_FA.FREE).toBe("حاوی نیست");
  });
});

describe("allergy info", () => {
  it("marks products as FREE when there are no ProductAllergen rows", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", allergenStatus: "FREE" },
    ] as never);
    vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([] as never);
    const infos = await buildAllergyInfoForProducts(["p1"], []);
    expect(infos.get("p1")!.allergenStatus).toBe("FREE");
    expect(isProductSafe(infos.get("p1")!)).toBe(true);
  });

  it("derives conflicts from ProductAllergen rows", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", allergenStatus: "CONTAINS" },
    ] as never);
    vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([
      {
        productId: "p1",
        allergenId: "a1",
        allergen: { id: "a1", key: "MILK", nameFa: "شیر" },
      },
    ] as never);
    const infos = await buildAllergyInfoForProducts(["p1"], ["a1"]);
    expect(infos.get("p1")!.allergenStatus).toBe("CONTAINS");
  });

  it("filters products conflicting with selected allergens", () => {
    const products = [{ id: "p1" }, { id: "p2" }];
    const infos = new Map([
      [
        "p1",
        {
          productId: "p1",
          allergenStatus: "CONTAINS" as const,
          conflictingAllergens: [{ allergenId: "a1", key: "MILK", nameFa: "شیر" }],
        },
      ],
      ["p2", { productId: "p2", allergenStatus: "FREE" as const, conflictingAllergens: [] }],
    ]);
    const filtered = filterBySelectedAllergens(products, infos, ["a1"]);
    expect(filtered.map((p) => p.id)).toEqual(["p2"]);
  });
});
