import { formatNumber } from "./format";

/**
 * Staff pay: append-only rate history + hourly estimation.
 * All amounts are integer toman. No overtime multiplier is invented —
 * overtime minutes are paid at the same resolved hourly rate, and the
 * breakdown is returned separately so the UI can label it honestly.
 */

export type PayType = "MONTHLY" | "HOURLY";

export type PayRateRow = {
  id?: string;
  payType: string;
  amount: number;
  effectiveAt: Date;
};

export type PayInput = {
  payType: string;
  amount: number;
  effectiveAt?: Date;
};

export class PayError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PayError";
  }
}

export function validatePayInput(input: PayInput): { payType: PayType; amount: number; effectiveAt: Date } {
  if (input.payType !== "MONTHLY" && input.payType !== "HOURLY") {
    throw new PayError("INVALID_PAY_TYPE", "نوع حقوق نامعتبر است");
  }
  if (!Number.isFinite(input.amount) || !Number.isInteger(input.amount) || input.amount <= 0) {
    throw new PayError("INVALID_AMOUNT", "مبلغ حقوق باید عدد صحیح مثبت باشد");
  }
  if (input.amount > 10_000_000_000) {
    throw new PayError("INVALID_AMOUNT", "مبلغ حقوق غیرمعتبر است");
  }
  const effectiveAt = input.effectiveAt ?? new Date();
  if (Number.isNaN(effectiveAt.getTime())) {
    throw new PayError("INVALID_EFFECTIVE_AT", "تاریخ اعمال نامعتبر است");
  }
  return { payType: input.payType, amount: input.amount, effectiveAt };
}

/**
 * Resolve the pay rate in force on a given day: the latest rate whose
 * effectiveAt is on or before `on`. Rates sorted desc by effectiveAt.
 */
export function resolvePayRate<T extends PayRateRow>(rates: T[], on: Date): T | null {
  if (!rates.length) return null;
  const sorted = [...rates].sort(
    (a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime(),
  );
  for (const rate of sorted) {
    if (rate.effectiveAt.getTime() <= on.getTime()) return rate;
  }
  return null;
}

export type AttendancePayInput = {
  workedMin: number;
  overtimeMin: number;
  /** Rate in force for this attendance day. */
  rate: PayRateRow | null;
  /** Hours in a full month, used only to pro-rate MONTHLY pay. */
  monthHours?: number;
};

export type AttendancePayEstimate = {
  payType: PayType | null;
  regularMin: number;
  overtimeMin: number;
  regularPay: number;
  overtimePay: number;
  totalPay: number;
  note: string | null;
};

export const DEFAULT_MONTH_HOURS = 220; // ~7.33h × 30d planning figure; labeled in UI.

/** Estimate pay for one attendance record. Zero/negative work pays 0. */
export function estimateHourlyPay(input: AttendancePayInput): AttendancePayEstimate {
  const worked = Math.max(0, input.workedMin);
  const overtime = Math.max(0, Math.min(input.overtimeMin, worked));
  const regularMin = Math.max(0, worked - overtime);
  const base: AttendancePayEstimate = {
    payType: null,
    regularMin,
    overtimeMin: overtime,
    regularPay: 0,
    overtimePay: 0,
    totalPay: 0,
    note: null,
  };
  if (!input.rate || worked <= 0) {
    return { ...base, note: input.rate ? null : "برای این روز تعریف حقوق ثبت نشده است" };
  }

  const payType = input.rate.payType === "MONTHLY" ? "MONTHLY" : "HOURLY";
  let hourly: number;
  if (payType === "HOURLY") {
    hourly = input.rate.amount;
  } else {
    const monthHours = input.monthHours && input.monthHours > 0 ? input.monthHours : DEFAULT_MONTH_HOURS;
    hourly = Math.round(input.rate.amount / monthHours);
  }

  const regularPay = Math.round((hourly * regularMin) / 60);
  const overtimePay = Math.round((hourly * overtime) / 60);
  return {
    payType,
    regularMin,
    overtimeMin: overtime,
    regularPay,
    overtimePay,
    totalPay: regularPay + overtimePay,
    note: null,
  };
}

/** Hourly-equivalent preview used when the owner is setting a MONTHLY rate. */
export function previewHourlyFromMonthly(monthly: number, monthHours = DEFAULT_MONTH_HOURS): number {
  if (monthly <= 0 || monthHours <= 0) return 0;
  return Math.round(monthly / monthHours);
}

export function describeRate(rate: PayRateRow | null): string {
  if (!rate) return "تعریف نشده";
  const type = rate.payType === "MONTHLY" ? "ماهانه" : "ساعتی";
  return `${formatNumber(rate.amount)} تومان (${type})`;
}
