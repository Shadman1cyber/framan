import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Any Prisma client: the singleton (pages) or the caller's transaction (agent). */
type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Deterministic café reporting shared by the workspace chat, generated
 * artifacts and the admin dashboard (R07).
 * - Currency is always explicit integer tomans.
 * - Business dates are interpreted in Asia/Tehran and converted to explicit
 *   half-open UTC intervals [from, to).
 * - "Completed order value" is labelled as such: it is NOT collected
 *   payments, NOT expenses and NOT profit. Missing data is reported as
 *   absent, never invented.
 */

export const REPORT_TIMEZONE = "Asia/Tehran";
export const COMPLETED_BASIS =
  "مبنای گزارش: جمع سفارش‌های تکمیل‌شده (COMPLETED) در بازه مشخص؛ این عدد وصولی نقدی، هزینه یا سود نیست.";

/** Tehran-midnight to UTC. Iran has fixed +03:30 since 2022; Intl resolves
 *  the correct offset per date (historic +04:30 DST included). */
export function tehranDayToUtcRange(day: string): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("INVALID_DAY");
  const tehranInstant = (hourOfDay: number) => {
    // Local wall-clock time in Tehran -> UTC instant.
    const naive = new Date(`${day}T00:00:00Z`);
    naive.setUTCHours(hourOfDay);
    const name = new Intl.DateTimeFormat("en-US", { timeZone: REPORT_TIMEZONE, timeZoneName: "longOffset" })
      .formatToParts(naive)
      .find(p => p.type === "timeZoneName")?.value ?? "GMT+03:30";
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    const sign = match?.[1] === "-" ? -1 : 1;
    const offsetMs = sign * ((Number(match?.[2] ?? 3) * 60 + Number(match?.[3] ?? 0)) * 60000);
    // naive currently represents Tehran wall-clock read as UTC; subtract offset.
    return new Date(naive.getTime() - offsetMs);
  };
  return { from: tehranInstant(0), to: tehranInstant(24) };
}

export type SalesSummary = {
  from: string; to: string; timezone: string; currency: "TOMAN";
  total: number; count: number;
  /** Elapsed whole days of the [from,to) interval (bounded by the 31-day cap). */
  days: number;
  /** Deterministic averages so "میانگین" questions are answered from the receipt. */
  avgPerDay: number; avgPerOrder: number;
  byDay: { date: string; total: number; count: number }[];
  byCategory: { category: string; total: number; quantity: number }[];
  byProduct: { productId: string; product: string; quantity: number; total: number }[];
  basis: string;
  sources: string[];
};

/** Completed-order sales summary over an explicit UTC interval. Deterministic. */
export async function completedSalesSummary(from: Date, to: Date, take = 10, client: DbClient = prisma): Promise<SalesSummary> {
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  const where = { status: "COMPLETED", createdAt: { gte: from, lt: to } };
  const [agg, orders, items] = await Promise.all([
    client.order.aggregate({ where, _sum: { total: true }, _count: true }),
    client.order.findMany({ where, select: { total: true, createdAt: true } }),
    client.orderItem.findMany({
      where: { order: where },
      select: {
        quantity: true, price: true, productId: true, optionPrice: true,
        product: { select: { nameFa: true, category: { select: { nameFa: true } } } },
      },
    }),
  ]);
  const total = agg._sum.total ?? 0;
  if (!Number.isSafeInteger(total)) throw new Error("UNSAFE_MONEY_VALUE");
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const avgPerDay = Math.round(total / days);
  const avgPerOrder = agg._count > 0 ? Math.round(total / agg._count) : 0;
  const dayMap = new Map<string, { total: number; count: number }>();
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = dayMap.get(key) ?? { total: 0, count: 0 };
    row.total += o.total; row.count += 1;
    dayMap.set(key, row);
  }
  const catMap = new Map<string, { total: number; quantity: number }>();
  const prodMap = new Map<string, { productId: string; product: string; total: number; quantity: number }>();
  for (const it of items) {
    const lineTotal = (it.price + it.optionPrice) * it.quantity;
    const cat = catMap.get(it.product.category.nameFa) ?? { total: 0, quantity: 0 };
    cat.total += lineTotal; cat.quantity += it.quantity;
    catMap.set(it.product.category.nameFa, cat);
    const p = prodMap.get(it.productId) ?? { productId: it.productId, product: it.product.nameFa, total: 0, quantity: 0 };
    p.total += lineTotal; p.quantity += it.quantity;
    prodMap.set(it.productId, p);
  }
  return {
    from: from.toISOString(), to: to.toISOString(), timezone: "UTC", currency: "TOMAN",
    total, count: agg._count, days, avgPerDay, avgPerOrder,
    byDay: [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    byCategory: [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total),
    byProduct: [...prodMap.values()].sort((a, b) => b.total - a.total).slice(0, take),
    basis: COMPLETED_BASIS,
    sources: ["Order(status=COMPLETED, createdAt)", "OrderItem(price, optionPrice, quantity)", "Product.nameFa", "Category.nameFa"],
  };
}

