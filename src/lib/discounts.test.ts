import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    discountCode: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    discountRedemption: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  normalizeDiscountCode,
  computeDiscountAmount,
  assertCodeUsable,
  quoteDiscount,
  redeemDiscountInTx,
  recordRedemption,
  DiscountError,
  type DiscountCodeRow,
} from "@/lib/discounts";

const DAY_MS = 86_400_000;

function row(overrides: Partial<DiscountCodeRow> = {}): DiscountCodeRow {
  const now = new Date();
  return {
    id: "dc1",
    code: "EID10",
    type: "PERCENT",
    value: 10,
    startsAt: new Date(now.getTime() - 30 * DAY_MS),
    endsAt: new Date(now.getTime() + 30 * DAY_MS),
    minOrderAmount: 0,
    maxDiscount: null,
    usageLimit: null,
    perUserLimit: null,
    isActive: true,
    archivedAt: null,
    usedCount: 0,
    ...overrides,
  };
}

describe("normalizeDiscountCode", () => {
  it("trims and uppercases (case-insensitive matching)", () => {
    expect(normalizeDiscountCode("  eid10 ")).toBe("EID10");
  });
});

describe("computeDiscountAmount", () => {
  it("computes percent discounts floored", () => {
    expect(computeDiscountAmount({ type: "PERCENT", value: 10, maxDiscount: null }, 105_001)).toBe(10_500);
  });
  it("caps percent discounts at maxDiscount", () => {
    expect(computeDiscountAmount({ type: "PERCENT", value: 50, maxDiscount: 20_000 }, 100_000)).toBe(20_000);
  });
  it("applies fixed discounts but never exceeds the subtotal", () => {
    expect(computeDiscountAmount({ type: "FIXED", value: 30_000, maxDiscount: null }, 100_000)).toBe(30_000);
    expect(computeDiscountAmount({ type: "FIXED", value: 30_000, maxDiscount: null }, 10_000)).toBe(10_000);
  });
  it("returns 0 for non-positive subtotals", () => {
    expect(computeDiscountAmount({ type: "PERCENT", value: 10, maxDiscount: null }, 0)).toBe(0);
  });
});

describe("assertCodeUsable", () => {
  const now = new Date();
  it("accepts a usable code", () => {
    expect(() => assertCodeUsable(row(), { subtotal: 100_000, now })).not.toThrow();
  });
  it.each([
    ["inactive", { isActive: false }, "INACTIVE", "این کد تخفیف غیرفعال است"],
    ["archived", { archivedAt: new Date(now.getTime() - DAY_MS) }, "INACTIVE", "این کد تخفیف غیرفعال است"],
    ["not started", { startsAt: new Date(now.getTime() + DAY_MS) }, "NOT_STARTED", "کد تخفیف هنوز فعال نشده است"],
    ["expired", { endsAt: new Date(now.getTime() - DAY_MS) }, "EXPIRED", "کد تخفیف منقضی شده است"],
    ["exhausted", { usageLimit: 5, usedCount: 5 }, "EXHAUSTED", "سقف استفاده از این کد تخفیف تکمیل شده است"],
  ])("rejects %s codes", (_label, overrides, code, message) => {
    try {
      assertCodeUsable(row(overrides), { subtotal: 100_000, now });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DiscountError);
      expect((e as DiscountError).code).toBe(code);
      expect((e as Error).message).toBe(message);
    }
  });
  it("enforces minimum order amounts with the toman convention", () => {
    try {
      assertCodeUsable(row({ minOrderAmount: 200_000 }), { subtotal: 100_000, now });
      expect.unreachable();
    } catch (e) {
      expect((e as DiscountError).code).toBe("MIN_ORDER");
      expect((e as Error).message).toContain("تومان");
    }
  });
  it("requires login for per-user-limited codes and enforces the per-user cap", () => {
    const limited = row({ perUserLimit: 2 });
    expect(() => assertCodeUsable(limited, { subtotal: 100_000, now })).toThrowError("برای استفاده از این کد وارد شوید");
    expect(() =>
      assertCodeUsable(limited, { subtotal: 100_000, userId: "u1", perUserUsed: 2, now }),
    ).toThrowError("سقف استفاده شما از این کد تخفیف تکمیل شده است");
    expect(() =>
      assertCodeUsable(limited, { subtotal: 100_000, userId: "u1", perUserUsed: 1, now }),
    ).not.toThrow();
  });
});

