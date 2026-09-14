import { prisma } from "@/lib/db";
import {
  getFinancialSummary,
  getInventoryStatus,
  getOperationalStatus,
  getRevenueByCategory,
  getRevenueByProduct,
  getSalesSnapshot,
} from "@/lib/analytics";

/**
 * AIContextService — controlled data boundary for the AI.
 * Builds a compact, structured, read-only business context per topic.
 * Never includes: passwords, tokens, API keys, customer PII beyond first names,
 * internal recipe quantities beyond aggregate consumption estimates.
 */

export type AiTopic = "general" | "finance" | "inventory" | "operations";

export type AiContext = { topic: AiTopic; summary: string };

function num(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
}

export class AIContextService {
  async buildContext(topic: AiTopic, question?: string): Promise<AiContext> {
    switch (topic) {
      case "finance":
        return this.financeContext();
      case "inventory":
        return this.inventoryContext();
      case "operations":
        return this.operationsContext();
      case "general":
      default:
        return this.generalContext(question);
    }
  }

  private async financeContext(): Promise<AiContext> {
    const [summary, topProducts, byCategory] = await Promise.all([
      getFinancialSummary(),
      getRevenueByProduct(10),
      getRevenueByCategory(),
    ]);
    const lines = [
      "### داده‌های مالی کافه",
      `- فروش امروز: ${num(summary.revenue.today)} تومان از ${summary.orders.today} سفارش`,
      `- فروش هفته: ${num(summary.revenue.week)} تومان از ${summary.orders.week} سفارش`,
      `- فروش ماه: ${num(summary.revenue.month)} تومان از ${summary.orders.month} سفارش`,
      `- فروش کل: ${num(summary.revenue.total)} تومان`,
      `- میانگین ارزش سفارش (امروز): ${num(summary.averageOrderValue.today)} تومان`,
      `- میانگین ارزش سفارش (ماه): ${num(summary.averageOrderValue.month)} تومان`,
      `- سفارش‌های ۳۰ روز اخیر — بیرون‌بر: ${summary.ordersByType.takeaway}، میز: ${summary.ordersByType.table}`,
      "- پرفروش‌ترین محصولات (درآمد):",
      ...topProducts.map((p) => `  * ${p.name}: ${p.quantity} عدد، ${num(p.revenue)} تومان`),
      "- درآمد بر اساس دسته:",
      ...byCategory.slice(0, 8).map((c) => `  * ${c.category}: ${num(c.revenue)} تومان`),
      "- توجه: هزینه و سود واقعی هنوز در سیستم ثبت نمی‌شود؛ فقط درآمد فروش واقعی است.",
    ];
    return { topic: "finance", summary: lines.join("\n") };
  }

  private async inventoryContext(): Promise<AiContext> {
    const [inventory, recipes] = await Promise.all([
      getInventoryStatus(),
      prisma.productIngredient.findMany({
        include: {
          ingredient: { select: { nameFa: true, unit: true, stockQuantity: true } },
          product: { select: { nameFa: true } },
        },
      }),
    ]);

    // Aggregate consumption per ingredient across sold items (last 30 days)
    // to estimate days-of-stock. Recipe quantities are internal but their
    // aggregates feed operational analysis.
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const orderItems = await prisma.orderItem.findMany({
      where: { order: { status: { in: ["COMPLETED", "READY", "READY_TO_SERVE", "PREPARING", "CONFIRMED"] }, createdAt: { gte: since } } },
      select: { quantity: true, productId: true },
    });
    const soldByProduct = new Map<string, number>();
    for (const it of orderItems) {
      soldByProduct.set(it.productId, (soldByProduct.get(it.productId) ?? 0) + it.quantity);
    }

    const consumption = new Map<string, { total30d: number; unit: string }>();
    for (const r of recipes) {
      const sold = soldByProduct.get(r.productId) ?? 0;
      if (!sold || !r.quantity) continue;
      const cur = consumption.get(r.ingredientId) ?? { total30d: 0, unit: r.ingredient.unit };
      cur.total30d += r.quantity * sold;
      consumption.set(r.ingredientId, cur);
    }

    const lines = [
      "### موجودی مواد اولیه",
      ...inventory.map((i) => {
        const c = consumption.get(i.ingredientId);
        const dailyUse = c ? c.total30d / 30 : null;
        const daysLeft = dailyUse && dailyUse > 0 ? Math.floor(i.stock / dailyUse) : null;
        return `- ${i.name}: موجودی ${num(i.stock)} ${i.unit} | حداقل: ${
          i.minStock != null ? num(i.minStock) : "—"
        } | مصرف روزانه تقریبی: ${dailyUse != null ? num(dailyUse) : "—"} | روزهای باقی‌مانده تقریبی: ${
          daysLeft != null ? daysLeft : "—"
        } | ${i.isLow ? "⚠ کمتر از حد مجاز" : ""}`;
      }),
      "- توجه: مقادیر دستور پخت داخلی است و نباید در پاسخ به مشتری افشا شود.",
    ];
    return { topic: "inventory", summary: lines.join("\n") };
  }

  private async operationsContext(): Promise<AiContext> {
    const [ops, sales] = await Promise.all([getOperationalStatus(), getSalesSnapshot(7)]);
    const lines = [
      "### وضعیت عملیاتی کافه",
      `- شف‌های فعال: ${ops.chefs} | سایر پرسنل فعال: ${ops.otherStaff}`,
      `- سفارش‌های فعال: ${ops.activeOrders} (${ops.activeItems} آیتم) | در انتظار تایید: ${ops.pendingCount} | در حال آماده‌سازی: ${ops.preparingCount}`,
      `- میانگین زمان واقعی آماده‌سازی (۵۰ سفارش اخیر): ${
        ops.avgActualPrepMinutes != null ? ops.avgActualPrepMinutes + " دقیقه" : "—"
      }`,
      "- فروش ۷ روز اخیر:",
      ...sales.daily.map((d) => `  * ${d.date}: ${num(d.revenue)} تومان، ${d.orders} سفارش`),
      "- پرفروش‌های هفته:",
      ...sales.topProducts.map((p) => `  * ${p.name}: ${p.quantity} عدد`),
    ];
    return { topic: "operations", summary: lines.join("\n") };
  }

  private async generalContext(question?: string): Promise<AiContext> {
    const [finance, inventory, operations] = await Promise.all([
      getFinancialSummary(),
      getInventoryStatus(),
      getOperationalStatus(),
    ]);
    const lowStock = inventory.filter((i) => i.isLow);
    const lines = [
      "### خلاصه کلی کافه",
      `- فروش امروز: ${num(finance.revenue.today)} تومان / ${finance.orders.today} سفارش`,
      `- فروش ماه: ${num(finance.revenue.month)} تومان / ${finance.orders.month} سفارش`,
      `- پرسنل: ${operations.chefs} شف، ${operations.otherStaff} سایر | سفارش فعال: ${operations.activeOrders}`,
      `- مواد کم‌موجود: ${lowStock.length ? lowStock.map((i) => `${i.name} (${num(i.stock)} ${i.unit})`).join("، ") : "ندارد"}`,
      "- تعداد محصولات:",
      `  * ${await prisma.product.count()}`,
      `  * تعداد مواد اولیه: ${await prisma.ingredient.count()}`,
    ];
    if (question && /موجودی|سفارش|مواد|شیر|قهوه/i.test(question)) {
      const inv = await this.inventoryContext();
      lines.push(inv.summary);
    }
    return { topic: "general", summary: lines.join("\n") };
  }
}
