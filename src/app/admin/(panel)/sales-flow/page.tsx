"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { formatNumber, formatToman } from "@/lib/format";
import { JalaliDateInput } from "@/components/ui/JalaliInputs";
import { formatJalaliDate, formatJalaliDateTime, todayGregorianInput } from "@/lib/jalali";
import { WaitTimePanel } from "@/components/admin/WaitTimePanel";
import { SALES_FLOW_REFRESH_MS } from "@/lib/admin-timing";
import { ModulePage } from "@/components/admin/dashboard/ModulePage";
import { StatCard } from "@/components/admin/dashboard/charts/StatCard";

function OrdersIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h2l2.4 10.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.5L20 9H6" /><circle cx="10" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>;
}
function RevenueIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M21 10h-4a2 2 0 0 0 0 4h4" /></svg>;
}
function ItemsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16l-1.2 12.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>;
}
function CancelledIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
}
function AverageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="m7 15 3.5-4 3 2.5L20 7" /></svg>;
}

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
      <ModulePage kind="accounting" title="جریان فروش">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[rgb(var(--module-primary-rgb)/0.75)] border-t-transparent" />
        </div>
      </ModulePage>
    );
  }

  if (!data) {
    return (
      <ModulePage kind="accounting" title="جریان فروش">
        <div className="py-8 text-center text-dashboard-muted">داده‌ای یافت نشد</div>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      kind="accounting"
      title="جریان فروش"
      related={[
        { href: "/admin/accounting", label: "حسابداری", icon: "💰" },
        { href: "/admin/financial", label: "گزارش مالی", icon: "📊" },
      ]}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          aria-label="بازه"
          value={range}
          onChange={(e) => {
            setRange(e.target.value);
            if (e.target.value !== "custom") {
              setCustomFrom("");
              setCustomTo("");
            }
          }}
          className="min-h-9 w-auto rounded-full border border-dashboard-line bg-dashboard-surface px-3 text-[12px] font-semibold text-dashboard-foreground outline-none transition-colors hover:border-[rgb(var(--module-primary-rgb)/0.6)]"
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
            <JalaliDateInput value={customFrom} onChange={setCustomFrom} className="min-h-9 w-auto rounded-full border border-dashboard-line bg-dashboard-surface px-3 text-[12px] text-dashboard-foreground" ariaLabel="از تاریخ" />
            <JalaliDateInput value={customTo} onChange={setCustomTo} className="min-h-9 w-auto rounded-full border border-dashboard-line bg-dashboard-surface px-3 text-[12px] text-dashboard-foreground" ariaLabel="تا تاریخ" />
          </>
        )}
        <label className="ml-2 flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 rounded border-dashboard-line-strong bg-dashboard-surface accent-[var(--module-primary)]"
          />
          <span className="text-dashboard-muted">بروزرسانی خودکار</span>
        </label>
        {lastRefresh && (
          <span className="ml-1 text-[11px] text-dashboard-muted">
            آخرین بروزرسانی: {formatJalaliDateTime(lastRefresh)}
          </span>
        )}
        <button
          onClick={fetchData}
          disabled={loading}
          className="module-button-ghost inline-flex min-h-9 items-center rounded-full border border-dashboard-line bg-dashboard-surface px-4 text-[12px] font-semibold text-dashboard-foreground transition-all hover:brightness-110"
        >
          بروزرسانی
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="کل سفارش‌ها" value={formatNumber(data.summary.totalOrders)} icon={<OrdersIcon />} />
        <StatCard label="کل درآمد" value={formatToman(data.summary.totalRevenue)} icon={<RevenueIcon />} />
        <StatCard label="تعداد آیتم‌ها" value={formatNumber(data.summary.totalItems)} icon={<ItemsIcon />} />
        <StatCard label="سفارش‌های لغو" value={formatNumber(data.summary.totalCancelled)} icon={<CancelledIcon />} />
        <StatCard
          label="میانگین سفارش"
          icon={<AverageIcon />}
          value={
            data.summary.totalOrders > 0
              ? formatToman(Math.round(data.summary.totalRevenue / data.summary.totalOrders))
              : "—"
          }
        />
      </div>

      <div className="mb-5 rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
        <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-sm font-semibold text-dashboard-foreground">نمودار درآمد بر اساس بازه زمانی</h2>
          <div className="flex items-center gap-2 text-[11px] text-dashboard-muted">
            <span>دقت: {data.settings.granularityMin} دقیقه</span>
            <span>|</span>
            <span>بازه‌ها: {data.intervals.length}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            className="flex h-48 min-w-max items-end gap-1"
            dir="ltr"
            style={{ minWidth: `${Math.max(data.intervals.length * 36, 600)}px` }}
          >
            {data.intervals.map((interval) => (
              <div
                key={`${interval.start}-${interval.end}`}
                className="group relative flex min-w-[32px] flex-1 flex-col items-center"
                style={{ minWidth: "32px" }}
              >
                <div
                  className="w-full cursor-pointer rounded-t bg-[rgb(var(--module-primary-rgb)/0.75)] transition-all group-hover:bg-[var(--module-primary)]"
                  style={{ height: `${Math.max(4, (interval.revenue / maxRevenue) * 140)}px` }}
                  title={`${interval.label} (${formatJalaliDate(interval.dayDate)}): ${formatToman(interval.revenue)} | سفارش‌ها: ${formatNumber(interval.orders)} | آیتم‌ها: ${formatNumber(interval.items)}`}
                />
                <div className="mt-1 whitespace-nowrap text-center text-[11px] text-dashboard-muted">
                  {interval.label}
                </div>
                {interval.cancelled > 0 && (
                  <div className="whitespace-nowrap text-center text-[11px] text-accent-red">
                    لغو: {formatNumber(interval.cancelled)}
                  </div>
                )}
              </div>
            ))}
          </div>
          {showHorizontalScroll && (
            <p className="mt-2 text-center text-[11px] text-dashboard-muted">
              برای مشاهده کامل، به چپ و راست اسکرول کنید ({data.intervals.length} بازه)
            </p>
          )}
        </div>
      </div>

      <div className="mb-5 overflow-hidden rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
        <h2 className="mb-3 text-sm font-semibold text-dashboard-foreground">جدول جزئیات</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-dashboard-line bg-dashboard-surface">
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">بازه</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">تاریخ</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">روز</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">سفارش‌ها</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">آیتم‌ها</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">درآمد</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted" title="سود بر اساس درآمد سفارش منهای هزینهٔ مواد اولیه">سود (مواد)</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">میانگین سفارش</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-muted">لغو</th>
              </tr>
            </thead>
            <tbody>
              {data.intervals.map((interval) => (
                <tr key={`${interval.start}-${interval.end}`} className="border-b border-dashboard-line/60 transition-colors hover:bg-dashboard-raised">
                  <td className="whitespace-nowrap px-3 py-2 text-right text-dashboard-foreground">{interval.label}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-dashboard-muted">{formatJalaliDate(interval.dayDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-dashboard-muted">{DAYS_FA[interval.dayIndex]}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-dashboard-foreground">{formatNumber(interval.orders)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-dashboard-muted">{formatNumber(interval.items)}</td>
                  <td className="module-accent-text whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{formatToman(interval.revenue)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-dashboard-foreground">
                    {interval.profit == null ? <span className="font-normal text-dashboard-muted">نامشخص</span> : formatToman(interval.profit)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-dashboard-muted">
                    {interval.avgOrderValue > 0 ? formatToman(interval.avgOrderValue) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-accent-red">{formatNumber(interval.cancelled)}</td>
                </tr>
              ))}
              {data.intervals.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-dashboard-muted">
                    داده‌ای برای این بازه وجود ندارد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-5 rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
        <h2 className="mb-1 text-sm font-semibold text-dashboard-foreground">⏱️ زمان انتظار و گلوگاه‌ها</h2>
        <p className="mb-3 text-[11px] text-dashboard-muted">این بخش روی بازهٔ زمانی انتخاب‌شدهٔ بالای صفحه اعمال می‌شود.</p>
        <WaitTimePanel from={waitRange.from} to={waitRange.to} />
      </div>

      <div className="rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
        <h2 className="mb-3 text-sm font-semibold text-dashboard-foreground">تنظیمات جاری</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-dashboard-muted">دقت زمانی: </span>
            <span className="font-medium text-dashboard-foreground">{data.settings.granularityMin} دقیقه</span>
          </div>
          <div>
            <span className="text-dashboard-muted">منطقه زمانی: </span>
            <span className="font-medium text-dashboard-foreground">{data.settings.timezone}</span>
          </div>
          <div>
            <span className="text-dashboard-muted">بازه نمایش: </span>
            <span className="font-medium text-dashboard-foreground">
              {formatJalaliDate(data.summary.from)} تا
              {formatJalaliDate(data.summary.to)}
            </span>
          </div>
          <div>
            <span className="text-dashboard-muted">تعداد بازه‌ها: </span>
            <span className="font-medium text-dashboard-foreground">{data.intervals.length}</span>
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