describe("quoteDiscount (read-only, never mutates)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("quotes a valid code without touching usage counts", async () => {
    vi.mocked(prisma.discountCode.findUnique).mockResolvedValue(row() as never);
    const quote = await quoteDiscount({ code: "eid10", subtotal: 100_000 });
    expect(quote).toMatchObject({ code: "EID10", amount: 10_000, finalTotal: 90_000 });
    expect(prisma.discountCode.updateMany).not.toHaveBeenCalled();
    expect(prisma.discountRedemption.create).not.toHaveBeenCalled();
  });
  it(" surfaces Persian errors for unknown codes", async () => {
    vi.mocked(prisma.discountCode.findUnique).mockResolvedValue(null as never);
    await expect(quoteDiscount({ code: "NOPE", subtotal: 100_000 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("redeemDiscountInTx (atomic usage gate)", () => {
  beforeEach(() => vi.clearAllMocks());

  function tx() {
    return {
      discountCode: {
        findUnique: vi.fn().mockResolvedValue(row()),
        findUniqueOrThrow: vi.fn().mockResolvedValue(row({ usedCount: 1 })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      discountRedemption: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    } as never;
  }

  it("increments the usage count inside the order transaction", async () => {
    const t = tx();
    const quote = await redeemDiscountInTx(t, { code: "EID10", subtotal: 200_000, userId: "u1" });
    expect(quote.amount).toBe(20_000);
    expect(quote.finalTotal).toBe(180_000);
    const updateMany = (t as unknown as { discountCode: { updateMany: ReturnType<typeof vi.fn> } }).discountCode.updateMany;
    expect(updateMany).toHaveBeenCalledOnce();
    // The gate only increments while the code is still active and under the limit.
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ isActive: true, archivedAt: null });
  });

  it("fails closed when a concurrent request exhausts the code first", async () => {
    const t = tx();
    (t as unknown as { discountCode: { updateMany: ReturnType<typeof vi.fn> } }).discountCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(redeemDiscountInTx(t, { code: "EID10", subtotal: 200_000 })).rejects.toMatchObject({
      code: "EXHAUSTED",
    });
  });

  it("checks the per-customer cap after locking the code row", async () => {
    const t = tx() as unknown as {
      discountCode: { findUnique: ReturnType<typeof vi.fn>; findUniqueOrThrow: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
      discountRedemption: { count: ReturnType<typeof vi.fn> };
    };
    const calls: string[] = [];
    t.discountCode.findUnique.mockResolvedValue(row({ perUserLimit: 1 }));
    t.discountCode.findUniqueOrThrow.mockResolvedValue(row({ perUserLimit: 1, usedCount: 2 }));
    t.discountCode.updateMany.mockImplementation(async () => { calls.push("lock"); return { count: 1 }; });
    t.discountRedemption.count.mockImplementation(async () => { calls.push("count"); return 1; });
    await expect(redeemDiscountInTx(t as never, { code: "EID10", subtotal: 100_000, userId: "u1" }))
      .rejects.toMatchObject({ code: "PER_USER_LIMIT" });
    expect(calls).toEqual(["lock", "count"]);
  });

  it("records one redemption row per order", async () => {
    const t = tx();
    await recordRedemption(t, { discountCodeId: "dc1", amount: 20_000 }, "order1", "u1");
    const create = (t as unknown as { discountRedemption: { create: ReturnType<typeof vi.fn> } }).discountRedemption.create;
    expect(create).toHaveBeenCalledWith({
      data: { discountCodeId: "dc1", orderId: "order1", userId: "u1", amount: 20_000 },
    });
  });
});
