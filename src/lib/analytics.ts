import { prisma } from "./db";

/**
 * Backend reporting/analytics service — reusable by the financial dashboard,
 * admin dashboard and the AI context layer. Never fabricates data: metrics
 * that cannot be computed from existing data are reported as null.
 */

export type Range = { from: Date; to: Date };

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

const REVENUE_STATUSES = ["COMPLETED", "READY", "READY_TO_SERVE", "PREPARING", "CONFIRMED"];
const COUNTED_STATUSES = ["PENDING", ...REVENUE_STATUSES];

export type FinancialSummary = {
  revenue: {
    today: number | null;
    week: number | null;
    month: number | null;
    total: number | null;
  };
  orders: {
    today: number;
    week: number;
    month: number;
    active: number;
  };
  averageOrderValue: { today: number | null; month: number | null };
  ordersByType: { takeaway: number; table: number };
  discounts: {
    today: number | null;
    month: number | null;
    total: number | null;
    ordersWithDiscount: { today: number; month: number };
  };
  note: string;
};

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const [todayAgg, weekAgg, monthAgg, totalAgg, discToday, discMonth, discTotal] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: startOfToday() } },
      _sum: { total: true },
      _count: true,
      _avg: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: daysAgo(7) } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: daysAgo(30) } },
      _sum: { total: true },
      _count: true,
      _avg: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, discountAmount: { gt: 0 }, createdAt: { gte: startOfToday() } },
      _sum: { discountAmount: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, discountAmount: { gt: 0 }, createdAt: { gte: daysAgo(30) } },
      _sum: { discountAmount: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, discountAmount: { gt: 0 } },
      _sum: { discountAmount: true },
    }),
  ]);
  const [active, takeaway, table] = await Promise.all([
    prisma.order.count({ where: { status: { in: COUNTED_STATUSES } } }),
    prisma.order.count({ where: { orderType: "TAKEAWAY", createdAt: { gte: daysAgo(30) } } }),
    prisma.order.count({ where: { orderType: "TABLE", createdAt: { gte: daysAgo(30) } } }),
  ]);

  return {
    revenue: {
      today: todayAgg._sum.total ?? 0,
      week: weekAgg._sum.total ?? 0,
      month: monthAgg._sum.total ?? 0,
      total: totalAgg._sum.total ?? 0,
    },
    orders: {
      today: todayAgg._count,
      week: weekAgg._count,
      month: monthAgg._count,
      active,
    },
    averageOrderValue: {
      today: todayAgg._count ? Math.round((todayAgg._sum.total ?? 0) / todayAgg._count) : null,
      month: monthAgg._count ? Math.round((monthAgg._sum.total ?? 0) / monthAgg._count) : null,
    },
    ordersByType: { takeaway, table },
    discounts: {
      today: discToday._sum.discountAmount ?? 0,
      month: discMonth._sum.discountAmount ?? 0,
      total: discTotal._sum.discountAmount ?? 0,
      ordersWithDiscount: { today: discToday._count, month: discMonth._count },
    },
    note: "درآمد بر اساس سفارش‌های ثبت‌شده (بدون احتساب لغوشده) محاسبه می‌شود؛ هزینه و سود تا ثبت شدن داده‌های خرید در دسترس نیست.",
  };
}

