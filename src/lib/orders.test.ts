import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    qRCode: {
      findFirst: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    productIngredient: {
      groupBy: vi.fn(),
    },
    coffeeLine: {
      findMany: vi.fn(),
    },
    staff: { count: vi.fn() },
    cafeTable: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { cartCount, validateAndPriceCart } from "@/lib/cart";
import {
  canTransition,
  createOrder,
  transitionOrder,
  nextStatuses,
  OrderError,
} from "@/lib/orders";
import { orderPreparationEstimator } from "@/lib/estimator";

describe("cart", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts quantities", () => {
    expect(cartCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });

  it("prices items with the selected coffee line (Rule 14)", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "p1",
        price: 85000,
        nameFa: "اسپرسو",
        isAvailable: true,
        prepBaseMin: 2,
        coffeeLines: [
          { coffeeLineId: "line-eth", price: 105000 },
          { coffeeLineId: "line-house", price: 85000 },
        ],
      },
    ] as never);
    vi.mocked(prisma.coffeeLine.findMany as never as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "line-eth", nameFa: "اتیوپی" },
    ]);

    const result = await validateAndPriceCart([
      { productId: "p1", quantity: 2, coffeeLineId: "line-eth" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.items[0].unitPrice).toBe(105000);
    expect(result.items[0].coffeeLineName).toBe("اتیوپی");
    expect(result.total).toBe(210000);
  });

  it("falls back to base price without a coffee line", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "p1",
        price: 85000,
        nameFa: "اسپرسو",
        isAvailable: true,
        prepBaseMin: 2,
        coffeeLines: [],
      },
    ] as never);
    const result = await validateAndPriceCart([{ productId: "p1", quantity: 1 }]);
    expect(result.total).toBe(85000);
  });

  it("rejects items whose requested coffee line is not offered", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", price: 85000, nameFa: "اسپرسو", isAvailable: true, prepBaseMin: 2, coffeeLines: [] },
    ] as never);
    vi.mocked(prisma.coffeeLine.findMany as never as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "line-x", nameFa: "ناموجود" },
    ]);
    const result = await validateAndPriceCart([
      { productId: "p1", quantity: 1, coffeeLineId: "line-x" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.unavailable).toContain("اسپرسو");
  });
});

describe("order state machine (Rules 3 & 4)", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma) as never);
  });

  it("table orders cannot enter READY (آماده تحویل) and have no serve step", () => {
    expect(canTransition("PREPARING", "READY", "TABLE")).toBe(false);
  });

  it("table orders complete directly from PREPARING", () => {
    expect(canTransition("PREPARING", "COMPLETED", "TABLE")).toBe(true);
  });

  it("takeaway orders can enter READY but must not skip it", () => {
    expect(canTransition("PREPARING", "READY", "TAKEAWAY")).toBe(true);
    expect(canTransition("PREPARING", "COMPLETED", "TAKEAWAY")).toBe(false);
  });

  it("follows the full table workflow", () => {
    expect(canTransition("PENDING", "CONFIRMED", "TABLE")).toBe(true);
    expect(canTransition("CONFIRMED", "PREPARING", "TABLE")).toBe(true);
    expect(canTransition("COMPLETED", "PENDING", "TABLE")).toBe(false);
  });

  it("exposes only valid next statuses per type", () => {
    expect(nextStatuses("PREPARING", "TABLE")).toEqual(["COMPLETED", "CANCELLED"]);
    expect(nextStatuses("PREPARING", "TAKEAWAY")).toEqual(["READY", "CANCELLED"]);
    expect(nextStatuses("COMPLETED", "TAKEAWAY")).toEqual([]);
  });

  it("transitionOrder persists valid transitions", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: "o1",
      status: "PREPARING",
      orderType: "TAKEAWAY",
      startedAt: null,
    } as never);
    vi.mocked(prisma.order.update).mockResolvedValue({ id: "o1", status: "READY" } as never);
    const order = await transitionOrder("o1", "READY") as { status: string };
    expect(order.status).toBe("READY");
  });

  it("transitionOrder rejects invalid transitions for the order type", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: "o2",
      status: "PREPARING",
      orderType: "TABLE",
      startedAt: null,
    } as never);
    await expect(transitionOrder("o2", "READY")).rejects.toBeInstanceOf(OrderError);
  });
});

describe("order creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores coffee line info and estimate with the order", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: "p1",
        price: 85000,
        nameFa: "اسپرسو",
        isAvailable: true,
        prepBaseMin: 2,
        coffeeLines: [{ coffeeLineId: "l1", price: 105000 }],
      },
    ] as never);
    vi.mocked(prisma.coffeeLine.findMany as never as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "l1", nameFa: "اتیوپی" },
    ]);
    vi.mocked(prisma.qRCode.findFirst).mockResolvedValue({
      id: "qr1",
      isActive: true,
      expiresAt: null,
      tableId: "t1",
    } as never);
    vi.mocked(prisma.order.create).mockImplementation((async (args: unknown) => args) as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.staff.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([
      { productId: "p1", _count: { _all: 3 } },
    ] as never);
    vi.mocked(prisma.productIngredient.groupBy).mockResolvedValue([
      { productId: "p1", _count: { _all: 3 } },
    ] as never);

    const order = (await createOrder({
      items: [{ productId: "p1", quantity: 2, coffeeLineId: "l1" }],
      qrCodeId: "qr1",
    })) as unknown as {
      data: {
        orderType: string;
        total: number;
        estPrepMin: number | null;
        items: { create: Array<{ coffeeLineId: string | null; coffeeLineName: string | null; price: number }> };
      };
    };

    expect(order.data.orderType).toBe("TABLE");
    expect(order.data.total).toBe(210000);
    expect(order.data.items.create[0].coffeeLineId).toBe("l1");
    expect(order.data.items.create[0].coffeeLineName).toBe("اتیوپی");
    expect(order.data.items.create[0].price).toBe(105000);
    expect(order.data.estPrepMin).toBeGreaterThan(0);
  });
});

describe("preparation estimator", () => {
  const base = {
    items: [{ quantity: 1, prepBaseMin: 4, ingredientCount: 2 }],
    activeOrders: 0,
    activeItems: 0,
    chefs: 4,
    staff: 2,
  };

  it("is fast for a simple coffee order with few active orders", () => {
    const est = orderPreparationEstimator.estimate(base);
    expect(est.minMinutes).toBeLessThanOrEqual(8);
  });

  it("increases the estimate with queue load and complexity", () => {
    const busy = orderPreparationEstimator.estimate({
      ...base,
      activeOrders: 10,
      activeItems: 20,
      chefs: 2,
      items: [{ quantity: 3, prepBaseMin: 12, ingredientCount: 6 }],
    });
    const calm = orderPreparationEstimator.estimate(base);
    expect(busy.minMinutes).toBeGreaterThan(calm.minMinutes);
  });

  it("returns a range, not an exact number", () => {
    const est = orderPreparationEstimator.estimate(base);
    expect(est.maxMinutes).toBeGreaterThan(est.minMinutes);
    expect(est.factors.chefs).toBe(4);
  });
});
