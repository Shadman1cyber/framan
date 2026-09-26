"use client";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { GoalsPanel, MatrixPanel, SalesPanel, type ProductOpt } from "@/components/admin/OperationsDashboard";
import { Price } from "@/components/ui/Price";
import { formatNumber, formatToman } from "@/lib/format";
import { formatJalaliDate } from "@/lib/jalali";
import { ChartCard } from "@/components/admin/dashboard/charts/ChartCard";
import { BarsCard } from "@/components/admin/dashboard/charts/BarsCard";
import { StatCard } from "@/components/admin/dashboard/charts/StatCard";
type S = { revenue: { today: number | null; week: number | null; month: number | null }; orders: { today: number }; averageOrderValue: { month: number | null }; ordersByType: { takeaway: number; table: number } };
type P = { summary: S; top: { productId: string; name: string; quantity: number; revenue: number }[]; byCategory: { category: string; revenue: number }[]; daily: { date: string; revenue: number }[]; lowStock: { ingredientId: string; name: string; stock: number; unit: string }[]; lowStockCost: number; ops: { activeOrders: number; avgActualPrepMinutes: number | null }; products: ProductOpt[]; defaultFrom: string; defaultTo: string };

const TABS = [
  { key: "summary", label: "خلاصه مالی", icon: <WalletIcon /> },
  { key: "sales", label: "فروش و تقاضا", icon: <ChartIcon /> },
  { key: "matrix", label: "دسته‌بندی محصولات", icon: <GridIcon /> },
  { key: "goals", label: "تعیین هدف", icon: <TargetIcon /> },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS: TabKey[] = TABS.map((tab) => tab.key);

function WalletIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M21 10h-4a2 2 0 0 0 0 4h4" /></svg>;
}
function ChartIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20v-6M10 20V6M16 20v-9M22 20H2" /></svg>;
}
function GridIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
}
function TargetIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>;
}
function ListIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
}
function TagIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 13.5 13 21 3 11V3h8l9.5 9.5Z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>;
}
function AlertIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4.5a6.5 6.5 0 0 0-6.5 6.5c0 5-2 5-2 6.5h17c0-1.5-2-1.5-2-6.5A6.5 6.5 0 0 0 12 4.5Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
}

function KeyValueList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex justify-between gap-3">
          <span className="text-dashboard-muted">{item.label}</span>
          <span className="font-mono text-dashboard-foreground">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function FinancialTabs(a: P) {
  const { summary, top, byCategory, daily, lowStock, lowStockCost, ops, products, defaultFrom, defaultTo } = a;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The active tab lives in ?tab= so it can be deep-linked; unknown or missing
  // values keep the old default.
  const requested = searchParams.get("tab");
  const tab: TabKey = TAB_KEYS.includes(requested as TabKey) ? (requested as TabKey) : "sales";
  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [from] = useState(defaultFrom);
  const [to] = useState(defaultTo);
  const { show } = useToast();

  const cards: { label: string; value: string; icon: ReactNode }[] = [
    { label: "درآمد امروز", value: formatToman(summary.revenue.today ?? 0), icon: <WalletIcon /> },
    { label: "درآمد هفته", value: formatToman(summary.revenue.week ?? 0), icon: <ChartIcon /> },
    { label: "درآمد ماه", value: formatToman(summary.revenue.month ?? 0), icon: <TargetIcon /> },
    { label: "سفارش‌های امروز", value: formatNumber(summary.orders.today), icon: <GridIcon /> },
  ];

  return (
    <div>
      <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-[14px] border border-dashboard-line bg-dashboard-surface/60 p-1.5" role="tablist" aria-label="گزارش مالی">
        {TABS.map((item) => {
          const on = tab === item.key;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setTab(item.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${
                on
                  ? "module-tint-bg module-accent-text border border-[rgb(var(--module-primary-rgb)/0.45)]"
                  : "border border-transparent text-dashboard-muted hover:bg-dashboard-surface hover:text-dashboard-foreground"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "summary" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.34fr_1fr]">
            <BarsCard
              title="روند فروش ۱۴ روز اخیر"
              data={daily.map((day) => ({
                label: formatJalaliDate(day.date),
                value: day.revenue,
                display: formatNumber(day.revenue),
              }))}
            />
            <ChartCard title="شاخص‌ها" icon={<ListIcon />}>
              <KeyValueList
                items={[
                  { label: "میانگین ارزش سفارش (ماه)", value: summary.averageOrderValue.month ? formatToman(summary.averageOrderValue.month) : "—" },
                  { label: "سفارش‌های فعال", value: formatNumber(ops.activeOrders) },
                  { label: "بیرون‌بر (۳۰ روز)", value: formatNumber(summary.ordersByType.takeaway) },
                  { label: "میز (۳۰ روز)", value: formatNumber(summary.ordersByType.table) },
                  { label: "میانگین آماده‌سازی", value: ops.avgActualPrepMinutes != null ? `${formatNumber(ops.avgActualPrepMinutes)} دقیقه` : "—" },
                  { label: "بهای جایگزینی کم‌موجود", value: formatToman(lowStockCost) },
                ]}
              />
            </ChartCard>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <ChartCard title="پرفروش‌ترین محصولات" icon={<TagIcon />}>
              {top.length === 0 ? (
                <p className="text-sm text-dashboard-muted">داده‌ای نیست</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {top.map((product) => (
                    <li key={product.productId} className="flex items-center justify-between gap-3">
                      <span className="truncate text-dashboard-foreground">{product.name}</span>
                      <span className="shrink-0 text-dashboard-muted">
                        {formatNumber(product.quantity)} عدد · <Price amount={product.revenue} size="sm" className="text-dashboard-foreground" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
            <ChartCard title="درآمد بر اساس دسته" icon={<GridIcon />}>
              {byCategory.length === 0 ? (
                <p className="text-sm text-dashboard-muted">داده‌ای نیست</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {byCategory.map((row) => (
                    <li key={row.category} className="flex items-center justify-between gap-3">
                      <span className="truncate text-dashboard-foreground">{row.category}</span>
                      <Price amount={row.revenue} size="sm" className="shrink-0 text-dashboard-foreground" />
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
            <ChartCard title="مواد کم‌موجود" icon={<AlertIcon />}>
              {lowStock.length === 0 ? (
                <p className="text-sm text-dashboard-muted">موردی نیست</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {lowStock.map((item) => (
                    <li key={item.ingredientId} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-yellow" aria-hidden="true" />
                        <span className="truncate text-dashboard-foreground">{item.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-dashboard-muted">
                        {formatNumber(item.stock)} {item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>
        </div>
      )}

      {/* Sales, product matrix and goals reuse the shared admin panels, which
          stay on the legacy look everywhere else; this scope remaps their
          surfaces to the dashboard tokens. */}
      {tab !== "summary" && (
        <div data-legacy-surface="dashboard" className="space-y-4">
          {tab === "sales" && <SalesPanel from={from} to={to} show={show} />}
          {tab === "matrix" && <MatrixPanel from={from} to={to} show={show} />}
          {tab === "goals" && <GoalsPanel products={products} show={show} />}
        </div>
      )}
    </div>
  );
}
