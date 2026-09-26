import { describe, it, expect } from "vitest";
import {
  validatePayInput,
  resolvePayRate,
  estimateHourlyPay,
  previewHourlyFromMonthly,
  describeRate,
  DEFAULT_MONTH_HOURS,
  PayError,
} from "@/lib/staff-pay";

describe("validatePayInput", () => {
  it("accepts monthly and hourly rates in toman with an effective date", () => {
    const out = validatePayInput({ payType: "MONTHLY", amount: 8_000_000 });
    expect(out.payType).toBe("MONTHLY");
    expect(out.amount).toBe(8_000_000);
    expect(out.effectiveAt).toBeInstanceOf(Date);
  });
  it.each([
    ["bad type", { payType: "DAILY", amount: 100 }],
    ["zero", { payType: "HOURLY", amount: 0 }],
    ["negative", { payType: "HOURLY", amount: -5 }],
    ["fractional", { payType: "HOURLY", amount: 10.5 }],
    ["absurd", { payType: "MONTHLY", amount: 99_000_000_000 }],
  ])("rejects %s amounts", (_label, input) => {
    expect(() => validatePayInput(input as never)).toThrowError(PayError);
  });
  it("rejects invalid effective dates", () => {
    expect(() =>
      validatePayInput({ payType: "HOURLY", amount: 100_000, effectiveAt: new Date("bad") }),
    ).toThrowError("تاریخ اعمال نامعتبر است");
  });
});

describe("resolvePayRate (append-only history)", () => {
  const rates = [
    { id: "r1", payType: "MONTHLY", amount: 8_000_000, effectiveAt: new Date("2026-01-01T00:00:00+03:30") },
    { id: "r2", payType: "MONTHLY", amount: 9_000_000, effectiveAt: new Date("2026-03-01T00:00:00+03:30") },
  ];
  it("resolves the rate in force on a given day", () => {
    expect(resolvePayRate(rates, new Date("2026-02-01T00:00:00+03:30"))?.id).toBe("r1");
    expect(resolvePayRate(rates, new Date("2026-03-15T00:00:00+03:30"))?.id).toBe("r2");
  });
  it("never applies future rates to past periods", () => {
    expect(resolvePayRate(rates, new Date("2025-12-01T00:00:00+03:30"))).toBeNull();
  });
  it("returns null without history", () => {
    expect(resolvePayRate([], new Date())).toBeNull();
  });
});

describe("estimateHourlyPay (no invented overtime multiplier)", () => {
  it("pays hourly rates for regular and overtime minutes separately at the same rate", () => {
    const est = estimateHourlyPay({
      workedMin: 600,
      overtimeMin: 120,
      rate: { payType: "HOURLY", amount: 120_000, effectiveAt: new Date() },
    });
    expect(est.regularMin).toBe(480);
    expect(est.overtimeMin).toBe(120);
    expect(est.regularPay).toBe(960_000);
    expect(est.overtimePay).toBe(240_000);
    expect(est.totalPay).toBe(est.regularPay + est.overtimePay);
  });
  it("pro-rates monthly pay over the default month hours", () => {
    const est = estimateHourlyPay({
      workedMin: 60,
      overtimeMin: 0,
      rate: { payType: "MONTHLY", amount: 220_000, effectiveAt: new Date() },
    });
    // 220_000 / 220h = 1_000/h → 1_000 for one hour.
    expect(est.totalPay).toBe(1_000);
  });
  it("pays 0 without a rate or without work", () => {
    expect(estimateHourlyPay({ workedMin: 60, overtimeMin: 0, rate: null }).totalPay).toBe(0);
    expect(
      estimateHourlyPay({
        workedMin: 0,
        overtimeMin: 0,
        rate: { payType: "HOURLY", amount: 100, effectiveAt: new Date() },
      }).totalPay,
    ).toBe(0);
  });
  it("clamps overtime to worked minutes", () => {
    const est = estimateHourlyPay({
      workedMin: 60,
      overtimeMin: 600,
      rate: { payType: "HOURLY", amount: 60, effectiveAt: new Date() },
    });
    expect(est.overtimeMin).toBe(60);
    expect(est.regularMin).toBe(0);
  });
});

describe("previews and labels", () => {
  it("previews hourly equivalents from monthly amounts", () => {
    expect(previewHourlyFromMonthly(8_800_000)).toBe(Math.round(8_800_000 / DEFAULT_MONTH_HOURS));
    expect(DEFAULT_MONTH_HOURS).toBe(220);
  });
  it("describes rates with the toman currency unit", () => {
    expect(describeRate({ payType: "MONTHLY", amount: 8_000_000, effectiveAt: new Date() })).toContain("تومان");
    expect(describeRate(null)).toBe("تعریف نشده");
  });
});
