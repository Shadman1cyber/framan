import Link from "next/link";
import { prisma } from "@/lib/db";
import { Price } from "@/components/ui/Price";
import { formatNumber, formatToman } from "@/lib/format";
import {
  getDailyRevenue,
  getFinancialSummary,
  getInventoryStatus,
  getOperationalStatus,
  getRevenueByCategory,
  getRevenueByProduct,
  startOfToday,
  daysAgo,
} from "@/lib/analytics";
import { requireAdminPage } from "@/lib/admin-page-access";
import { orderStatusLabel, type OrderStatus, type OrderType } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ---------- small chart helpers (pure SVG, no deps) ---------- */

function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const DONUT_COLORS = ["#556B2F", "#C68A2E", "#6F4E37", "#B5A796", "#8FA268", "#D4A574"];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-warning" aria-label={`امتیاز ${formatNumber(value)} از ۵`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden="true" className={i < Math.round(value) ? "" : "opacity-30"}>
          ★
        </span>
      ))}
    </span>
  );
}

export default async function AdminDashboard() {
  const user = await requireAdminPage("dashboard");
  const owner = user.role === "OWNER";

  const [
    pending,
    confirmed,
    preparing,
    ready,
    ops,
    financial,
    lowStock,
    recentOrders,
    daily,
    topSales,
    byCategory,
    weekOrders,
    occupiedTables,
    todayReservations,
    recentReviews,
  ] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.order.count({ where: { status: "PREPARING" } }),
    prisma.order.count({ where: { status: "READY" } }),
    getOperationalStatus(),
    owner ? getFinancialSummary() : Promise.resolve(null),
    getInventoryStatus(),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true } },
        table: { select: { label: true, number: true } },
        items: { select: { quantity: true } },
      },
    }),
    owner ? getDailyRevenue(14) : Promise.resolve([] as Array<{ date: string; revenue: number; orders: number }>),
    getRevenueByProduct(4),
    getRevenueByCategory(),
    prisma.order.findMany({
      where: { createdAt: { gte: daysAgo(6) } },
      select: { createdAt: true },
    }),
    prisma.cafeTable.count({ where: { isActive: true, isOccupied: true } }).catch(() => 0),
    prisma.tableReservation
      .count({ where: { reservedAt: { gte: startOfToday() } } })
      .catch(() => 0),
    prisma.rating
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          product: { select: { nameFa: true } },
          user: { select: { name: true } },
        },
      })
      .catch(() => [] as Array<{ id: string; rating: number; review: string | null; createdAt: Date; product: { nameFa: string }; user: { name: string | null } }>),
  ]);

  const lowItems = lowStock.filter((i) => i.isLow);

  /* trending products enrichment (image, category, avg rating) */
  const topIds = topSales.map((t) => t.productId);
  const [topProducts, ratingAgg] = await Promise.all([
    topIds.length
      ? prisma.product.findMany({
          where: { id: { in: topIds } },
          select: { id: true, nameFa: true, price: true, image: true, category: { select: { nameFa: true } } },
        })
      : Promise.resolve([] as Array<{ id: string; nameFa: string; price: number; image: string | null; category: { nameFa: string } }>),
    topIds.length
      ? prisma.rating.groupBy({
          by: ["productId"],
          where: { productId: { in: topIds } },
          _avg: { rating: true },
          _count: { rating: true },
        })
      : Promise.resolve([] as Array<{ productId: string; _avg: { rating: number | null }; _count: { rating: number } }>),
  ]);
  const productMap = new Map(topProducts.map((p) => [p.id, p]));
  const ratingMap = new Map(ratingAgg.map((r) => [r.productId, r]));
  const trending = topSales.map((t) => ({
    ...t,
    detail: productMap.get(t.productId),
    avg: ratingMap.get(t.productId)?._avg.rating ?? null,
    votes: ratingMap.get(t.productId)?._count.rating ?? 0,
  }));

  /* weekly order bars — last 7 days, oldest → newest */
  const weekDays: Array<{ key: string; label: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("fa-IR", { weekday: "short", timeZone: "Asia/Tehran" }).format(d);
    weekDays.push({ key, label, count: 0 });
  }
  const weekMap = new Map(weekDays.map((w) => [w.key, w]));
  for (const o of weekOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = weekMap.get(key);
    if (row) row.count += 1;
  }
  const maxWeek = Math.max(1, ...weekDays.map((w) => w.count));

  /* revenue curve points */
  const W = 560;
  const H = 190;
  const PAD = 14;
  const maxDaily = Math.max(1, ...daily.map((d) => d.revenue));
  const pts = daily.map((d, i) => ({
    x: PAD + (i * (W - PAD * 2)) / Math.max(1, daily.length - 1),
    y: 12 + (1 - d.revenue / maxDaily) * (H - 50),
    ...d,
  }));
  const line = smoothPath(pts);
  const area = line ? `${line} L ${pts[pts.length - 1].x},${H - 8} L ${pts[0].x},${H - 8} Z` : "";
  const peak = pts.reduce((a, b) => (b.revenue > (a?.revenue ?? -1) ? b : a), pts[0]);
  const dayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "short", day: "numeric" });

  /* category donut (share of ordered products) */
  const categoriesByQuantity = [...byCategory].sort((a, b) => b.quantity - a.quantity);
  const catTotal = categoriesByQuantity.reduce((s, c) => s + c.quantity, 0);
  const cats = categoriesByQuantity.slice(0, 5).map((c, i) => ({
    ...c,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    pct: catTotal ? Math.round((c.quantity / catTotal) * 100) : 0,
  }));
  const restPct = Math.max(0, 100 - cats.reduce((s, c) => s + c.pct, 0));
  let acc = 0;
  const donutStops = cats
    .map((c) => {
      const from = acc;
      acc += c.pct;
      return `${c.color} ${from}% ${acc}%`;
    })
    .concat(restPct > 0 ? [`#EFE3CB ${acc}% 100%`] : [])
    .join(", ");

  /* order-type cups */
  const takeaway = financial?.ordersByType.takeaway ?? 0;
  const tableCount = financial?.ordersByType.table ?? 0;
  const typeTotal = Math.max(1, takeaway + tableCount);
  const takePct = Math.round((takeaway / typeTotal) * 100);
  const tablePct = 100 - takePct;

  const todayStr = new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(new Date());

  const kpis: Array<{ label: string; value: string; sub: string; href: string; tint: string; glyph: string }> = owner
    ? [
        { label: "سفارش‌های امروز", value: formatNumber(financial?.orders.today ?? 0), sub: `${formatNumber(financial?.orders.week ?? 0)} در ۷ روز اخیر`, href: "/admin/orders", tint: "bg-olive/10 text-olive-600 dark:bg-olive/20 dark:text-olive-300", glyph: "🧾" },
        { label: "درآمد امروز", value: formatToman(financial?.revenue.today ?? 0), sub: `ماه: ${formatToman(financial?.revenue.month ?? 0)}`, href: "/admin/financial", tint: "bg-warning/10 text-warning dark:bg-warning/20", glyph: "🪙" },
        { label: "میانگین سبد (ماه)", value: financial?.averageOrderValue.month ? formatToman(financial.averageOrderValue.month) : "—", sub: "ارزش هر سفارش", href: "/admin/financial", tint: "bg-coffee/10 text-coffee dark:bg-coffee/20 dark:text-beige", glyph: "🧺" },
        { label: "سفارش فعال", value: formatNumber(ops.activeOrders), sub: `${formatNumber(pending)} در انتظار تایید`, href: "/admin/orders", tint: "bg-danger/10 text-danger dark:bg-danger/20", glyph: "🔥" },
      ]
    : [
        { label: "در انتظار تایید", value: formatNumber(pending), sub: "نیازمند اقدام شما", href: "/admin/orders?status=PENDING", tint: "bg-warning/10 text-warning dark:bg-warning/20", glyph: "🧾" },
        { label: "تاییدشده", value: formatNumber(confirmed), sub: "آماده شروع پخت", href: "/admin/orders?status=CONFIRMED", tint: "bg-olive/10 text-olive-600 dark:bg-olive/20 dark:text-olive-300", glyph: "✅" },
        { label: "در حال آماده‌سازی", value: formatNumber(ops.preparingCount), sub: "روی میز کار آشپزخانه", href: "/admin/orders?status=PREPARING", tint: "bg-coffee/10 text-coffee dark:bg-coffee/20 dark:text-beige", glyph: "🔥" },
        { label: "آماده تحویل", value: formatNumber(ready), sub: "تحویل به مشتری", href: "/admin/orders?status=READY", tint: "bg-olive/10 text-olive-600 dark:bg-olive/20 dark:text-olive-300", glyph: "🔔" },
      ];

  return (
    <div className="space-y-4 motion-safe:animate-fade-in">
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted">کافه ۱۳ · {todayStr}</p>
          <h1 className="heading-section mt-1">داشبورد</h1>
          <p className="mt-1 text-sm text-muted">
            {owner ? "نبض سرویس، فروش و موادی که زود تمام می‌شود — یک نگاه." : "سرویس امروز روی این صفحه می‌چرخد: تایید، پخت، تحویل."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/orders" className="btn-primary whitespace-nowrap !px-4 !py-2.5 text-sm">
            ＋ سفارش دستی
          </Link>
          {owner && (
            <Link href="/admin/financial" className="btn-secondary whitespace-nowrap !px-4 !py-2.5 text-sm">
              گزارش مالی
            </Link>
          )}
        </div>
      </div>

      {/* ---------- signature: kitchen ticket rail ---------- */}
      <section aria-label="ریل سفارش‌های جاری" className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-dashed border-coffee/20 px-4 py-2.5 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-8 rounded-full bg-gradient-to-l from-olive via-olive-300 to-warning" />
            <h2 className="text-xs font-semibold text-espresso/70 dark:text-dark-textSecondary">ریل آشپزخانه — همین حالا</h2>
          </div>
          <Link href="/admin/orders" className="text-xs font-medium text-olive-600 hover:underline dark:text-olive-300">
            همه سفارش‌ها ←
          </Link>
        </div>
        <div className="grid grid-cols-2 divide-coffee/10 max-sm:divide-y max-sm:[&>*]:border-coffee/10 sm:grid-cols-4 sm:divide-x sm:divide-x-reverse dark:divide-dark-border">
          {[
            { label: "در انتظار تایید", value: pending, href: "/admin/orders?status=PENDING", hot: pending > 0 },
            { label: "تاییدشده", value: confirmed, href: "/admin/orders?status=CONFIRMED", hot: false },
            { label: "در حال آماده‌سازی", value: preparing, href: "/admin/orders?status=PREPARING", hot: preparing > 0 },
            { label: "آماده تحویل", value: ready, href: "/admin/orders?status=READY", hot: ready > 0 },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="group relative px-4 py-3 transition-colors hover:bg-beige-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-olive/40 dark:hover:bg-dark-surfaceHover"
            >
              <span aria-hidden="true" className="absolute right-1/2 top-1.5 h-1.5 w-1.5 translate-x-1/2 rounded-full bg-coffee/30 dark:bg-dark-border" />
              <span className="mt-1 block text-[11px] text-muted">{t.label}</span>
              <span className="mt-0.5 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-espresso dark:text-dark-text">{formatNumber(t.value)}</span>
                {t.hot && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">نیازمند اقدام</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- KPI cards ---------- */}
      <section aria-label="شاخص‌های کلیدی" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="card group p-4 transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg ${k.tint}`} aria-hidden="true">
                {k.glyph}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-muted">{k.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-espresso group-hover:underline dark:text-dark-text">{k.value}</div>
            <div className="mt-0.5 text-[11px] text-muted">{k.sub}</div>
          </Link>
        ))}
      </section>

      {/* ---------- main grid: Reztro structure, Farman palette ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* main column */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {owner && (
            <section aria-label="روند فروش" className="card p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="heading-card">روند فروش</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    <Price amount={financial?.revenue.month ?? 0} size="sm" /> در ۳۰ روز اخیر
                  </p>
                </div>
                <Link href="/admin/financial" className="chip hover:border-olive/50">
                  ۱۴ روز اخیر · جزئیات مالی ←
                </Link>
              </div>
              {daily.length === 0 || maxDaily <= 0 ? (
                <p className="py-10 text-center text-sm text-muted">هنوز فروش ثبت‌شده‌ای برای نمودار نیست.</p>
              ) : (
                <div dir="ltr">
                  <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full text-olive dark:text-olive-300" role="img" aria-label={`نمودار فروش ۱۴ روز اخیر، اوج ${formatToman(peak?.revenue ?? 0)}`}>
                    {[0.25, 0.5, 0.75].map((f) => (
                      <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 5" />
                    ))}
                    {area && <path d={area} fill="currentColor" opacity="0.1" />}
                    {line && <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
                    {peak && (
                      <g>
                        <circle cx={peak.x} cy={peak.y} r="9" fill="#C68A2E" opacity="0.2" />
                        <circle cx={peak.x} cy={peak.y} r="4" fill="#C68A2E" stroke="#FDFAF3" strokeWidth="2">
                          <title>{`${peak.date}: ${formatToman(peak.revenue)}`}</title>
                        </circle>
                      </g>
                    )}
                  </svg>
                  <div className="mt-1 flex justify-between text-[10px] text-muted">
                    <span>{daily[0] ? dayFmt.format(new Date(daily[0].date + "T00:00:00")) : ""}</span>
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-warning" /> اوج: {peak ? formatToman(peak.revenue) : "—"}
                    </span>
                    <span>{daily[daily.length - 1] ? dayFmt.format(new Date(daily[daily.length - 1].date + "T00:00:00")) : ""}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-5">
            {/* weekly order bars */}
            <section aria-label="سفارش‌های هفته" className="card p-4 md:col-span-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="heading-card !text-base">سفارش‌های هفته</h2>
                <Link href="/admin/orders" className="text-xs font-medium text-olive-600 hover:underline dark:text-olive-300">
                  سفارش‌ها ←
                </Link>
              </div>
              <div className="flex h-36 items-end gap-1.5" dir="ltr" role="img" aria-label="نمودار ستونی سفارش‌های هفت روز اخیر">
                {weekDays.map((w) => {
                  const isMax = w.count === maxWeek && w.count > 0;
                  return (
                    <div key={w.key} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="pointer-events-none absolute -top-1 rounded-lg bg-espresso px-2 py-1 text-[10px] tabular-nums text-cream opacity-0 transition-opacity group-hover:opacity-100 dark:bg-dark-text dark:text-dark-bg">
                        {formatNumber(w.count)}
                      </span>
                      <div
                        className={`w-full rounded-t-lg transition-colors ${isMax ? "bg-olive" : "bg-olive/15 group-hover:bg-olive/30 dark:bg-olive/25"}`}
                        style={{ height: `${Math.max(6, (w.count / maxWeek) * 110)}px` }}
                        title={`${w.label}: ${formatNumber(w.count)} سفارش`}
                      />
                      <span className={`text-[10px] ${isMax ? "font-bold text-olive-600 dark:text-olive-300" : "text-muted"}`}>{w.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* order types — cup fills */}
            <section aria-label="نوع سفارش" className="card p-4 md:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="heading-card !text-base">نوع سفارش</h2>
                <span className="text-[10px] text-muted">۳۰ روز اخیر</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: "بیرون‌بر", pct: owner ? takePct : undefined, count: null as number | null, icon: "🥡", bar: "bg-olive", href: "/admin/orders" },
                  { label: "سفارش میز", pct: owner ? tablePct : undefined, count: null as number | null, icon: "🪑", bar: "bg-coffee", href: "/admin/tables" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <Link href={r.href} className="flex items-center gap-2 font-medium hover:underline">
                        <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-beige-soft text-sm dark:bg-dark-surfaceHover">{r.icon}</span>
                        {r.label}
                      </Link>
                      <span className="text-xs tabular-nums text-muted">{r.pct != null ? `${formatNumber(r.pct)}٪` : "—"}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-beige dark:bg-dark-surfaceHover" role={r.pct != null ? "img" : undefined} aria-label={r.pct != null ? `${r.label} ${formatNumber(r.pct)} درصد` : undefined}>
                      <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${r.pct ?? 0}%` }} />
                    </div>
                    {r.pct != null && (
                      <div className="mt-1 text-[11px] tabular-nums text-muted">{formatNumber(r.label === "بیرون‌بر" ? takeaway : tableCount)} سفارش</div>
                    )}
                  </div>
                ))}
                {!owner && <p className="text-[11px] leading-relaxed text-muted">درصدها فقط برای صاحب کافه نمایش داده می‌شود.</p>}
              </div>
            </section>
          </div>

          {/* recent orders */}
          <section aria-label="سفارش‌های اخیر" className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="heading-card !text-base">سفارش‌های اخیر</h2>
              <div className="flex gap-2">
                <Link href="/admin/orders?status=PENDING" className="chip hover:border-olive/50">
                  در انتظار ({formatNumber(pending)})
                </Link>
                <Link href="/admin/orders" className="chip chip-active">
                  دیدن همه ←
                </Link>
              </div>
            </div>
            {recentOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">سفارشی ثبت نشده است.</p>
            ) : (
              <ul className="divide-y divide-coffee/10 dark:divide-dark-border">
                {recentOrders.map((o) => {
                  const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <Link href={`/order/${o.id}`} className="shrink-0 font-bold tabular-nums tracking-tight hover:underline" title="جزئیات سفارش">
                          #{o.id.slice(-6).toUpperCase()}
                        </Link>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{o.user?.name ?? o.customerName ?? "مهمان"}</div>
                          <div className="text-[11px] text-muted">
                            {formatNumber(itemCount)} آیتم
                            {o.table ? ` · ${o.table.label ?? `میز ${o.table.number}`}` : ""}
                            {" · "}
                            {new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(o.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Price amount={o.total} size="sm" className="tabular-nums" />
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            o.status === "CANCELLED"
                              ? "bg-danger/10 text-danger"
                              : o.status === "COMPLETED"
                                ? "bg-beige text-espresso/70 dark:bg-dark-surfaceHover dark:text-dark-textSecondary"
                                : o.status === "PENDING"
                                  ? "bg-warning/15 text-warning"
                                  : "bg-olive/10 text-olive-600 dark:bg-olive/20 dark:text-olive-300"
                          }`}
                        >
                          {orderStatusLabel(o.status as OrderStatus, (o.orderType as OrderType) ?? "TAKEAWAY")}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* customer reviews */}
          <section aria-label="نظرهای مشتریان" className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="heading-card !text-base">نظرهای مشتریان</h2>
              <Link href="/admin/ratings" className="text-xs font-medium text-olive-600 hover:underline dark:text-olive-300">
                همه امتیازها ←
              </Link>
            </div>
            {recentReviews.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                هنوز نظری ثبت نشده است. <Link href="/admin/ratings" className="text-olive-600 hover:underline dark:text-olive-300">مدیریت امتیازها</Link>
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {recentReviews.map((r) => (
                  <figure key={r.id} className="rounded-2xl border border-coffee/10 bg-cream p-3 dark:border-dark-border dark:bg-dark-bg">
                    <Stars value={r.rating} />
                    <blockquote className="mt-1.5 line-clamp-3 min-h-12 text-xs leading-relaxed text-espresso/80 dark:text-dark-textSecondary">
                      {r.review || "بدون متن — فقط امتیاز."}
                    </blockquote>
                    <figcaption className="mt-2 border-t border-dashed border-coffee/15 pt-2 text-[11px] text-muted dark:border-dark-border">
                      <span className="font-semibold text-espresso dark:text-dark-text">{r.product.nameFa}</span>
                      {" · "}
                      {r.user.name ?? "مشتری"}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* side column */}
        <div className="min-w-0 space-y-4">
          {/* top categories donut */}
          <section aria-label="دسته‌های پرفروش" className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="heading-card !text-base">دسته‌های پرفروش</h2>
              {owner && (
                <Link href="/admin/categories" className="text-xs font-medium text-olive-600 hover:underline dark:text-olive-300">
                  دسته‌ها ←
                </Link>
              )}
            </div>
            {cats.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">داده‌ای برای نمایش نیست.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`پرفروش‌ترین دسته: ${cats[0].category} با ${formatNumber(cats[0].pct)} درصد`}>
                  <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${donutStops})` }} />
                  <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-cream-50 dark:bg-dark-surface">
                    <span className="text-lg font-bold tabular-nums text-espresso dark:text-dark-text">
                      {formatNumber(cats[0].pct)}٪
                    </span>
                    <span className="max-w-20 truncate text-[10px] text-muted">{cats[0].category}</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2 text-xs">
                  {cats.slice(0, 4).map((c) => (
                    <li key={c.category} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="truncate">{c.category}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatNumber(c.quantity)} عدد
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* trending products */}
          <section aria-label="محصولات پرطرفدار" className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="heading-card !text-base">پرطرفدارها</h2>
              {owner && (
                <Link href="/admin/products" className="text-xs font-medium text-olive-600 hover:underline dark:text-olive-300">
                  محصولات ←
                </Link>
              )}
            </div>
            {trending.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">هنوز فروشی ثبت نشده است.</p>
            ) : (
              <ul className="space-y-3">
                {trending.map((t) => (
                  <li key={t.productId}>
                    <Link href="/admin/products" className="group flex items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-beige-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive/40 dark:hover:bg-dark-surfaceHover">
                      {t.detail?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.detail.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-beige text-xl dark:bg-dark-surfaceHover">
                          ☕
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold group-hover:underline">{t.detail?.nameFa ?? t.name}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                          <span>{t.detail?.category.nameFa ?? ""}</span>
                          {t.avg != null && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <span aria-hidden="true" className="text-warning">★</span>
                              {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(t.avg)}
                              <span>({formatNumber(t.votes)})</span>
                            </span>
                          )}
                          <span className="tabular-nums">{formatNumber(t.quantity)} فروش</span>
                        </span>
                      </span>
                      <Price amount={t.detail?.price ?? 0} size="sm" className="!text-xs tabular-nums !text-olive-600 dark:!text-olive-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* attention / activity */}
          <section aria-label="نیازمند توجه" className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="heading-card !text-base">نبض امروز</h2>
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute h-full w-full animate-ping rounded-full bg-olive opacity-60 motion-reduce:animate-none" />
                <span className="h-2 w-2 rounded-full bg-olive" />
              </span>
            </div>
            <ul className="space-y-2.5 text-sm">
              {owner && (
              <li>
                <Link href="/admin/inventory" className="flex items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2.5 transition-colors hover:bg-beige-soft dark:border-dark-border dark:hover:bg-dark-surfaceHover">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${lowItems.length ? "bg-warning/15 text-warning" : "bg-olive/10 text-olive-600 dark:text-olive/30"}`}>🌿</span>
                    <span>
                      <span className="block text-xs font-semibold">انبار مواد</span>
                      <span className="block text-[11px] text-muted">
                        {lowItems.length ? `${formatNumber(lowItems.length)} قلم کم‌موجود: ${lowItems.slice(0, 2).map((i) => i.name).join("، ")}${lowItems.length > 2 ? "…" : ""}` : "موجودی همه اقلام کافی است"}
                      </span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">‹</span>
                </Link>
              </li>
              )}
              <li>
                <Link href="/admin/tables" className="flex items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2.5 transition-colors hover:bg-beige-soft dark:border-dark-border dark:hover:bg-dark-surfaceHover">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coffee/10 text-coffee dark:text-beige">🪑</span>
                    <span>
                      <span className="block text-xs font-semibold">میزهای اشغال</span>
                      <span className="block text-[11px] tabular-nums text-muted">{formatNumber(occupiedTables)} میز · رزرو امروز: {formatNumber(todayReservations)}</span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">‹</span>
                </Link>
              </li>
              {owner && (
              <li>
                <Link href="/admin/staff" className="flex items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2.5 transition-colors hover:bg-beige-soft dark:border-dark-border dark:hover:bg-dark-surfaceHover">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-olive/10 text-olive-600 dark:text-olive-300">👨‍🍳</span>
                    <span>
                      <span className="block text-xs font-semibold">تیم امروز</span>
                      <span className="block text-[11px] tabular-nums text-muted">{formatNumber(ops.chefs)} شف · {formatNumber(ops.otherStaff)} سایر · میانگین پخت {ops.avgActualPrepMinutes != null ? `${formatNumber(ops.avgActualPrepMinutes)} دقیقه` : "—"}</span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">‹</span>
                </Link>
              </li>
              )}
              <li>
                <Link href="/admin/customers" className="flex items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2.5 transition-colors hover:bg-beige-soft dark:border-dark-border dark:hover:bg-dark-surfaceHover">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">🎁</span>
                    <span>
                      <span className="block text-xs font-semibold">باشگاه مشتریان</span>
                      <span className="block text-[11px] text-muted">امتیازها، اعتبار و بازگشت مشتری</span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">‹</span>
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
