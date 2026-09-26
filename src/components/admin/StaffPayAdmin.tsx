"use client";

import { useCallback, useEffect, useState } from "react";
import { Price } from "@/components/ui/Price";
import { formatNumber } from "@/lib/format";
import { DEFAULT_MONTH_HOURS } from "@/lib/staff-pay";

type RateType = "MONTHLY" | "HOURLY";

type Rate = {
  id: string;
  payType: RateType;
  amount: number;
  effectiveAt: string;
  note: string | null;
  currency?: string;
};

type EstimateDay = {
  date: string;
  workedMin: number;
  overtimeMin: number;
  rate: Rate | null;
  estimate: {
    payType: RateType | null;
    regularMin: number;
    overtimeMin: number;
    regularPay: number;
    overtimePay: number;
    totalPay: number;
    note: string | null;
  };
};

type PayResponse = {
  staff: { id: string; name: string };
  rates: Rate[];
  current: Rate | null;
  editableIds: string[];
  currentHourlyPreview: number | null;
};

type EstimateResponse = {
  staff: { id: string; name: string };
  from: string;
  to: string;
  days: EstimateDay[];
  summary: { totalPay: number; totalWorkedMin: number; totalOvertimeMin: number; dayCount: number };
};

function toInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toGregorianInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadPay(staffId: string): Promise<PayResponse | null> {
  try {
    const res = await fetch(`/api/admin/staff/${staffId}/pay`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PayResponse;
  } catch {
    return null;
  }
}

async function loadEstimate(staffId: string, from: string, to: string): Promise<EstimateResponse | null> {
  try {
    const res = await fetch(
      `/api/admin/staff/${staffId}/pay/estimate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as EstimateResponse;
  } catch {
    return null;
  }
}

export function StaffPayAdmin({ staffId, staffName }: { staffId: string; staffName: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [payType, setPayType] = useState<RateType>("MONTHLY");
  const [amount, setAmount] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`;
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [estFrom, setEstFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toGregorianInput(d);
  });
  const [estTo, setEstTo] = useState(() => toGregorianInput(new Date()));
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estLoading, setEstLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await loadPay(staffId);
    setData(res);
    setLoading(false);
  }, [staffId]);

  useEffect(() => {
    if (open && !data) void refresh();
  }, [open, data, refresh]);

  // Estimate is Tehran-anchored server-side; reload when the range changes.
  useEffect(() => {
    if (!open) return;
    setEstLoading(true);
    loadEstimate(staffId, estFrom, estTo)
      .then(setEstimate)
      .finally(() => setEstLoading(false));
  }, [open, staffId, estFrom, estTo]);

  const monthlyPreview =
    payType === "MONTHLY" && Number(amount) > 0
      ? Math.round(Number(amount) / DEFAULT_MONTH_HOURS)
      : null;

  async function submit() {
    const v = Number(amount);
    if (!Number.isInteger(v) || v <= 0) {
      setError("مبلغ حقوق باید عدد صحیح مثبت باشد (تومان)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/admin/staff/${staffId}/pay/${editingId}`
        : `/api/admin/staff/${staffId}/pay`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payType,
          amount: v,
          effectiveAt: new Date(effectiveAt).toISOString(),
          note: note.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "خطا در ذخیره نرخ");
      setAmount("");
      setNote("");
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره نرخ");
    } finally {
      setSaving(false);
    }
  }

  function editRate(r: Rate) {
    setEditingId(r.id);
    setPayType(r.payType);
    setAmount(String(r.amount));
    setEffectiveAt(toInput(r.effectiveAt));
    setNote(r.note ?? "");
    setError(null);
  }

  async function removeRate(r: Rate) {
    if (!confirm("حذف این نرخ؟ فقط نرخ‌های آینده قابل حذف هستند.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff/${staffId}/pay/${r.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "فقط نرخ آینده قابل حذف است");
      if (editingId === r.id) {
        setEditingId(null);
        setAmount("");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فقط نرخ آینده قابل حذف است");
    }
  }

  return (
    <div className="rounded-2xl border border-coffee/10 p-3 dark:border-dark-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !data) void refresh();
        }}
        aria-expanded={open}
      >
        <span>
          💼 دستمزد {staffName}
          {data?.current ? (
            <span className="ms-2 text-xs font-normal text-muted">
              نرخ فعلی:{" "}
              {data.current.payType === "HOURLY"
                ? `${formatNumber(data.current.amount)} تومان/ساعت`
                : `${formatNumber(data.current.amount)} تومان/ماه`}
              {data.currentHourlyPreview != null && data.current.payType === "MONTHLY"
                ? ` (≈ ${formatNumber(data.currentHourlyPreview)}/ساعت)`
                : ""}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loading && !data && <p className="text-xs text-muted">در حال بارگذاری...</p>}

          {data?.current && data.current.payType === "MONTHLY" && (
            <p className="text-xs text-muted">
              تبدیل ماهانه به ساعتی: {formatNumber(data.current.amount)} ÷{" "}
              {formatNumber(DEFAULT_MONTH_HOURS)} ={" "}
              <strong>{formatNumber(data.currentHourlyPreview ?? 0)}</strong> تومان به ازای هر
              ساعت. اضافه‌کاری با همین نرخ پرداخت می‌شود و جداگانه گزارش می‌گردد.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-5">
            <label className="text-xs text-muted">
              نوع
              <select
                className="input mt-1 w-full"
                value={payType}
                onChange={(e) => setPayType(e.target.value as RateType)}
              >
                <option value="MONTHLY">ماهانه (تومان)</option>
                <option value="HOURLY">ساعتی (تومان)</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              مبلغ (تومان)
              <input
                type="number"
                min={0}
                step={1}
                className="input mt-1 w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={payType === "MONTHLY" ? "مثلاً ۸٬۰۰۰٬۰۰۰" : "مثلاً ۱۵۰٬۰۰۰"}
              />
            </label>
            <label className="text-xs text-muted">
              از (مؤثر از)
              <input
                type="datetime-local"
                className="input mt-1 w-full"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
              />
            </label>
            <label className="text-xs text-muted">
              یادداشت
              <input
                className="input mt-1 w-full"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="flex items-end">
              <button type="button" className="btn-primary w-full text-sm" onClick={submit} disabled={saving}>
                {saving ? "ذخیره..." : editingId ? "به‌روزرسانی" : "ثبت نرخ"}
              </button>
            </div>
          </div>

          {monthlyPreview != null && (
            <p className="text-xs text-olive-600 dark:text-olive-300">
              معادل ساعتی: {formatNumber(monthlyPreview)} تومان (÷ {formatNumber(DEFAULT_MONTH_HOURS)} ساعت)
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}

          {data && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold">تخمین دستمزد (Asia/Tehran)</h4>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <label>
                      از{" "}
                      <input
                        type="date"
                        className="input !w-auto !px-2 !py-1"
                        value={estFrom}
                        onChange={(e) => setEstFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      تا{" "}
                      <input
                        type="date"
                        className="input !w-auto !px-2 !py-1"
                        value={estTo}
                        onChange={(e) => setEstTo(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                {estLoading && !estimate ? (
                  <p className="text-xs text-muted">در حال محاسبه...</p>
                ) : estimate ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-4 text-xs text-muted">
                      <span>
                        ساعات عادی: {formatNumber(Math.floor(estimate.summary.totalWorkedMin / 60))} ساعت و{" "}
                        {formatNumber(estimate.summary.totalWorkedMin % 60)} دقیقه
                      </span>
                      <span>
                        اضافه‌کاری: {formatNumber(Math.floor(estimate.summary.totalOvertimeMin / 60))} ساعت و{" "}
                        {formatNumber(estimate.summary.totalOvertimeMin % 60)} دقیقه
                      </span>
                      <span>
                        برآورد دستمزد: <Price amount={estimate.summary.totalPay} size="sm" />
                      </span>
                      <span>
                        روزهای دارای حاضری: {formatNumber(estimate.summary.dayCount)} روز
                      </span>
                    </div>
                    {estimate.days.length > 0 && (
                      <ul className="max-h-48 divide-y divide-coffee/10 overflow-y-auto text-xs dark:divide-dark-border">
                        {estimate.days.map((d) => (
                          <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span className="text-muted">{d.date}</span>
                            <span>
                              عادی {formatNumber(d.estimate.regularMin)} دقیقه (
                              <Price amount={d.estimate.regularPay} size="sm" />)
                              {" · "}اضافه‌کار {formatNumber(d.estimate.overtimeMin)} دقیقه (
                              <Price amount={d.estimate.overtimePay} size="sm" />)
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted">داده‌ای برای تخمین موجود نیست.</p>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold">تاریخچه نرخ‌ها</h4>
                {data.rates.length === 0 ? (
                  <p className="text-xs text-muted">هنوز نرخی ثبت نشده است.</p>
                ) : (
                  <ul className="divide-y divide-coffee/10 text-sm dark:divide-dark-border">
                    {data.rates.map((r) => {
                      const future = new Date(r.effectiveAt).getTime() > Date.now();
                      const editable = data.editableIds.includes(r.id);
                      return (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span className="text-xs">
                            <strong>
                              {r.payType === "HOURLY"
                                ? `${formatNumber(r.amount)} تومان/ساعت`
                                : `${formatNumber(r.amount)} تومان/ماه`}
                            </strong>{" "}
                            <span className="text-muted">
                              از {new Date(r.effectiveAt).toLocaleString("fa-IR")}
                              {r.note ? ` · ${r.note}` : ""}
                            </span>
                            {future && (
                              <span className="ms-2 rounded-full bg-olive/10 px-2 py-0.5 text-[10px] text-olive-600 dark:text-olive-300">
                                آینده
                              </span>
                            )}
                          </span>
                          <span className="flex gap-2">
                            {editable ? (
                              <>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-[11px]" onClick={() => editRate(r)}>
                                  ویرایش
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary !px-2 !py-1 text-[11px] text-danger"
                                  onClick={() => removeRate(r)}
                                >
                                  حذف
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-muted">فقط خواندنی</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
