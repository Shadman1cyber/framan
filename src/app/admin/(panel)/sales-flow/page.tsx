"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { formatNumber, formatToman } from "@/lib/format";
import { JalaliDateInput } from "@/components/ui/JalaliInputs";
import { formatJalaliDate, formatJalaliDateTime, todayGregorianInput } from "@/lib/jalali";
import { WaitTimePanel } from "@/components/admin/WaitTimePanel";
import { SALES_FLOW_REFRESH_MS } from "@/lib/admin-timing";

type SalesFlowInterval = {
  start: string;
  end: string;
  label: string;
  dayIndex: number;
  dayDate: string;
  orders: number;
  revenue: number;
  profit: number | null;
  items: number;
  avgOrderValue: number;
  cancelled: number;
};

type SalesFlowData = {
  intervals: SalesFlowInterval[];
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalItems: number;
    totalCancelled: number;
    granularity: number;
    timezone: string;
    from: string;
    to: string;
  };
  settings: {
    granularityMin: number;
    timezone: string;
  };
};

const DAYS_FA = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه",
];

const RANGE_OPTIONS = [
  { value: "today", label: "امروز" },
  { value: "yesterday", label: "دیروز" },
  { value: "week", label: "این هفته" },
  { value: "month", label: "این ماه" },
];

const REFRESH_INTERVAL_MS = SALES_FLOW_REFRESH_MS;

