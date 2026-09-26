import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatNumber } from "./format";

/**
 * Discount codes (owner-managed) with server-authoritative pricing.
 * All amounts are integer toman. Codes are matched case-insensitively
 * (trimmed + uppercased). Validation errors carry stable machine codes plus
 * Persian user-facing messages so online and offline flows surface the same
 * reason.
 */

export type DiscountErrorCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MIN_ORDER"
  | "EXHAUSTED"
  | "PER_USER_LIMIT"
  | "LOGIN_REQUIRED";

export class DiscountError extends Error {
  constructor(public code: DiscountErrorCode, message: string) {
    super(message);
    this.name = "DiscountError";
  }
}

export type DiscountCodeRow = {
  id: string;
  code: string;
  type: string;
  value: number;
  startsAt: Date;
  endsAt: Date;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  isActive: boolean;
  archivedAt: Date | null;
  usedCount: number;
};

export type DiscountQuote = {
  discountCodeId: string;
  code: string;
  type: "PERCENT" | "FIXED";
  amount: number;
  finalTotal: number;
};

export function normalizeDiscountCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Pure pricing: percent (floored, optionally capped) or fixed, never > subtotal. */
export function computeDiscountAmount(
  code: Pick<DiscountCodeRow, "type" | "value" | "maxDiscount">,
  subtotal: number,
): number {
  if (subtotal <= 0) return 0;
  let amount: number;
  if (code.type === "PERCENT") {
    amount = Math.floor((subtotal * code.value) / 100);
    if (code.maxDiscount != null) amount = Math.min(amount, code.maxDiscount);
  } else {
    amount = code.value;
  }
  return Math.max(0, Math.min(amount, subtotal));
}

type CheckContext = {
  subtotal: number;
  userId?: string | null;
  now?: Date;
  /** When true, skip DB-backed per-user counting (caller supplies the result). */
  perUserUsed?: number;
};

/**
 * Stateless/window checks. Throws DiscountError with a Persian message.
 * `perUserUsed` must be supplied by the caller when perUserLimit is set and
 * a user is present (counting lives in the DB layer below).
 */
export function assertCodeUsable(code: DiscountCodeRow, ctx: CheckContext): void {
  const now = ctx.now ?? new Date();
  if (code.archivedAt || !code.isActive) {
    throw new DiscountError("INACTIVE", "این کد تخفیف غیرفعال است");
  }
  if (now < code.startsAt) {
    throw new DiscountError("NOT_STARTED", "کد تخفیف هنوز فعال نشده است");
  }
  if (now > code.endsAt) {
    throw new DiscountError("EXPIRED", "کد تخفیف منقضی شده است");
  }
  if (code.minOrderAmount > 0 && ctx.subtotal < code.minOrderAmount) {
    throw new DiscountError(
      "MIN_ORDER",
      `حداقل مبلغ سفارش برای این کد ${formatNumber(code.minOrderAmount)} تومان است`,
    );
  }
  if (code.usageLimit != null && code.usedCount >= code.usageLimit) {
    throw new DiscountError("EXHAUSTED", "سقف استفاده از این کد تخفیف تکمیل شده است");
  }
  if (code.perUserLimit != null) {
    if (!ctx.userId) {
      throw new DiscountError("LOGIN_REQUIRED", "برای استفاده از این کد وارد شوید");
    }
    if (ctx.perUserUsed != null && ctx.perUserUsed >= code.perUserLimit) {
      throw new DiscountError("PER_USER_LIMIT", "سقف استفاده شما از این کد تخفیف تکمیل شده است");
    }
  }
}

async function loadByRawCode(code: string): Promise<DiscountCodeRow> {
  const normalized = normalizeDiscountCode(code);
  if (!normalized) {
    throw new DiscountError("NOT_FOUND", "کد تخفیف یافت نشد");
  }
  const row = await prisma.discountCode.findUnique({ where: { code: normalized } });
  if (!row) {
    throw new DiscountError("NOT_FOUND", "کد تخفیف یافت نشد");
  }
  return row;
}