/** Honest text rendering used identically in chat answers and file exports. */
export function summaryToFaText(s: SalesSummary): string {
  const lines = [
    `گزارش فروش سفارش‌های تکمیل‌شده`,
    `بازه (UTC): ${s.from} تا ${s.to} (انتهای بازه مستثنا)`,
    `جمع: ${s.total} تومان — تعداد: ${s.count}`,
    `میانگین روزانه: ${s.avgPerDay} تومان در روز (بازهٔ ${s.days} روز) — میانگین هر سفارش: ${s.avgPerOrder} تومان`,
    `مبنا: ${s.basis}`,
    s.byCategory.length ? `\nبر اساس دسته‌بندی:` : "داده‌ای برای دسته‌بندی موجود نیست.",
    ...s.byCategory.map(c => `• ${c.category}: ${c.total} تومان (${c.quantity} قلم)`),
    s.byProduct.length ? `\nپرفروش‌ترین‌ها:` : "",
    ...s.byProduct.slice(0, 5).map(p => `• ${p.product}: ${p.total} تومان (${p.quantity} عدد)`),
  ];
  return lines.filter(Boolean).join("\n");
}

/* ── Cost/profit (material cost only, ONLY with sufficient real data) ──── */

export const PROFIT_BASIS =
  "مبنای سود: درآمد سفارش‌های تکمیل‌شده منهای هزینهٔ مواد اولیهٔ رسپی‌ها با هزینهٔ ثبت‌شدهٔ فعلی مواد؛ هزینه‌های دیگر (دستمزد، اجاره و…) شامل نمی‌شود و سود حسابداری رسمی نیست.";

export type ProfitSummary = {
  from: string; to: string; currency: "TOMAN";
  available: true; revenue: number; cost: number; profit: number;
  byProduct: { product: string; quantity: number; revenue: number; cost: number; profit: number }[];
  basis: string; sources: string[];
} | {
  from: string; to: string; currency: "TOMAN";
  available: false; revenue: number; reason: string;
  missing: { product: string; issue: string }[];
  basis: string; sources: string[];
};

/**
 * Material-cost profit over completed orders. A number is returned ONLY when
 * every sold product has a complete recipe (ProductIngredient rows with a
 * matching unit and a recorded costPerUnit on every ingredient). Missing data
 * is reported as insufficient — never replaced by an estimate. Cost uses the
 * CURRENT recorded ingredient costs; historical purchase costs are not
 * recorded in this database and the basis says so.
 */
