import {
  ORDER_STATUSES,
  type OrderStatus,
  type OrderType,
} from "./constants";
import { prisma } from "./db";
import { validateAndPriceCart, type CartItemInput } from "./cart";
import { orderPreparationEstimator } from "./estimator";
import { transitionOrderAtomic } from "./business/orders-write";
import { redeemDiscountInTx, recordRedemption, DiscountError } from "./discounts";
import type { Prisma } from "@prisma/client";

export type CreateOrderInput = {
  userId?: string | null;
  qrCodeId?: string | null;
  /** Trusted management flow only; customer routes must never pass this field. */
  manualTableId?: string | null;
  autoConfirm?: boolean;
  items: CartItemInput[];
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  /** Optional customer-supplied discount code; validated and redeemed atomically. */
  discountCode?: string;
};

export class OrderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function countStaff() {
  const [chefs, staff] = await Promise.all([
    prisma.staff.count({ where: { isActive: true, role: "CHEF" } }),
    prisma.staff.count({ where: { isActive: true, role: { not: "CHEF" } } }),
  ]);
  return { chefs: chefs || 1, staff };
}

async function countActiveLoad() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } },
    select: { _count: { select: { items: true } } },
  });
  return {
    activeOrders: orders.length,
    activeItems: orders.reduce((s, o) => s + o._count.items, 0),
  };
}

export async function createOrder(input: CreateOrderInput, transaction?: Prisma.TransactionClient) {
  if (!input.items.length) {
    throw new OrderError("EMPTY_CART", "سبد خرید خالی است");
  }
  const priced = await validateAndPriceCart(input.items);
  if (!priced.ok || priced.empty) {
    throw new OrderError(
      "INVALID_CART",
      priced.unavailable.length
        ? `این محصولات موجود نیستند: ${priced.unavailable.join("، ")}`
        : "سبد خرید نامعتبر است",
    );
  }

  let tableId: string | null = null;
  let qrCodeId: string | null = null;
  if (input.qrCodeId) {
    const qr = await prisma.qRCode.findFirst({
      where: { OR: [{ id: input.qrCodeId }, { code: input.qrCodeId }] },
      include: { table: true },
    });
    if (!qr || !qr.isActive) {
      throw new OrderError("INVALID_QR", "کد QR معتبر نیست");
    }
    if (qr.expiresAt && qr.expiresAt < new Date()) {
      throw new OrderError("EXPIRED_QR", "کد QR منقضی شده است");
    }
    qrCodeId = qr.id;
    tableId = qr.tableId;
  } else if (input.manualTableId) {
    const table = await prisma.cafeTable.findFirst({
      where: { id: input.manualTableId, isActive: true },
      select: { id: true },
    });
    if (!table) throw new OrderError("INVALID_TABLE", "میز معتبر نیست");
    tableId = table.id;
  }

  const orderType: OrderType = tableId ? "TABLE" : "TAKEAWAY";

  // Preparation estimate (best effort; never blocks order placement).
  let estimate: { minMinutes: number; maxMinutes: number; factors: unknown } | null = null;
  try {
    const ingredientCounts = await prisma.productIngredient.groupBy({
      by: ["productId"],
      where: { productId: { in: priced.items.map((i) => i.productId) } },
      _count: { _all: true },
    });
    const countByProduct = new Map(ingredientCounts.map((g) => [g.productId, g._count._all]));
    const [{ chefs, staff }, load] = await Promise.all([countStaff(), countActiveLoad()]);
    const est = orderPreparationEstimator.estimate({
      items: priced.items.map((i) => ({
        quantity: i.quantity,
        prepBaseMin: i.prepBaseMin,
        ingredientCount: countByProduct.get(i.productId) ?? 0,
      })),
      activeOrders: load.activeOrders,
      activeItems: load.activeItems,
      chefs,
      staff,
    });
    estimate = {
      minMinutes: est.minMinutes,
      maxMinutes: est.maxMinutes,
      factors: est.factors,
    };
  } catch {
    estimate = null;
  }

  const persist = async (tx: Prisma.TransactionClient) => {
    // Discount validation + usage increment happen inside the same
    // transaction as the order, so a failed order never burns a redemption.
    const discount = input.discountCode?.trim()
      ? await redeemDiscountInTx(tx, {
          code: input.discountCode,
          subtotal: priced.total,
          userId: input.userId ?? null,
        })
      : null;

    const created = await tx.order.create({
      data: {
        userId: input.userId ?? null,
        qrCodeId,
        tableId,
        orderType,
        status: "PENDING",
        total: discount ? discount.finalTotal : priced.total,
        subtotal: priced.total,
        discountAmount: discount?.amount ?? 0,
        discountCodeId: discount?.discountCodeId ?? null,
        discountCode: discount?.code ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        notes: input.notes ?? null,
        estPrepMin: estimate?.minMinutes ?? null,
        estPrepMax: estimate?.maxMinutes ?? null,
        prepFactors: estimate ? JSON.stringify(estimate.factors) : null,
        items: {
          create: priced.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.unitPrice,
            coffeeLineId: i.coffeeLineId,
            coffeeLineName: i.coffeeLineName,
            optionPrice: i.optionPrice,
          })),
        },
      },
      include: { items: true, table: true, qrCode: true },
    });
    if (discount) {
      await recordRedemption(
        tx,
        { discountCodeId: discount.discountCodeId, amount: discount.amount },
        created.id,
        input.userId ?? null,
      );
    }
    if (input.manualTableId && tableId) {
      await tx.cafeTable.update({
        where: { id: tableId },
        data: { isOccupied: true, occupiedAt: new Date() },
      });
    }
    try {
      await (tx as unknown as { orderStageEvent: { create: (a: unknown) => Promise<unknown> } }).orderStageEvent.create({
        data: { orderId: created.id, stage: "CREATED" },
      });
    } catch { /* best effort */ }
    return created;
  };

  const persistAndMaybeConfirm = async (tx: Prisma.TransactionClient) => {
    const created = await persist(tx);
    if (!input.autoConfirm) return created;
    const { order: confirmed } = await transitionOrderAtomic(tx, created.id, "CONFIRMED");
    return { ...created, status: confirmed.status };
  };

  const order = transaction
    ? await persistAndMaybeConfirm(transaction)
    : await prisma.$transaction(persistAndMaybeConfirm);

  return order;
}

