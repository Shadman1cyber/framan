import { prisma } from "@/lib/db";
import { completedProfitSummary } from "@/lib/reporting";

/* ── Shared range helpers ─────────────────────────────────────────── */

export type DateRange = { from: Date; to: Date };

export function parseDateRange(fromStr?: string | null, toStr?: string | null, defaultDays = 14): DateRange {
  const to = toStr ? new Date(toStr.length <= 10 ? `${toStr}T23:59:59.999Z` : toStr) : new Date();
  const from = fromStr
    ? new Date(fromStr.length <= 10 ? `${fromStr}T00:00:00.000Z` : fromStr)
    : new Date(to.getTime() - defaultDays * 86400000);
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  if (to.getTime() - from.getTime() > 366 * 86400000) throw new Error("RANGE_TOO_WIDE");
  return { from, to };
}

export function tehranHour(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  return h;
}

export function tehranWeekday(d: Date): number {
  // 0=Sunday..6=Saturday matching SalesFlowSchedule convention.
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  if (day in map) return map[day];
  return d.getUTCDay();
}

export function tehranDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const GOAL_METRICS = ["TOTAL_SALES", "TOTAL_PROFIT", "ITEM_COUNT"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABELS_FA: Record<GoalMetric, string> = {
  TOTAL_SALES: "مبلغ کل فروش",
  TOTAL_PROFIT: "سود کل",
  ITEM_COUNT: "تعداد فروش یک محصول",
};

/* ── A. GOAL SETTING ──────────────────────────────────────────────── */

export type GoalProgress = {
  id: string; title: string; metric: string; targetValue: number;
  productId: string | null; productName: string | null;
  from: string; to: string; isActive: boolean;
  current: number | null; pct: number | null;
  status: "REACHED" | "APPROACHING" | "ON_TRACK" | "MISSED" | "UNKNOWN";
  warning: string | null; profitUnavailable: boolean;
};

export const GOAL_STATUS_FA: Record<GoalProgress["status"], string> = {
  REACHED: "رسیده به هدف",
  APPROACHING: "نزدیک به هدف",
  ON_TRACK: "در مسیر",
  MISSED: "محقق نشد",
  UNKNOWN: "نامشخص",
};

export async function getGoalsWithProgress(): Promise<GoalProgress[]> {
  const goals = await prisma.goal.findMany({
    orderBy: { createdAt: "desc" },
    include: { product: { select: { nameFa: true } } },
  });
  const now = new Date();
  const out: GoalProgress[] = [];
  for (const g of goals) {
    let current: number | null = null;
    let profitUnavailable = false;
    const where = { status: "COMPLETED", createdAt: { gte: g.from, lt: g.to } };
    if (g.metric === "TOTAL_SALES") {
      const agg = await prisma.order.aggregate({ where, _sum: { total: true } });
      current = agg._sum.total ?? 0;
    } else if (g.metric === "TOTAL_PROFIT") {
      const p = await completedProfitSummary(g.from, g.to);
      if (p.available) current = p.profit;
      else { current = null; profitUnavailable = true; }
    } else if (g.metric === "ITEM_COUNT" && g.productId) {
      const agg = await prisma.orderItem.aggregate({
        where: { productId: g.productId, order: where },
        _sum: { quantity: true },
      });
      current = agg._sum.quantity ?? 0;
    }
    const pct = current == null || g.targetValue <= 0 ? null : Math.round((current / g.targetValue) * 100);
    let status: GoalProgress["status"] = "UNKNOWN";
    if (pct != null) {
      if (pct >= 100) status = "REACHED";
      else if (pct >= 80) status = "APPROACHING";
      else if (now > g.to) status = "MISSED";
      else status = "ON_TRACK";
    }
    const warning =
      status === "REACHED" ? `هدف «${g.title}» محقق شد (${pct}٪).`
      : status === "APPROACHING" ? `هدف «${g.title}» نزدیک است (${pct}٪) — اقدام کنید.`
      : status === "MISSED" ? `مهلت هدف «${g.title}» تمام شد و محقق نشد (${pct}٪).`
      : profitUnavailable ? "محاسبهٔ سود با دادهٔ موجود ممکن نیست؛ رسپی یا هزینهٔ مواد ناقص است."
      : null;
    out.push({
      id: g.id, title: g.title, metric: g.metric, targetValue: g.targetValue,
      productId: g.productId, productName: g.product?.nameFa ?? null,
      from: g.from.toISOString(), to: g.to.toISOString(), isActive: g.isActive,
      current, pct, status, warning, profitUnavailable,
    });
  }
  return out;
}

/* ── B. PRODUCT MATRIX (Profit × Sales volume) ────────────────────── */

export type MatrixQuadrant = "KEEP" | "REVIEW_TRAINING" | "CHANGE_RECIPE" | "REMOVE_FIX" | "UNKNOWN";
export type MatrixRow = {
  productId: string; product: string; category: string;
  quantity: number; revenue: number; cost: number | null; profit: number | null;
  quadrant: MatrixQuadrant; actionFa: string; profitUnknown: boolean;
};

export const MATRIX_META: Record<MatrixQuadrant, { titleFa: string; actionFa: string; hintFa: string }> = {
  KEEP: { titleFa: "سود بالا + فروش بالا", actionFa: "حفظ", hintFa: "موجودی و کیفیت را حفظ کنید." },
  REVIEW_TRAINING: { titleFa: "سود بالا + فروش پایین", actionFa: "بررسی + آموزش", hintFa: "پرومو، آموزش فروش و جایگاه منو را بررسی کنید." },
  CHANGE_RECIPE: { titleFa: "سود پایین + فروش بالا", actionFa: "تغییر دستور", hintFa: "رسپی/قیمت را بازبینی کنید تا حاشیه سود بهتر شود." },
  REMOVE_FIX: { titleFa: "سود پایین + فروش پایین", actionFa: "حذفی / اصلاح", hintFa: "اصلاح یا حذف از منو را بررسی کنید." },
  UNKNOWN: { titleFa: "نامشخص", actionFa: "تکمیل داده", hintFa: "رسپی یا هزینهٔ مواد ثبت نشده است." },
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function getProductMatrix(from: Date, to: Date): Promise<{
  from: string; to: string; profitAvailable: boolean;
  medians: { quantity: number; profit: number };
  rows: MatrixRow[];
  counts: Record<MatrixQuadrant, number>;
}> {
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  const where = { status: "COMPLETED", createdAt: { gte: from, lt: to } };
  const items = await prisma.orderItem.findMany({
    where: { order: where },
    select: {
      quantity: true, price: true, optionPrice: true, productId: true,
      product: {
        select: {
          nameFa: true, category: { select: { nameFa: true } },
          ingredients: { select: { quantity: true, unit: true, ingredient: { select: { unit: true, costPerUnit: true } } } },
        },
      },
    },
  });
  type Agg = { product: string; category: string; quantity: number; revenue: number; cost: number | null; unknown: boolean };
  const map = new Map<string, Agg>();
  for (const it of items) {
    const row = map.get(it.productId) ?? { product: it.product.nameFa, category: it.product.category.nameFa, quantity: 0, revenue: 0, cost: 0, unknown: false };
    row.quantity += it.quantity;
    row.revenue += (it.price + it.optionPrice) * it.quantity;
    const recipe = it.product.ingredients;
    if (!recipe.length) { row.unknown = true; }
    else {
      let unitCost = 0; let bad = false;
      for (const pi of recipe) {
        if (pi.unit !== pi.ingredient.unit || pi.ingredient.costPerUnit == null) { bad = true; break; }
        unitCost += pi.quantity * pi.ingredient.costPerUnit;
      }
      if (bad) row.unknown = true;
      else row.cost = (row.cost ?? 0) + unitCost * it.quantity;
    }
    map.set(it.productId, row);
  }
  const qtyMed = median([...map.values()].map((r) => r.quantity));
  const knownProfits = [...map.values()].filter((r) => !r.unknown).map((r) => r.revenue - (r.cost ?? 0));
  const profitMed = median(knownProfits);
  const profitAvailable = knownProfits.length > 0;
  const rows: MatrixRow[] = [...map.entries()].map(([productId, r]) => {
    if (r.unknown || !profitAvailable) {
      return { productId, product: r.product, category: r.category, quantity: r.quantity, revenue: r.revenue, cost: null, profit: null, quadrant: "UNKNOWN" as const, actionFa: MATRIX_META.UNKNOWN.actionFa, profitUnknown: true };
    }
    const profit = r.revenue - (r.cost ?? 0);
    const highProfit = profit >= profitMed;
    const highSales = r.quantity >= qtyMed;
    const quadrant: MatrixQuadrant = highProfit && highSales ? "KEEP" : highProfit ? "REVIEW_TRAINING" : highSales ? "CHANGE_RECIPE" : "REMOVE_FIX";
    return { productId, product: r.product, category: r.category, quantity: r.quantity, revenue: Math.round(r.revenue), cost: Math.round(r.cost ?? 0), profit: Math.round(profit), quadrant, actionFa: MATRIX_META[quadrant].actionFa, profitUnknown: false };
  }).sort((a, b) => b.quantity - a.quantity);
  const counts: Record<MatrixQuadrant, number> = { KEEP: 0, REVIEW_TRAINING: 0, CHANGE_RECIPE: 0, REMOVE_FIX: 0, UNKNOWN: 0 };
  for (const r of rows) counts[r.quadrant] += 1;
  return { from: from.toISOString(), to: to.toISOString(), profitAvailable, medians: { quantity: qtyMed, profit: Math.round(profitMed) }, rows, counts };
}

/* ── C. SALES vs DEMAND ───────────────────────────────────────────── */

export type SalesDemand = {
  from: string; to: string; currency: "TOMAN";
  totalSales: number; totalProfit: number | null; profitAvailable: boolean; invoiceCount: number;
  daily: { date: string; total: number; count: number; items: number }[];
  byProduct: { productId: string; product: string; quantity: number; total: number }[];
  bestSelling: { productId: string; product: string; quantity: number; total: number } | null;
  mostLiked: { productId: string; product: string; avg: number; votes: number } | null;
  busiestHours: { hour: number; orders: number; revenue: number }[];
  busiestWeekdays: { weekday: number; weekdayFa: string; orders: number; revenue: number }[];
  noOrderGaps: { date: string; longestGapMin: number | null; gapsCount: number }[];
  maxGap: { date: string; longestGapMin: number } | null;
};

const WEEKDAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه"];

export async function getSalesDemand(from: Date, to: Date): Promise<SalesDemand> {
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  const where = { status: "COMPLETED", createdAt: { gte: from, lt: to } };
  const [orders, items, profit] = await Promise.all([
    prisma.order.findMany({ where, select: { id: true, total: true, createdAt: true } }),
    prisma.orderItem.findMany({
      where: { order: where },
      select: { quantity: true, price: true, optionPrice: true, productId: true, product: { select: { nameFa: true } } },
    }),
    completedProfitSummary(from, to).catch(() => null),
  ]);
  const totalSales = orders.reduce((s, o) => s + o.total, 0);
  const profitAvailable = !!profit && profit.available;
  const totalProfit = profitAvailable ? (profit as { profit: number }).profit : null;

  // Daily buckets keyed by Tehran date.
  const dayMap = new Map<string, { total: number; count: number; items: number }>();
  for (const o of orders) {
    const key = tehranDateKey(o.createdAt);
    const row = dayMap.get(key) ?? { total: 0, count: 0, items: 0 };
    row.total += o.total; row.count += 1;
    dayMap.set(key, row);
  }
  const prodQty = new Map<string, number>();
  for (const it of items) {
    const key = tehranDateKey((it as unknown as { order?: { createdAt: Date } }).order?.createdAt ?? from);
    void key;
    prodQty.set(it.productId, (prodQty.get(it.productId) ?? 0) + it.quantity);
  }
  // Items per day.
  const itemsByOrder = await prisma.orderItem.findMany({
    where: { order: where },
    select: { quantity: true, order: { select: { createdAt: true } } },
  });
  for (const it of itemsByOrder) {
    const key = tehranDateKey(it.order.createdAt);
    const row = dayMap.get(key);
    if (row) row.items += it.quantity;
  }
  const daily = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));

  const prodMap = new Map<string, { productId: string; product: string; quantity: number; total: number }>();
  for (const it of items) {
    const row = prodMap.get(it.productId) ?? { productId: it.productId, product: it.product.nameFa, quantity: 0, total: 0 };
    row.quantity += it.quantity;
    row.total += (it.price + it.optionPrice) * it.quantity;
    prodMap.set(it.productId, row);
  }
  const byProduct = [...prodMap.values()].sort((a, b) => b.quantity - a.quantity);
  const bestSelling = byProduct[0] ?? null;

  let mostLiked: SalesDemand["mostLiked"] = null;
  if (byProduct.length) {
    const ids = byProduct.slice(0, 20).map((p) => p.productId);
    const agg = await prisma.rating.groupBy({ by: ["productId"], where: { productId: { in: ids } }, _avg: { rating: true }, _count: { rating: true } });
    const names = new Map(byProduct.map((p) => [p.productId, p.product]));
    const ranked = agg.filter((a) => (a._avg.rating ?? 0) > 0).sort((a, b) => (b._avg.rating ?? 0) - (a._avg.rating ?? 0));
    if (ranked[0]) mostLiked = { productId: ranked[0].productId, product: names.get(ranked[0].productId) ?? ranked[0].productId, avg: Math.round((ranked[0]._avg.rating ?? 0) * 10) / 10, votes: ranked[0]._count.rating };
  }

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, weekdayFa: WEEKDAY_FA[weekday], orders: 0, revenue: 0 }));
  for (const o of orders) {
    hours[tehranHour(o.createdAt)].orders += 1;
    hours[tehranHour(o.createdAt)].revenue += o.total;
    const w = tehranWeekday(o.createdAt);
    weekdays[w].orders += 1;
    weekdays[w].revenue += o.total;
  }

  // Longest no-order gap per day (Tehran days).
  const byDayTimes = new Map<string, number[]>();
  for (const o of orders) {
    const key = tehranDateKey(o.createdAt);
    if (!byDayTimes.has(key)) byDayTimes.set(key, []);
    byDayTimes.get(key)!.push(o.createdAt.getTime());
  }
  const noOrderGaps = [...byDayTimes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, times]) => {
    times.sort((a, b) => a - b);
    if (times.length < 2) return { date, longestGapMin: null, gapsCount: 0 };
    let max = 0;
    for (let i = 1; i < times.length; i++) max = Math.max(max, times[i] - times[i - 1]);
    return { date, longestGapMin: Math.round(max / 60000), gapsCount: times.length - 1 };
  });
  // Include empty days in range as full-day gaps? Keep only days with orders; caller sees daily for empties.
  const withGap = noOrderGaps.filter((g) => g.longestGapMin != null) as { date: string; longestGapMin: number; gapsCount: number }[];
  const maxGap = withGap.length ? withGap.reduce((a, b) => (b.longestGapMin > a.longestGapMin ? b : a)) : null;

  return {
    from: from.toISOString(), to: to.toISOString(), currency: "TOMAN",
    totalSales, totalProfit, profitAvailable, invoiceCount: orders.length,
    daily, byProduct: byProduct.slice(0, 50), bestSelling, mostLiked,
    busiestHours: hours, busiestWeekdays: weekdays, noOrderGaps,
    maxGap: maxGap ? { date: maxGap.date, longestGapMin: maxGap.longestGapMin } : null,
  };
}