export async function completedProfitSummary(from: Date, to: Date, client: DbClient = prisma): Promise<ProfitSummary> {
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  const where = { status: "COMPLETED", createdAt: { gte: from, lt: to } };
  const items = await client.orderItem.findMany({
    where: { order: where },
    select: {
      quantity: true, price: true, optionPrice: true, productId: true,
      product: { select: { nameFa: true, ingredients: { select: { quantity: true, unit: true, ingredient: { select: { nameFa: true, unit: true, costPerUnit: true } } } } } },
    },
  });
  const revenue = items.reduce((sum, it) => sum + (it.price + it.optionPrice) * it.quantity, 0);
  if (!Number.isSafeInteger(revenue)) throw new Error("UNSAFE_MONEY_VALUE");
  const sources = ["OrderItem(price, optionPrice, quantity)", "ProductIngredient(quantity, unit)", "Ingredient.costPerUnit"];
  const perProduct = new Map<string, { product: string; quantity: number; revenue: number; cost: number; issue?: { product: string; issue: string } }>();
  for (const it of items) {
    const row = perProduct.get(it.productId) ?? { product: it.product.nameFa, quantity: 0, revenue: 0, cost: 0 };
    row.quantity += it.quantity;
    row.revenue += (it.price + it.optionPrice) * it.quantity;
    const recipe = it.product.ingredients;
    if (!recipe.length) {
      row.issue = { product: it.product.nameFa, issue: "رسپی (مواد اولیه) ثبت نشده است" };
    } else {
      let cost = 0;
      for (const pi of recipe) {
        const ing = pi.ingredient;
        if (pi.unit !== ing.unit) { row.issue = { product: it.product.nameFa, issue: `واحد رسپی و انبار برای «${ing.nameFa}» یکسان نیست` }; break; }
        if (ing.costPerUnit == null) { row.issue = { product: it.product.nameFa, issue: `هزینهٔ واحد «${ing.nameFa}» ثبت نشده است` }; break; }
        cost += pi.quantity * ing.costPerUnit;
      }
      if (!row.issue) row.cost += cost * it.quantity;
    }
    perProduct.set(it.productId, row);
  }
  const rows = [...perProduct.values()];
  const missing = rows.filter(r => r.issue).map(r => r.issue!);
  if (missing.length) {
    return {
      from: from.toISOString(), to: to.toISOString(), currency: "TOMAN",
      available: false, revenue, reason: "محاسبهٔ هزینه/سود با دادهٔ موجود ممکن نیست؛ هزینه یا سود فرضی ارائه نمی‌شود.",
      missing: missing.slice(0, 20), basis: PROFIT_BASIS, sources,
    };
  }
  const cost = Math.round(rows.reduce((sum, r) => sum + r.cost, 0));
  if (!Number.isSafeInteger(cost)) throw new Error("UNSAFE_MONEY_VALUE");
  return {
    from: from.toISOString(), to: to.toISOString(), currency: "TOMAN",
    available: true, revenue, cost, profit: revenue - cost,
    byProduct: rows.map(r => ({ product: r.product, quantity: r.quantity, revenue: r.revenue, cost: Math.round(r.cost), profit: r.revenue - Math.round(r.cost) })).sort((a, b) => b.profit - a.profit),
    basis: PROFIT_BASIS, sources,
  };
}

export function profitToFaText(p: ProfitSummary): string {
  if (!p.available) {
    return [
      `محاسبهٔ سود/هزینه برای بازهٔ ${p.from} تا ${p.to} ممکن نیست.`,
      `دلیل: ${p.reason}`,
      ...p.missing.map(m => `• ${m.product}: ${m.issue}`),
      `درآمد همان بازه (بدون سود): ${p.revenue} تومان`,
    ].join("\n");
  }
  return [
    `سود و هزینه (هزینهٔ مواد اولیه) بازهٔ ${p.from} تا ${p.to}:`,
    `درآمد: ${p.revenue} تومان؛ هزینهٔ مواد: ${p.cost} تومان؛ سود: ${p.profit} تومان`,
    `مبنا: ${p.basis}`,
    ...p.byProduct.slice(0, 5).map(r => `• ${r.product}: درآمد ${r.revenue}؛ هزینه ${r.cost}؛ سود ${r.profit} تومان (${r.quantity} عدد)`),
  ].join("\n");
}
