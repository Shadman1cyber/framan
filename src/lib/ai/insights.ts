import { prisma } from "@/lib/db";
import { getInventoryStatus, getOperationalStatus, getFinancialSummary } from "@/lib/analytics";
import { isAiEnabled } from "./settings";
import { aiService } from "./service";

/**
 * AIInsightService — generates proactive alerts (inventory reorder warnings,
 * workload capacity risks) deterministically from business data, and can enrich
 * them with AI narrative when AI is enabled. Deterministic alerts always work
 * even when AI is off.
 */

export type InsightDraft = {
  kind: string;
  severity: string;
  title: string;
  body: string;
};

export class AIInsightService {
  /** Deterministic rule-based insights — always available. */
  async generateOperationalInsights(): Promise<InsightDraft[]> {
    const [inventory, ops, finance] = await Promise.all([
      getInventoryStatus(),
      getOperationalStatus(),
      getFinancialSummary(),
    ]);
    const drafts: InsightDraft[] = [];

    for (const item of inventory) {
      if (item.isLow) {
        drafts.push({
          kind: "INVENTORY",
          severity: item.stock <= 0 ? "CRITICAL" : "WARNING",
          title: `موجودی ${item.name} کم است`,
          body:
            item.minStock != null
              ? `موجودی فعلی ${item.stock} ${item.unit} است و از حداقل تعریف‌شده (${item.minStock} ${item.unit}) کمتر است.`
              : `موجودی فعلی ${item.name} برابر ${item.stock} ${item.unit} است.`,
        });
      }
    }

    const perChefLoad = ops.chefs > 0 ? ops.activeOrders / ops.chefs : ops.activeOrders;
    if (ops.activeOrders > 0 && perChefLoad >= 5) {
      drafts.push({
        kind: "OPERATION",
        severity: "WARNING",
        title: "ظرفیت آشپزخانه تحت فشار است",
        body: `با ${ops.chefs} شف فعال و ${ops.activeOrders} سفارش در جریان، هر شف حدود ${Math.round(
          perChefLoad,
        )} سفارش همزمان دارد. افزایش نیرو یا توقف پذیرش موقت را بررسی کنید.`,
      });
    }

    if (finance.revenue.today != null && finance.orders.today > 0) {
      const aov = finance.averageOrderValue.today;
      drafts.push({
        kind: "FINANCE",
        severity: "INFO",
        title: "خلاصه فروش امروز",
        body: `امروز ${finance.orders.today} سفارش با مجموع ${new Intl.NumberFormat(
          "fa-IR",
        ).format(finance.revenue.today)} تومان ثبت شده است${
          aov ? `؛ میانگین هر سفارش ${new Intl.NumberFormat("fa-IR").format(aov)} تومان.` : "."
        }`,
      });
    }

    return drafts;
  }

  /** Persist new insights, avoiding duplicates within the same day. */
  async refreshAndStore(): Promise<number> {
    const drafts = await this.generateOperationalInsights();
    let created = 0;
    for (const d of drafts) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const exists = await prisma.aIInsight.findFirst({
        where: { title: d.title, kind: d.kind, createdAt: { gte: startOfDay } },
      });
      if (exists) continue;
      await prisma.aIInsight.create({ data: d });
      created++;
    }
    return created;
  }

  /** Optional AI narrative summary of current insights (only when enabled). */
  async aiSummary(): Promise<{ ok: boolean; text: string }> {
    if (!(await isAiEnabled())) {
      return { ok: false, text: "دستیار هوشمند غیرفعال است." };
    }
    const drafts = await this.generateOperationalInsights();
    if (!drafts.length) {
      return { ok: true, text: "در حال حاضر هشدار خاصی وجود ندارد. وضعیت کافه پایدار است." };
    }
    const list = drafts.map((d) => `- [${d.severity}] ${d.title}: ${d.body}`).join("\n");
    const res = await aiService.ask(
      `بر اساس هشدارهای زیر یک جمع‌بندی کوتاه مدیریتی (حداکثر ۴ جمله) بنویس:\n${list}`,
    );
    return res.ok ? { ok: true, text: res.answer } : { ok: false, text: res.reason };
  }
}

export const aiInsightService = new AIInsightService();