export async function getDayDetail(dateKey: string): Promise<{
  date: string; total: number; count: number;
  items: { productId: string; product: string; quantity: number; total: number }[];
}> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("INVALID_DAY");
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);
  // Match Tehran-day orders by filtering in JS (keeps Tehran semantics exact).
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: new Date(start.getTime() - 86400000), lt: new Date(end.getTime() + 86400000) } },
    select: { id: true, total: true, createdAt: true },
  });
  const dayOrders = orders.filter((o) => tehranDateKey(o.createdAt) === dateKey);
  const ids = dayOrders.map((o) => o.id);
  const items = ids.length ? await prisma.orderItem.findMany({
    where: { orderId: { in: ids } },
    select: { quantity: true, price: true, optionPrice: true, productId: true, product: { select: { nameFa: true } } },
  }) : [];
  const map = new Map<string, { productId: string; product: string; quantity: number; total: number }>();
  for (const it of items) {
    const row = map.get(it.productId) ?? { productId: it.productId, product: it.product.nameFa, quantity: 0, total: 0 };
    row.quantity += it.quantity;
    row.total += (it.price + it.optionPrice) * it.quantity;
    map.set(it.productId, row);
  }
  return {
    date: dateKey,
    total: dayOrders.reduce((s, o) => s + o.total, 0),
    count: dayOrders.length,
    items: [...map.values()].sort((a, b) => b.quantity - a.quantity),
  };
}