export default function SalesFlowPage() {
  const [data, setData] = useState<SalesFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("range", range);
      if (range === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      const res = await fetch(`/api/admin/sales-flow/data?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setLastRefresh(new Date());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo]);

  // Set up auto-refresh timer
  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      refreshTimerRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [fetchData, autoRefresh]);

  const maxRevenue = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.intervals.map((i) => i.revenue), 1);
  }, [data]);

  const maxOrders = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.intervals.map((i) => i.orders), 1);
  }, [data]);

  const intervalsByDay = useMemo(() => {
    if (!data) return {};
    const grouped: Record<number, SalesFlowInterval[]> = {};
    for (const interval of data.intervals) {
      if (!grouped[interval.dayIndex]) grouped[interval.dayIndex] = [];
      grouped[interval.dayIndex].push(interval);
    }
    return grouped;
  }, [data]);

  const dayIndices = useMemo(() => {
    return Object.keys(intervalsByDay)
      .map(Number)
      .sort((a, b) => a - b);
  }, [intervalsByDay]);

  const showHorizontalScroll = useMemo(() => {
    if (!data) return false;
    return data.intervals.length > 16;
  }, [data]);

  // Gregorian YYYY-MM-DD helpers (Tehran "today"), used by the wait-time panel
  const shiftGregorian = useCallback((greg: string, deltaDays: number): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(greg);
    if (!m) return greg;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + deltaDays * 86400000);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  }, []);

  const monthAgoGregorian = useCallback((greg: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(greg);
    if (!m) return greg;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCMonth(d.getUTCMonth() - 1);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  }, []);

  // Wait-time panel follows the same range as the sales-flow data
  const waitRange = useMemo(() => {
    const today = todayGregorianInput();
    if (range === "custom") {
      let from = customFrom || shiftGregorian(today, -13);
      let to = customTo || today;
      if (from > to) [from, to] = [to, from];
      return { from, to };
    }
    if (range === "yesterday") {
      const y = shiftGregorian(today, -1);
      return { from: y, to: y };
    }
    if (range === "week") {
      return { from: shiftGregorian(today, -6), to: today };
    }
    if (range === "month") {
      return { from: monthAgoGregorian(today), to: today };
    }
    return { from: today, to: today };
  }, [range, customFrom, customTo, shiftGregorian, monthAgoGregorian]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-olive border-t-transparent"></div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-muted py-8">داده‌ای یافت نشد</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="heading-section">جریان فروش</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
              if (e.target.value !== "custom") {
                setCustomFrom("");
                setCustomTo("");
              }
            }}
            className="input w-auto"
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option value="custom">بازه سفارشی</option>
          </select>
          {range === "custom" && (
            <>
              <JalaliDateInput value={customFrom} onChange={setCustomFrom} className="input w-auto" ariaLabel="از تاریخ" />
              <JalaliDateInput value={customTo} onChange={setCustomTo} className="input w-auto" ariaLabel="تا تاریخ" />
            </>
          )}
          <label className="flex items-center gap-2 text-sm ml-4">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-coffee/30 text-olive focus:ring-olive"
            />
            <span className="text-muted">بروزرسانی خودکار</span>
          </label>
          {lastRefresh && (
            <span className="text-xs text-muted ml-2">
              آخرین بروزرسانی: {formatJalaliDateTime(lastRefresh)}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-secondary text-sm"
          >
            بروزرسانی
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-6">
        <div className="card p-4">
          <div className="text-xs text-muted">کل سفارش‌ها</div>
          <div className="mt-1 text-2xl font-bold text-espresso dark:text-dark-text">{formatNumber(data.summary.totalOrders)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">کل درآمد</div>
          <div className="mt-1 text-xl font-bold text-espresso dark:text-dark-text">{formatToman(data.summary.totalRevenue)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">تعداد آیتم‌ها</div>
          <div className="mt-1 text-2xl font-bold text-espresso dark:text-dark-text">{formatNumber(data.summary.totalItems)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">سفارش‌های لغو</div>
          <div className="mt-1 text-2xl font-bold text-rose">{formatNumber(data.summary.totalCancelled)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">میانگین سفارش</div>
          <div className="mt-1 text-xl font-bold text-olive">
            {data.summary.totalOrders > 0
              ? formatToman(Math.round(data.summary.totalRevenue / data.summary.totalOrders))
              : "—"}
          </div>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold">نمودار درآمد بر اساس بازه زمانی</h2>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>دقت: {data.settings.granularityMin} دقیقه</span>
            <span>|</span>
            <span>بازه‌ها: {data.intervals.length}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            className="flex h-48 items-end gap-1 min-w-max"
            dir="ltr"
            style={{ minWidth: `${Math.max(data.intervals.length * 36, 600)}px` }}
          >
            {data.intervals.map((interval, idx) => (
              <div
                key={`${interval.start}-${interval.end}`}
                className="group relative flex-1 min-w-[32px] flex flex-col items-center"
                style={{ minWidth: "32px" }}
              >
                <div
                  className="w-full rounded-t bg-olive/70 transition-all group-hover:bg-olive cursor-pointer"
                  style={{ height: `${Math.max(4, (interval.revenue / maxRevenue) * 140)}px` }}
                  title={`${interval.label} (${formatJalaliDate(interval.dayDate)}): ${formatToman(interval.revenue)} | سفارش‌ها: ${formatNumber(interval.orders)} | آیتم‌ها: ${formatNumber(interval.items)}`}
                />
                <div className="mt-1 text-[10px] text-center text-muted whitespace-nowrap">
                  {interval.label}
                </div>
                {interval.cancelled > 0 && (
                  <div className="text-[9px] text-center text-rose whitespace-nowrap">
                    لغو: {formatNumber(interval.cancelled)}
                  </div>
                )}
              </div>
            ))}
          </div>
          {showHorizontalScroll && (
            <p className="mt-2 text-xs text-muted text-center">
              برای مشاهده کامل، به چپ و راست اسکرول کنید ({data.intervals.length} بازه)
            </p>
          )}
        </div>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="mb-3 text-sm font-semibold">جدول جزئیات</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-coffee/10 sticky top-0 bg-cream z-10">
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">بازه</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">تاریخ</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">روز</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">سفارش‌ها</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">آیتم‌ها</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">درآمد</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap" title="سود بر اساس درآمد سفارش منهای هزینهٔ مواد اولیه">سود (مواد)</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">میانگین سفارش</th>
                <th className="py-2 px-3 text-right font-medium text-muted whitespace-nowrap">لغو</th>
              </tr>
            </thead>
            <tbody>
              {data.intervals.map((interval) => (
                <tr key={`${interval.start}-${interval.end}`} className="border-b border-coffee/5 dark:border-dark-border/5 hover:bg-beige-soft/50 dark:hover:bg-dark-surfaceHover/50">
                  <td className="py-2 px-3 text-right text-espresso dark:text-dark-text whitespace-nowrap">{interval.label}</td>
                  <td className="py-2 px-3 text-right text-muted whitespace-nowrap">{formatJalaliDate(interval.dayDate)}</td>
                  <td className="py-2 px-3 text-right text-muted whitespace-nowrap">{DAYS_FA[interval.dayIndex]}</td>
                  <td className="py-2 px-3 text-right font-medium text-espresso dark:text-dark-text tabular-nums">{formatNumber(interval.orders)}</td>
                  <td className="py-2 px-3 text-right text-muted tabular-nums">{formatNumber(interval.items)}</td>
                  <td className="py-2 px-3 text-right font-medium text-olive tabular-nums">{formatToman(interval.revenue)}</td>
                  <td className="py-2 px-3 text-right font-medium text-olive tabular-nums">
                    {interval.profit == null ? <span className="font-normal text-muted">نامشخص</span> : formatToman(interval.profit)}
                  </td>
                  <td className="py-2 px-3 text-right text-muted tabular-nums">
                    {interval.avgOrderValue > 0 ? formatToman(interval.avgOrderValue) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-rose tabular-nums">{formatNumber(interval.cancelled)}</td>
                </tr>
              ))}
              {data.intervals.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted">
                    داده‌ای برای این بازه وجود ندارد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="mb-1 text-sm font-semibold">⏱️ زمان انتظار و گلوگاه‌ها</h2>
        <p className="mb-3 text-xs text-muted">این بخش روی بازهٔ زمانی انتخاب‌شدهٔ بالای صفحه اعمال می‌شود.</p>
        <WaitTimePanel from={waitRange.from} to={waitRange.to} />
      </div>

      <div className="mt-4 card p-4">
        <h2 className="mb-3 text-sm font-semibold">تنظیمات جاری</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted">دقت زمانی: </span>
            <span className="font-medium">{data.settings.granularityMin} دقیقه</span>
          </div>
          <div>
            <span className="text-muted">منطقه زمانی: </span>
            <span className="font-medium">{data.settings.timezone}</span>
          </div>
          <div>
            <span className="text-muted">بازه نمایش: </span>
            <span className="font-medium">
              {formatJalaliDate(data.summary.from)} تا
              {formatJalaliDate(data.summary.to)}
            </span>
          </div>
          <div>
            <span className="text-muted">تعداد بازه‌ها: </span>
            <span className="font-medium">{data.intervals.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