async function countPerUserUsed(
  tx: Prisma.TransactionClient | typeof prisma,
  discountCodeId: string,
  userId: string,
): Promise<number> {
  return tx.discountRedemption.count({ where: { discountCodeId, userId } });
}

/** Read-only quote for checkout preview / validate endpoint. Never mutates. */
export async function quoteDiscount(input: {
  code: string;
  subtotal: number;
  userId?: string | null;
  now?: Date;
}): Promise<DiscountQuote> {
  const row = await loadByRawCode(input.code);
  const perUserUsed =
    row.perUserLimit != null && input.userId
      ? await countPerUserUsed(prisma, row.id, input.userId)
      : undefined;
  assertCodeUsable(row, {
    subtotal: input.subtotal,
    userId: input.userId,
    now: input.now,
    perUserUsed,
  });
  const amount = computeDiscountAmount(row, input.subtotal);
  if (amount <= 0) {
    throw new DiscountError("INACTIVE", "این کد تخفیف قابل اعمال نیست");
  }
  return {
    discountCodeId: row.id,
    code: row.code,
    type: row.type === "FIXED" ? "FIXED" : "PERCENT",
    amount,
    finalTotal: input.subtotal - amount,
  };
}

/**
 * Redeem inside an open order transaction.
 * Sequence: load → stateless checks → atomic conditional usage-count
 * increment (the DB-level guard against races/exhaustion). The redemption row
 * itself is created by the caller once the order id exists, still inside the
 * same transaction, so a failed order rolls the increment back too.
 */
export async function redeemDiscountInTx(
  tx: Prisma.TransactionClient,
  input: { code: string; subtotal: number; userId?: string | null; now?: Date },
): Promise<DiscountQuote & { discountCodeId: string }> {
  const normalized = normalizeDiscountCode(input.code);
  if (!normalized) {
    throw new DiscountError("NOT_FOUND", "کد تخفیف یافت نشد");
  }
  const row = await tx.discountCode.findUnique({ where: { code: normalized } });
  if (!row) {
    throw new DiscountError("NOT_FOUND", "کد تخفیف یافت نشد");
  }
  assertCodeUsable(row, {
    subtotal: input.subtotal,
    userId: input.userId,
    now: input.now,
  });

  // Atomic gate: only increments when still active and under the usage limit.
  const gated = await tx.discountCode.updateMany({
    where: {
      id: row.id,
      isActive: true,
      archivedAt: null,
      ...(row.usageLimit != null ? { usedCount: { lt: row.usageLimit } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (gated.count === 0) {
    throw new DiscountError("EXHAUSTED", "سقف استفاده از این کد تخفیف تکمیل شده است");
  }

  // The update locks this code row until commit. Count this customer's
  // redemptions only after acquiring that lock, so simultaneous orders from
  // the same customer cannot both observe the old count.
  const locked = await tx.discountCode.findUniqueOrThrow({ where: { id: row.id } });
  const perUserUsed =
    locked.perUserLimit != null && input.userId
      ? await countPerUserUsed(tx, locked.id, input.userId)
      : undefined;
  assertCodeUsable({ ...locked, usedCount: locked.usedCount - 1 }, {
    subtotal: input.subtotal,
    userId: input.userId,
    now: input.now,
    perUserUsed,
  });

  const amount = computeDiscountAmount(locked, input.subtotal);
  if (amount <= 0) {
    throw new DiscountError("INACTIVE", "این کد تخفیف قابل اعمال نیست");
  }
  return {
    discountCodeId: locked.id,
    code: locked.code,
    type: locked.type === "FIXED" ? "FIXED" : "PERCENT",
    amount,
    finalTotal: input.subtotal - amount,
  };
}

/** Create the redemption ledger row for a just-created order (same tx). */
export async function recordRedemption(
  tx: Prisma.TransactionClient,
  quote: { discountCodeId: string; amount: number },
  orderId: string,
  userId?: string | null,
): Promise<void> {
  await tx.discountRedemption.create({
    data: {
      discountCodeId: quote.discountCodeId,
      orderId,
      userId: userId ?? null,
      amount: quote.amount,
    },
  });
}