/* ── D. STAFF ─────────────────────────────────────────────────────── */

export function timeToMin(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function tehranClockOf(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export function calcLateOvertime(shiftStart: string | null | undefined, shiftEnd: string | null | undefined, checkIn: Date | null, checkOut: Date | null): { lateMin: number; overtimeMin: number } {
  const s = timeToMin(shiftStart); const e = timeToMin(shiftEnd);
  let lateMin = 0; let overtimeMin = 0;
  if (s != null && checkIn) {
    // Compare in Asia/Tehran wall clock (DST-safe via Intl), not server-local.
    const c = tehranClockOf(checkIn);
    lateMin = Math.max(0, c - s);
  }
  if (e != null && checkOut) {
    const c = tehranClockOf(checkOut);
    overtimeMin = Math.max(0, c - e);
  }
  return { lateMin, overtimeMin };
}

export async function getLeaveDeadlineHours(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: "leave_advance_deadline_h" } }).catch(() => null);
  const n = Number(row?.value ?? 48);
  return Number.isFinite(n) && n >= 0 ? n : 48;
}

export async function getStaffMonthReport(staffId: string, month: string): Promise<{
  staffId: string; month: string; presentDays: number;
  totalLateMin: number; totalOvertimeMin: number;
  leaves: { approved: number; pending: number };
  tasks: string | null;
}> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("INVALID_MONTH");
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) throw new Error("NOT_FOUND");
  const att = await prisma.staffAttendance.findMany({ where: { staffId, date: { startsWith: month } } });
  const leaves = await prisma.staffLeave.findMany({ where: { staffId } });
  const inMonth = leaves.filter((l) => l.from.toISOString().slice(0, 7) === month || l.to.toISOString().slice(0, 7) === month);
  return {
    staffId, month,
    presentDays: att.filter((a) => a.checkIn).length,
    totalLateMin: att.reduce((s, a) => s + a.lateMin, 0),
    totalOvertimeMin: att.reduce((s, a) => s + a.overtimeMin, 0),
    leaves: { approved: inMonth.filter((l) => l.status === "APPROVED").length, pending: inMonth.filter((l) => l.status === "PENDING").length },
    tasks: staff.task,
  };
}

