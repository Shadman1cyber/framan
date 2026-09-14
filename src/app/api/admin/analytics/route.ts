import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import {
  getFinancialSummary,
  getRevenueByProduct,
  getRevenueByCategory,
  getDailyRevenue,
  getInventoryStatus,
  getOperationalStatus,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Financial dashboard data — owner only (Rule 9). */
export async function GET() {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const [summary, topProducts, byCategory, daily, inventory, ops] = await Promise.all([
    getFinancialSummary(),
    getRevenueByProduct(10),
    getRevenueByCategory(),
    getDailyRevenue(14),
    getInventoryStatus(),
    getOperationalStatus(),
  ]);
  return NextResponse.json({
    summary,
    topProducts,
    leastSelling: [...topProducts].reverse().slice(0, 5),
    byCategory,
    daily,
    lowStock: inventory.filter((i) => i.isLow),
    lowStockCost: inventory.reduce(
      (s, i) => s + (i.lowStockCost ?? 0),
      0,
    ),
    operations: ops,
  });
}
