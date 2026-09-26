import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFinancialSummary, getRevenueByProduct, getRevenueByCategory, getDailyRevenue, getInventoryStatus, getOperationalStatus } from "@/lib/analytics";
import { FinancialTabs } from "@/components/admin/FinancialTabs";
import { ModulePage } from "@/components/admin/dashboard/ModulePage";
import { todayGregorianInput, parseGregorianInput, padGregorian, jalaliToGregorian, gregorianToJalali } from "@/lib/jalali";

export const dynamic = "force-dynamic";

function shiftGregorian(greg: string, deltaDays: number): string {
  const g = parseGregorianInput(greg);
  if (!g) return greg;
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd) + deltaDays * 86400000);
  return padGregorian(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export default async function FinancialPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");
  const [summary, top, byCategory, daily, inventory, ops, products] = await Promise.all([
    getFinancialSummary(),
    getRevenueByProduct(8),
    getRevenueByCategory(),
    getDailyRevenue(14),
    getInventoryStatus(),
    getOperationalStatus(),
    prisma.product.findMany({ orderBy: { nameFa: "asc" }, select: { id: true, nameFa: true, price: true }, take: 300 }),
  ]);
  const lowStock = inventory.filter((i) => i.isLow);
  const lowStockCost = inventory.reduce((s, i) => i.lowStockCost ?? 0, 0);
  const todayStr = todayGregorianInput();
  const twoWeeksAgoStr = shiftGregorian(todayStr, -13);
  return (
    <ModulePage
      kind="accounting"
      title="گزارش مالی"
      related={[
        { href: "/admin/accounting", label: "حسابداری", icon: "💰" },
        { href: "/admin/sales-flow", label: "جریان فروش", icon: "📈" },
      ]}
    >
      <FinancialTabs summary={summary} top={top} byCategory={byCategory} daily={daily} lowStock={lowStock} lowStockCost={lowStockCost} ops={ops} products={products} defaultFrom={twoWeeksAgoStr} defaultTo={todayStr} />
    </ModulePage>
  );
}
