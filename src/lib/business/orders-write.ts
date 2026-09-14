import { ORDER_STATUSES, type OrderStatus, type OrderType } from "@/lib/constants";
import { OrderError } from "@/lib/orders";
import type { Prisma } from "@prisma/client";

type DB = Prisma.TransactionClient;

/**
 * Single authoritative order-transition implementation shared by the admin UI
 * and the agent runtime. Order mutation, related table release and the agent
 * receipt commit in ONE transaction (R05: atomic transition + receipt).
 * The state machine is preserved exactly: terminal orders never reopen,
 * READY is takeaway-only, table orders complete from PREPARING.
 */

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "COMPLETED", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionShared(from: OrderStatus, to: OrderStatus, orderType: OrderType = "TAKEAWAY"): boolean {
  if (!ORDER_STATUSES.includes(from) || !ORDER_STATUSES.includes(to)) return false;
  if (to === "READY" && orderType !== "TAKEAWAY") return false;
  if (from === "PREPARING" && to === "COMPLETED" && orderType !== "TABLE") return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export type OrderTransitionReceipt = {
  orderId: string;
  from: string;
  to: string;
  orderType: string;
  total: number;
  tableReleased: boolean;
  changedAt: string;
};

/**
 * Atomic order transition: order mutation, table release and the durable
 * receipt run on the SAME transaction client. The CALLER owns the transaction
 * (admin route or agent run transaction), so a business mutation and its
 * execution receipt always commit together (R05). `writeReceipt`, when
 * provided (agent path), is called with that client.
 */
export async function transitionOrderAtomic(
  db: DB,
  orderId: string,
  next: string,
  writeReceipt?: (receipt: OrderTransitionReceipt, tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ order: { id: string; status: string; orderType: string; total: number; tableId: string | null }; receipt: OrderTransitionReceipt }> {
  if (!ORDER_STATUSES.includes(next as OrderStatus)) {
    throw new OrderError("INVALID_STATUS", "وضعیت نامعتبر است");
  }
  const tx = db;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("NOT_FOUND", "سفارش پیدا نشد");
  const orderType = (order.orderType as OrderType) ?? "TAKEAWAY";
  if (!canTransitionShared(order.status as OrderStatus, next as OrderStatus, orderType)) {
    throw new OrderError("INVALID_TRANSITION", "تغییر وضعیت مجاز نیست");
  }
  const now = new Date();
  const data: { status: string; startedAt?: Date; completedAt?: Date } = { status: next };
  if (next === "PREPARING" && !order.startedAt) data.startedAt = now;
  if (next === "COMPLETED" || next === "CANCELLED") data.completedAt = now;
  const updated = await tx.order.update({ where: { id: orderId }, data });

  // Free the table when its last active order finishes (same transaction).
  let tableReleased = false;
  if (order.tableId && (next === "COMPLETED" || next === "CANCELLED")) {
    const remaining = await tx.order.count({
      where: { tableId: order.tableId, id: { not: orderId }, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] } },
    });
    if (remaining === 0) {
      await tx.cafeTable.update({ where: { id: order.tableId }, data: { isOccupied: false, occupiedAt: null } });
      tableReleased = true;
    }
  }
  const receipt: OrderTransitionReceipt = {
    orderId, from: order.status, to: next, orderType, total: updated.total,
    tableReleased, changedAt: now.toISOString(),
  };
  if (writeReceipt) await writeReceipt(receipt, tx);
  return {
    order: { id: updated.id, status: updated.status, orderType, total: updated.total, tableId: updated.tableId },
    receipt,
  };
}