/**
 * State machine, strictly per order type:
 *  TABLE:    PENDING -> CONFIRMED -> PREPARING -> COMPLETED
 *  TAKEAWAY: PENDING -> CONFIRMED -> PREPARING -> READY(آماده تحویل) -> COMPLETED
 *
 * Business rules enforced here (not only in UI):
 *  - Table orders have NO pickup/serve step: they cannot enter READY and
 *    can only be completed from PREPARING.
 *  - Takeaway orders must pass through READY before COMPLETED.
 *  - Cancellation is allowed until the order is handed to the customer.
 */
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "COMPLETED", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  orderType: OrderType = "TAKEAWAY",
): boolean {
  if (!ORDER_STATUSES.includes(from) || !ORDER_STATUSES.includes(to)) return false;
  // Rule: READY is takeaway-only.
  if (to === "READY" && orderType !== "TAKEAWAY") return false;
  // Rule: only table orders may skip READY and complete directly from PREPARING.
  if (from === "PREPARING" && to === "COMPLETED" && orderType !== "TABLE") return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(status: OrderStatus, orderType: OrderType): OrderStatus[] {
  return (STATUS_TRANSITIONS[status] ?? []).filter((s) => canTransition(status, s, orderType));
}

export async function transitionOrder(orderId: string, next: string) {
  // Delegates to the single shared implementation: order mutation, related
  // table release and (optionally) the agent receipt commit in one transaction.
  const { order } = await prisma.$transaction(tx => transitionOrderAtomic(tx, orderId, next));
  return order as never;
}