export type ProductSalesRow = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export async function getRevenueByProduct(limit = 10, since?: Date): Promise<ProductSalesRow[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { status: { in: REVENUE_STATUSES }, ...(since ? { createdAt: { gte: since } } : {}) },
    },
    select: { productId: true, quantity: true, price: true, product: { select: { nameFa: true } } },
  });
  const map = new Map<string, ProductSalesRow>();
  for (const it of items) {
    const row = map.get(it.productId) ?? {
      productId: it.productId,
      name: it.product.nameFa,
      quantity: 0,
      revenue: 0,
    };
    row.quantity += it.quantity;
    row.revenue += it.price * it.quantity;
    map.set(it.productId, row);
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function getRevenueByCategory(since?: Date) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { status: { in: REVENUE_STATUSES }, ...(since ? { createdAt: { gte: since } } : {}) },
    },
    select: {
      quantity: true,
      price: true,
      product: { select: { category: { select: { nameFa: true } } } },
    },
  });
  const map = new Map<string, { revenue: number; quantity: number }>();
  for (const it of items) {
    const key = it.product.category.nameFa;
    const row = map.get(key) ?? { revenue: 0, quantity: 0 };
    row.revenue += it.price * it.quantity;
    row.quantity += it.quantity;
    map.set(key, row);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ category: name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type DailyRevenuePoint = { date: string; revenue: number; orders: number };

export async function getDailyRevenue(days = 14): Promise<DailyRevenuePoint[]> {
  const since = daysAgo(days - 1);
  const orders = await prisma.order.findMany({
    where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: since } },
    select: { total: true, createdAt: true },
  });
  const map = new Map<string, DailyRevenuePoint>();
  for (let i = 0; i < days; i++) {
    const d = daysAgo(days - 1 - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, revenue: 0, orders: 0 });
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = map.get(key);
    if (row) {
      row.revenue += o.total;
      row.orders += 1;
    }
  }
  return Array.from(map.values());
}

export type InventoryStatus = {
  ingredientId: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number | null;
  isLow: boolean;
  costPerUnit: number | null;
  lowStockCost: number | null;
};

export async function getInventoryStatus(): Promise<InventoryStatus[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    orderBy: { nameFa: "asc" },
  });
  return ingredients.map((i) => {
    const isLow = i.minQuantity != null && i.stockQuantity <= i.minQuantity;
    return {
      ingredientId: i.id,
      name: i.nameFa,
      unit: i.unit,
      stock: i.stockQuantity,
      minStock: i.minQuantity,
      isLow,
      costPerUnit: i.costPerUnit,
      lowStockCost: isLow && i.costPerUnit != null && i.minQuantity != null
        ? Math.round((i.minQuantity - i.stockQuantity) * i.costPerUnit)
        : null,
    };
  });
}

export type OperationalStatus = {
  chefs: number;
  otherStaff: number;
  activeOrders: number;
  activeItems: number;
  pendingCount: number;
  preparingCount: number;
  avgActualPrepMinutes: number | null;
};

export async function getOperationalStatus(): Promise<OperationalStatus> {
  const [chefs, otherStaff, activeOrders, pendingCount, preparingCount, completed] =
    await Promise.all([
      prisma.staff.count({ where: { isActive: true, role: "CHEF" } }),
      prisma.staff.count({ where: { isActive: true, role: { not: "CHEF" } } }),
      prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "PREPARING" } }),
      prisma.order.findMany({
        where: { status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
        select: { startedAt: true, completedAt: true },
        orderBy: { completedAt: "desc" },
        take: 50,
      }),
    ]);
  const activeOrdersRows = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } },
    select: { _count: { select: { items: true } } },
  });
  const activeItemsAgg = { _count: { items: activeOrdersRows.reduce((s, o) => s + o._count.items, 0) } };
  const durations = completed
    .map((o) =>
      o.startedAt && o.completedAt
        ? (o.completedAt.getTime() - o.startedAt.getTime()) / 60000
        : null,
    )
    .filter((n): n is number => n != null && n >= 0);
  return {
    chefs,
    otherStaff,
    activeOrders,
    activeItems: activeItemsAgg._count.items,
    pendingCount,
    preparingCount,
    avgActualPrepMinutes: durations.length
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null,
  };
}

/** Daily sales for AI context (compact). */
export async function getSalesSnapshot(days = 7) {
  const daily = await getDailyRevenue(days);
  const top = await getRevenueByProduct(5, daysAgo(days));
  return { daily, topProducts: top };
}
