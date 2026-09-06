import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    productAllergen: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  isProductSafe,
  isProductConflicting,
  applyAllergyFilter,
  filterBySelectedAllergens,
  buildAllergyInfoForProducts,
  type ProductAllergyInfo,
} from "@/lib/allergies";

const milk = { id: "a1", key: "milk", nameFa: "شیر" };

describe("allergy filtering", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("isProductSafe / isProductConflicting", () => {
    it("returns not safe for conflicting products", () => {
      const info: ProductAllergyInfo = {
        productId: "p1",
        allergenStatus: "CONTAINS",
        conflictingAllergens: [{ ...milk, allergenId: milk.id, status: "CONTAINS" }],
      };
      expect(isProductSafe(info)).toBe(false);
      expect(isProductConflicting(info)).toBe(true);
    });

    it("returns safe when no conflict and known status", () => {
      const info: ProductAllergyInfo = {
        productId: "p1",
        allergenStatus: "CONTAINS",
        conflictingAllergens: [],
      };
      expect(isProductSafe(info)).toBe(true);
    });

    it("isProductSafe treats MAY_CONTAIN as conflicting", () => {
      const info: ProductAllergyInfo = {
        productId: "p1",
        allergenStatus: "CONTAINS",
        conflictingAllergens: [{ ...milk, allergenId: milk.id, status: "MAY_CONTAIN" }],
      };
      expect(isProductConflicting(info)).toBe(true);
      expect(isProductSafe(info)).toBe(false);
    });

    it("UNKNOWN allergen status is never safe", () => {
      const info: ProductAllergyInfo = {
        productId: "p1",
        allergenStatus: "UNKNOWN",
        conflictingAllergens: [],
      };
      expect(isProductSafe(info)).toBe(false);
      expect(isProductConflicting(info)).toBe(false);
    });
  });

  describe("buildAllergyInfoForProducts (critical test)", () => {
    it("product containing user's allergen must be flagged as conflicting", async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([
        { id: "p1", allergenStatus: "CONTAINS" },
      ] as never);
      vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([
        { productId: "p1", allergenId: "a1", status: "CONTAINS", allergen: milk },
      ] as never);

      const map = await buildAllergyInfoForProducts(["p1"], [milk.id]);
      const info = map.get("p1")!;
      expect(info).toBeDefined();
      expect(info.conflictingAllergens).toHaveLength(1);
      expect(info.conflictingAllergens[0].key).toBe("milk");
      expect(isProductSafe(info)).toBe(false);
    });

    it("UNKNOWN allergen information is not claimed safe", async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([
        { id: "p2", allergenStatus: "UNKNOWN" },
      ] as never);
      vi.mocked(prisma.productAllergen.findMany).mockResolvedValue([] as never);

      const map = await buildAllergyInfoForProducts(["p2"], [milk.id]);
      expect(isProductSafe(map.get("p2")!)).toBe(false);
    });
  });

  describe("applyAllergyFilter", () => {
    it("SAFE filter removes conflicting products", () => {
      const safe: ProductAllergyInfo = {
        productId: "p1",
        allergenStatus: "CONTAINS",
        conflictingAllergens: [],
      };
      const conflict: ProductAllergyInfo = {
        productId: "p2",
        allergenStatus: "CONTAINS",
        conflictingAllergens: [{ ...milk, allergenId: milk.id, status: "CONTAINS" }],
      };
      const infos = new Map<string, ProductAllergyInfo>([
        ["p1", safe],
        ["p2", conflict],
      ]);
      const result = applyAllergyFilter(
        [{ id: "p1" }, { id: "p2" }],
        infos,
        "SAFE",
      );
      expect(result.map((p) => p.id)).toEqual(["p1"]);
    });

    it("ALL filter keeps everything", () => {
      const infos = new Map<string, ProductAllergyInfo>();
      const result = applyAllergyFilter([{ id: "p1" }, { id: "p2" }], infos, "ALL");
      expect(result).toHaveLength(2);
    });
  });

  describe("filterBySelectedAllergens", () => {
    it("removes products conflicting with selected allergens", () => {
      const infos = new Map<string, ProductAllergyInfo>([
        [
          "p1",
          { productId: "p1", allergenStatus: "CONTAINS", conflictingAllergens: [] },
        ],
        [
          "p2",
          {
            productId: "p2",
            allergenStatus: "CONTAINS",
            conflictingAllergens: [{ ...milk, allergenId: milk.id, status: "CONTAINS" }],
          },
        ],
      ]);
      const result = filterBySelectedAllergens(
        [{ id: "p1" }, { id: "p2" }],
        infos,
        [milk.id],
      );
      expect(result.map((p) => p.id)).toEqual(["p1"]);
    });

    it("ignores selected allergens the product does not contain", () => {
      const infos = new Map<string, ProductAllergyInfo>([
        [
          "p2",
          {
            productId: "p2",
            allergenStatus: "CONTAINS",
            conflictingAllergens: [{ ...milk, allergenId: milk.id, status: "CONTAINS" }],
          },
        ],
      ]);
      const result = filterBySelectedAllergens(
        [{ id: "p2" }],
        infos,
        ["a99"],
      );
      expect(result).toHaveLength(1);
    });

    it("keeps everything when no allergens selected", () => {
      const infos = new Map<string, ProductAllergyInfo>();
      const result = filterBySelectedAllergens([{ id: "p1" }, { id: "p2" }], infos, []);
      expect(result).toHaveLength(2);
    });

    it("hides a product with unknown status when any selected allergen is declared on it via relationships", () => {
      const infos = new Map<string, ProductAllergyInfo>([
        [
          "p3",
          {
            productId: "p3",
            allergenStatus: "UNKNOWN",
            conflictingAllergens: [{ ...milk, allergenId: milk.id, status: "MAY_CONTAIN" }],
          },
        ],
      ]);
      const result = filterBySelectedAllergens([{ id: "p3" }], infos, [milk.id]);
      expect(result).toHaveLength(0);
    });
  });
});