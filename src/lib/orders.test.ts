import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    qRCode: {
      findFirst: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { cartCount, validateAndPriceCart } from "@/lib/cart";
import {
  canTransition,
  createOrder,
  transitionOrder,
  OrderError,
} from "@/lib/orders";

describe("cart", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes count from lines", () => {
    expect(cartCount([{ quantity: 2 }, { quantity: 0 }, { quantity: 3 }])).toBe(5);
  });

  it("prices cart server-side from DB prices", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", price: 100, nameFa: "قهوه", isAvailable: true },
      { id: "p2", price: 50, nameFa: "چای", isAvailable: true },
    ] as never);

    const result = await validateAndPriceCart([
      { productId: "p1", quantity: 2 },
      { productId: "p2", quantity: 1 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.total).toBe(250);
    expect(result.items).toHaveLength(2);
  });

  it("flags unavailable products and does not trust them", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", price: 100, nameFa: "قهوه", isAvailable: false },
    ] as never);

    const result = await validateAndPriceCart([{ productId: "p1", quantity: 1 }]);

    expect(result.ok).toBe(false);
    expect(result.unavailable).toEqual(["قهوه"]);
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects empty carts", async () => {
    await expect(createOrder({ items: [] })).rejects.toThrow(OrderError);
  });

  it("creates order and preserves qr/table context", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", price: 100, nameFa: "قهوه", isAvailable: true },
    ] as never);
    vi.mocked(prisma.qRCode.findFirst).mockResolvedValue({
      id: "qr1",
      isActive: true,
      expiresAt: null,
      tableId: "t1",
      table: { id: "t1" },
    } as never);
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "o1",
      tableId: "t1",
      qrCodeId: "qr1",
      total: 100,
      items: [{ productId: "p1", quantity: 1, price: 100 }],
    } as never);

    const order = await createOrder({
      qrCodeId: "qr1",
      items: [{ productId: "p1", quantity: 1 }],
    });

    expect(order.tableId).toBe("t1");
    expect(order.qrCodeId).toBe("qr1");
    expect(order.total).toBe(100);
    const createArg = vi.mocked(prisma.order.create).mock.calls[0][0];
    expect((createArg.data as { tableId: string | null }).tableId).toBe("t1");
  });

  it("resolves a QR code passed by code and stores the resolved id", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", price: 100, nameFa: "قهوه", isAvailable: true },
    ] as never);
    vi.mocked(prisma.qRCode.findFirst).mockResolvedValue({
      id: "qr1",
      isActive: true,
      expiresAt: null,
      tableId: "t1",
      table: { id: "t1" },
    } as never);
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "o2",
      tableId: "t1",
      qrCodeId: "qr1",
      total: 100,
      items: [{ productId: "p1", quantity: 1, price: 100 }],
    } as never);

    const order = await createOrder({
      qrCodeId: "main-table-2",
      items: [{ productId: "p1", quantity: 1 }],
    });

    expect(order.qrCodeId).toBe("qr1");
    const query = vi.mocked(prisma.qRCode.findFirst).mock.calls[0][0];
    expect(
      (query?.where as { OR: { id: string; code: string }[] }).OR,
    ).toEqual([{ id: "main-table-2" }, { code: "main-table-2" }]);
  });

  it("rejects expired QR codes", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "p1", price: 100, nameFa: "قهوه", isAvailable: true },
    ] as never);
    vi.mocked(prisma.qRCode.findFirst).mockResolvedValue({
      id: "qr1",
      isActive: true,
      expiresAt: new Date(Date.now() - 1000),
      tableId: null,
      table: null,
    } as never);

    await expect(
      createOrder({ qrCodeId: "qr1", items: [{ productId: "p1", quantity: 1 }] }),
    ).rejects.toThrow(OrderError);
  });

  it("enforces valid status transitions", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "PENDING")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });

  it("rejects illegal transitions in transitionOrder", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: "o1",
      status: "COMPLETED",
    } as never);

    await expect(transitionOrder("o1", "PENDING")).rejects.toThrow(OrderError);
  });
});