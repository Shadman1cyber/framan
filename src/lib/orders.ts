import { ORDER_STATUSES, type OrderStatus } from "./constants";
import { prisma } from "./db";
import { validateAndPriceCart, type CartItemInput } from "./cart";

export type CreateOrderInput = {
  userId?: string | null;
  qrCodeId?: string | null;
  items: CartItemInput[];
  customerName?: string;
  customerPhone?: string;
  notes?: string;
};

export class OrderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function createOrder(input: CreateOrderInput) {
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
  }

  const order = await prisma.order.create({
    data: {
      userId: input.userId ?? null,
      qrCodeId,
      tableId,
      status: "PENDING",
      total: priced.total,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      notes: input.notes ?? null,
      items: {
        create: priced.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.unitPrice,
        })),
      },
    },
    include: { items: true, table: true, qrCode: true },
  });

  return order;
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionOrder(orderId: string, next: string) {
  if (!ORDER_STATUSES.includes(next as OrderStatus)) {
    throw new OrderError("INVALID_STATUS", "وضعیت نامعتبر است");
  }
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("NOT_FOUND", "سفارش پیدا نشد");
  if (!canTransition(order.status as OrderStatus, next as OrderStatus)) {
    throw new OrderError("INVALID_TRANSITION", "تغییر وضعیت مجاز نیست");
  }
  return prisma.order.update({
    where: { id: orderId },
    data: { status: next },
  });
}