/** AI suggestion (heuristic): minimum required staff per hour from historical demand. */
export async function suggestStaffPerHour(from: Date, to: Date): Promise<{
  from: string; to: string; days: number;
  hours: { hour: number; avgOrders: number; avgRevenue: number; suggested: number; peak: boolean }[];
  note: string;
}> {
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  const orders = await prisma.order.findMany({
    where: { status: { in: ["COMPLETED", "READY", "PREPARING", "CONFIRMED"] }, createdAt: { gte: from, lt: to } },
    select: { total: true, createdAt: true, items: { select: { quantity: true } } },
  });
  const dayKeys = new Set(orders.map((o) => tehranDateKey(o.createdAt)));
  const days = Math.max(1, dayKeys.size);
  const perHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0, items: 0 }));
  for (const o of orders) {
    const h = tehranHour(o.createdAt);
    perHour[h].orders += 1;
    perHour[h].revenue += o.total;
    perHour[h].items += o.items.reduce((s, i) => s + i.quantity, 0);
  }
  const hours = perHour.map((h) => {
    const avgOrders = Math.round((h.orders / days) * 10) / 10;
    const avgRevenue = Math.round(h.revenue / days);
    // Heuristic: 1 staff covers ~4 orders/hour; +1 when item load is heavy.
    let suggested = 0;
    if (h.orders > 0) {
      suggested = Math.max(1, Math.ceil(avgOrders / 4));
      if (h.items / Math.max(1, h.orders) > 2.5) suggested += 1;
      suggested = Math.min(6, suggested);
    }
    return { hour: h.hour, avgOrders, avgRevenue, suggested, peak: false };
  });
  const maxAvg = Math.max(0, ...hours.map((h) => h.avgOrders));
  for (const h of hours) h.peak = maxAvg > 0 && h.avgOrders >= maxAvg * 0.7 && h.suggested > 0;
  return {
    from: from.toISOString(), to: to.toISOString(), days, hours,
    note: "پیشنهاد بر اساس میانگین سفارش هر ساعت در بازهٔ انتخابی است (هر ۴ سفارش ≈ ۱ نفر + ۱ نفر برای بار آیتمی سنگین)؛ قضاوت نهایی با مدیر است و دادهٔ غایب ساخته نمی‌شود.",
  };
}

