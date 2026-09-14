import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getFinancialSummary,
  getRevenueByProduct,
  getRevenueByCategory,
  getDailyRevenue,
  getInventoryStatus,
  getOperationalStatus,
} from "@/lib/analytics";
import { Price } from "@/components/ui/Price";
import { formatNumber, formatToman } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const [summary, top, byCategory, daily, inventory, ops] = await Promise.all([
    getFinancialSummary(),
    getRevenueByProduct(8),
    getRevenueByCategory(),
    getDailyRevenue(14),
    getInventoryStatus(),
    getOperationalStatus(),
  ]);
  const lowStock = inventory.filter((i) => i.isLow);
  const maxDaily = Math.max(...daily.map((d) => d.revenue), 1);

  const cards = [
    { label: "درآمد امروز", value: formatToman(summary.revenue.today ?? 0) },
    { label: "درآمد هفته", value: formatToman(summary.revenue.week ?? 0) },
    { label: "درآمد ماه", value: formatToman(summary.revenue.month ?? 0) },
    { label: "سفارش‌های امروز", value: formatNumber(summary.orders.today) },
  ];

  return (
    <div>
      <h1 className="heading-section mb-6">گزارش مالی</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-xs text-muted">{c.label}</div>
            <div className="mt-2 text-lg font-bold text-espresso">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">شاخص‌ها</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-muted">میانگین ارزش سفارش (ماه)</span>
              <span>{summary.averageOrderValue.month ? formatToman(summary.averageOrderValue.month) : "—"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">سفارش‌های فعال</span>
              <span>{formatNumber(ops.activeOrders)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">سفارش بیرون‌بر (۳۰ روز)</span>
              <span>{formatNumber(summary.ordersByType.takeaway)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">سفارش میز (۳۰ روز)</span>
              <span>{formatNumber(summary.ordersByType.table)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">میانگین زمان واقعی آماده‌سازی</span>
              <span>{ops.avgActualPrepMinutes != null ? `${formatNumber(ops.avgActualPrepMinutes)} دقیقه` : "—"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">بهای جایگزینی مواد کم‌موجود (برآورد)</span>
              <span>{formatToman(inventory.reduce((s, i) => s + (i.lowStockCost ?? 0), 0))}</span>
            </li>
          </ul>
          <p className="mt-3 rounded-xl bg-beige-soft p-2 text-[11px] leading-relaxed text-muted">
            درآمد از سفارش‌های ثبت‌شده محاسبه می‌شود. هزینه‌ها و سود واقعی پس از ثبت خریدها و
            ثبت داده‌های هزینه (بخش درون‌ریزی) در دسترس قرار می‌گیرد و در این نسخه برآورد نمی‌شود.
          </p>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">روند فروش ۱۴ روز اخیر</h2>
          <div className="flex h-40 items-end gap-1" dir="ltr">
            {daily.map((d) => (
              <div key={d.date} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-olive/70 transition-colors group-hover:bg-olive"
                  style={{ height: `${Math.max(4, (d.revenue / maxDaily) * 140)}px` }}
                  title={`${d.date}: ${formatToman(d.revenue)}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted" dir="ltr">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">پرفروش‌ترین محصولات</h2>
          <ul className="space-y-2 text-sm">
            {top.map((p) => (
              <li key={p.productId} className="flex items-center justify-between">
                <span>{p.name}</span>
                <span className="text-muted">
                  {formatNumber(p.quantity)} عدد · <Price amount={p.revenue} size="sm" />
                </span>
              </li>
            ))}
            {top.length === 0 && <li className="text-muted">داده‌ای موجود نیست</li>}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">درآمد بر اساس دسته</h2>
          <ul className="space-y-2 text-sm">
            {byCategory.map((c) => (
              <li key={c.category} className="flex items-center justify-between">
                <span>{c.category}</span>
                <span className="text-muted"><Price amount={c.revenue} size="sm" /></span>
              </li>
            ))}
            {byCategory.length === 0 && <li className="text-muted">داده‌ای موجود نیست</li>}
          </ul>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="card mt-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-warning">مواد کم‌موجود</h2>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((i) => (
              <span key={i.ingredientId} className="chip border-warning/30 text-warning">
                {i.name}: {formatNumber(i.stock)} {i.unit}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
