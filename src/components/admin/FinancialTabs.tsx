"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { GoalsPanel, MatrixPanel, SalesPanel, type ProductOpt } from "@/components/admin/OperationsDashboard";
import { Price } from "@/components/ui/Price";
import { formatNumber, formatToman } from "@/lib/format";
import { JalaliDateInput } from "@/components/ui/JalaliInputs";
import { formatJalaliDate } from "@/lib/jalali";
type S = { revenue: { today: number | null; week: number | null; month: number | null }; orders: { today: number }; averageOrderValue: { month: number | null }; ordersByType: { takeaway: number; table: number }; discounts?: { today: number | null; month: number | null; total: number | null; ordersWithDiscount: { today: number; month: number } } };
type P = { summary: S; top: { productId: string; name: string; quantity: number; revenue: number }[]; byCategory: { category: string; revenue: number }[]; daily: { date: string; revenue: number }[]; lowStock: { ingredientId: string; name: string; stock: number; unit: string }[]; lowStockCost: number; ops: { activeOrders: number; avgActualPrepMinutes: number | null }; products: ProductOpt[]; defaultFrom: string; defaultTo: string };
export function FinancialTabs(a: P) {
  const { summary, top, byCategory, daily, lowStock, lowStockCost, ops, products, defaultFrom, defaultTo } = a;
  const [tab, setTab] = useState<"summary" | "sales" | "matrix" | "goals">("sales");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const { show } = useToast();
  const maxDaily = Math.max(...daily.map((d) => d.revenue), 1);
  const cards = [
    { label: "درآمد امروز", value: formatToman(summary.revenue.today ?? 0) },
    { label: "درآمد هفته", value: formatToman(summary.revenue.week ?? 0) },
    { label: "درآمد ماه", value: formatToman(summary.revenue.month ?? 0) },
    { label: "سفارش‌های امروز", value: formatNumber(summary.orders.today) },
  ];
  const tabCls = (on: boolean) => `flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-olive text-cream shadow-soft" : "text-espresso/70 hover:bg-beige-soft dark:text-dark-textSecondary dark:hover:bg-dark-surfaceHover"}`;
  return (
    <div>
      <div className="card flex gap-1 overflow-x-auto p-1.5" role="tablist" aria-label="گزارش مالی">
        <button role="tab" aria-selected={tab === "summary"} onClick={() => setTab("summary")} className={tabCls(tab === "summary")}><span aria-hidden="true">💰</span>خلاصه مالی</button>
        <button role="tab" aria-selected={tab === "sales"} onClick={() => setTab("sales")} className={tabCls(tab === "sales")}><span aria-hidden="true">📊</span>فروش و تقاضا</button>
        <button role="tab" aria-selected={tab === "matrix"} onClick={() => setTab("matrix")} className={tabCls(tab === "matrix")}><span aria-hidden="true">🧮</span>دسته‌بندی محصولات</button>
        <button role="tab" aria-selected={tab === "goals"} onClick={() => setTab("goals")} className={tabCls(tab === "goals")}><span aria-hidden="true">🎯</span>تعیین هدف</button>
      </div>
      {tab === "summary" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="card p-4"><div className="text-xs text-muted">{c.label}</div><div className="mt-2 text-lg font-bold">{c.value}</div></div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="card p-4"><h2 className="mb-3 text-sm font-semibold">شاخص‌ها</h2><ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-muted">میانگین ارزش سفارش (ماه)</span><span>{summary.averageOrderValue.month ? formatToman(summary.averageOrderValue.month) : "—"}</span></li>
              <li className="flex justify-between"><span className="text-muted">سفارش‌های فعال</span><span>{formatNumber(ops.activeOrders)}</span></li>
              <li className="flex justify-between"><span className="text-muted">بیرون‌بر (۳۰ روز)</span><span>{formatNumber(summary.ordersByType.takeaway)}</span></li>
              <li className="flex justify-between"><span className="text-muted">میز (۳۰ روز)</span><span>{formatNumber(summary.ordersByType.table)}</span></li>
              <li className="flex justify-between"><span className="text-muted">میانگین آماده‌سازی</span><span>{ops.avgActualPrepMinutes != null ? `${formatNumber(ops.avgActualPrepMinutes)} دقیقه` : "—"}</span></li>
              <li className="flex justify-between"><span className="text-muted">بهای جایگزینی کم‌موجود</span><span>{formatToman(lowStockCost)}</span></li>
              <li className="flex justify-between"><span className="text-muted">تخفیف امروز</span><span className="text-olive-600 dark:text-olive-300">{formatToman(summary.discounts?.today ?? 0)} ({formatNumber(summary.discounts?.ordersWithDiscount.today ?? 0)} سفارش)</span></li>
              <li className="flex justify-between"><span className="text-muted">تخفیف ماه</span><span className="text-olive-600 dark:text-olive-300">{formatToman(summary.discounts?.month ?? 0)} ({formatNumber(summary.discounts?.ordersWithDiscount.month ?? 0)} سفارش)</span></li>
            </ul></div>
            <div className="card p-4"><h2 className="mb-3 text-sm font-semibold">روند فروش ۱۴ روز اخیر</h2>
              <div className="flex h-40 items-end gap-1" dir="ltr">
                {daily.map((d) => (<div key={d.date} className="group relative flex-1"><div className="w-full rounded-t bg-olive/70 group-hover:bg-olive" style={{ height: `${Math.max(4, (d.revenue / maxDaily) * 140)}px` }} title={`${formatJalaliDate(d.date)}: ${formatToman(d.revenue)}`} /></div>))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted" dir="ltr"><span>{daily[0] ? formatJalaliDate(daily[0].date) : ""}</span><span>{daily.length ? formatJalaliDate(daily[daily.length - 1].date) : ""}</span></div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="card p-4"><h2 className="mb-3 text-sm font-semibold">پرفروش‌ترین محصولات</h2><ul className="space-y-2 text-sm">{top.map((p) => (<li key={p.productId} className="flex items-center justify-between"><span>{p.name}</span><span className="text-muted">{formatNumber(p.quantity)} عدد · <Price amount={p.revenue} size="sm" /></span></li>))}{top.length === 0 && <li className="text-muted">داده‌ای نیست</li>}</ul></div>
            <div className="card p-4"><h2 className="mb-3 text-sm font-semibold">درآمد بر اساس دسته</h2><ul className="space-y-2 text-sm">{byCategory.map((c) => (<li key={c.category} className="flex items-center justify-between"><span>{c.category}</span><span className="text-muted"><Price amount={c.revenue} size="sm" /></span></li>))}{byCategory.length === 0 && <li className="text-muted">داده‌ای نیست</li>}</ul></div>
          </div>
          {lowStock.length > 0 && (<div className="card mt-4 p-4"><h2 className="mb-3 text-sm font-semibold text-warning">مواد کم‌موجود</h2><div className="flex flex-wrap gap-2">{lowStock.map((i) => (<span key={i.ingredientId} className="chip border-warning/30 text-warning">{i.name}: {formatNumber(i.stock)} {i.unit}</span>))}</div></div>)}
        </div>
      )}
      {tab === "sales" && (
        <div className="mt-4 space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted">از<JalaliDateInput value={from} onChange={setFrom} ariaLabel="از تاریخ" /></label>
              <label className="flex items-center gap-1.5 text-xs text-muted">تا<JalaliDateInput value={to} onChange={setTo} ariaLabel="تا تاریخ" /></label>
            </div>
            <span className="text-[11px] text-muted">بازهٔ انتخابی روی گزارش فروش و دسته‌بندی محصولات اعمال می‌شود.</span>
          </div>
          <SalesPanel from={from} to={to} show={show} />
        </div>
      )}
      {tab === "matrix" && (
        <div className="mt-4 space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted">از<JalaliDateInput value={from} onChange={setFrom} ariaLabel="از تاریخ" /></label>
              <label className="flex items-center gap-1.5 text-xs text-muted">تا<JalaliDateInput value={to} onChange={setTo} ariaLabel="تا تاریخ" /></label>
            </div>
            <span className="text-[11px] text-muted">بازهٔ انتخابی روی دسته‌بندی محصولات اعمال می‌شود.</span>
          </div>
          <MatrixPanel from={from} to={to} show={show} />
        </div>
      )}
      {tab === "goals" && (
        <div className="mt-4">
          <GoalsPanel products={products} show={show} />
        </div>
      )}
    </div>
  );
}