/* ── E. WAIT TIME ─────────────────────────────────────────────────── */

export type WaitTimeRow = {
  orderId: string; createdAt: string;
  actualMin: number | null; predictedMin: number | null; wastedMin: number | null;
  bottleneck: boolean;
};

export async function getWaitTimeAnalysis(from: Date, to: Date): Promise<{
  from: string; to: string;
  count: number; avgActualMin: number | null; avgPredictedMin: number | null; avgWastedMin: number | null;
  bottleneckCount: number; bottleneckRate: number | null;
  stageAvgMin: { waitToStart: number | null; kitchen: number | null; handover: number | null };
  dataIncomplete: boolean;
  worst: (WaitTimeRow & { total: number })[];
}> {
  if (!(from < to)) throw new Error("INVALID_INTERVAL");
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lt: to } },
    select: {
      id: true, total: true, createdAt: true, startedAt: true, completedAt: true,
      estPrepMin: true, estPrepMax: true,
      items: { select: { quantity: true, product: { select: { prepBaseMin: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const rows: (WaitTimeRow & { total: number })[] = orders.map((o) => {
    const end = o.completedAt ?? null;
    const start = o.startedAt ?? o.createdAt;
    const actualMin = end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null;
    let predictedMin: number | null = null;
    if (o.estPrepMin != null || o.estPrepMax != null) {
      const lo = o.estPrepMin ?? o.estPrepMax ?? 0;
      const hi = o.estPrepMax ?? o.estPrepMin ?? 0;
      predictedMin = Math.round((lo + hi) / 2);
    } else {
      const sum = o.items.reduce((s, i) => s + i.product.prepBaseMin * i.quantity, 0);
      predictedMin = sum > 0 ? sum : null;
    }
    const wastedMin = actualMin != null && predictedMin != null ? actualMin - predictedMin : null;
    const bottleneck = actualMin != null && predictedMin != null && actualMin > predictedMin * 1.3 + 3;
    return { orderId: o.id, createdAt: o.createdAt.toISOString(), actualMin, predictedMin, wastedMin, bottleneck, total: o.total };
  });
  const actuals = rows.map((r) => r.actualMin).filter((n): n is number => n != null);
  const preds = rows.map((r) => r.predictedMin).filter((n): n is number => n != null);
  const wasteds = rows.map((r) => r.wastedMin).filter((n): n is number => n != null);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, n) => s + n, 0) / a.length) : null);
  const bottleneckCount = rows.filter((r) => r.bottleneck).length;

  // Stage durations from recorded events (best effort; legacy orders lack them).
  let stageAvgMin: { waitToStart: number | null; kitchen: number | null; handover: number | null } = { waitToStart: null, kitchen: null, handover: null };
  let dataIncomplete = false;
  try {
    const events = await prisma.orderStageEvent.findMany({
      where: { order: { status: "COMPLETED", createdAt: { gte: from, lt: to } } },
      select: { orderId: true, stage: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    const byOrder = new Map<string, { stage: string; at: number }[]>();
    for (const e of events) {
      if (!byOrder.has(e.orderId)) byOrder.set(e.orderId, []);
      byOrder.get(e.orderId)!.push({ stage: e.stage, at: e.createdAt.getTime() });
    }
    const waits: number[] = []; const kitchens: number[] = []; const handovers: number[] = [];
    for (const list of byOrder.values()) {
      const at = (s: string) => list.find((l) => l.stage === s)?.at;
      const created = at("CREATED"), confirmed = at("CONFIRMED"), preparing = at("PREPARING"), ready = at("READY"), completed = at("COMPLETED");
      if (confirmed && preparing) waits.push((preparing - confirmed) / 60000);
      else if (created && preparing) waits.push((preparing - created) / 60000);
      const kStart = preparing, kEnd = ready ?? completed;
      if (kStart && kEnd && kEnd >= kStart) kitchens.push((kEnd - kStart) / 60000);
      if (ready && completed && completed >= ready) handovers.push((completed - ready) / 60000);
    }
    stageAvgMin = { waitToStart: avg(waits.map(Math.round)), kitchen: avg(kitchens.map(Math.round)), handover: avg(handovers.map(Math.round)) };
    dataIncomplete = byOrder.size < orders.length;
  } catch {
    dataIncomplete = true;
  }

  const worst = [...rows].filter((r) => r.wastedMin != null).sort((a, b) => (b.wastedMin ?? 0) - (a.wastedMin ?? 0)).slice(0, 10);
  return {
    from: from.toISOString(), to: to.toISOString(),
    count: rows.length,
    avgActualMin: avg(actuals), avgPredictedMin: avg(preds), avgWastedMin: avg(wasteds),
    bottleneckCount, bottleneckRate: rows.length ? Math.round((bottleneckCount / rows.length) * 100) : null,
    stageAvgMin, dataIncomplete, worst,
  };
}

/* ── CSV export helper ────────────────────────────────────────────── */

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ["\uFEFF" + headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
