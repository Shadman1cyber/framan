import { prisma } from "@/lib/db";
import { requireOwnerPage } from "@/lib/admin-page-access";
import { DiscountsAdmin, type DiscountRow } from "@/components/admin/DiscountsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  await requireOwnerPage();
  const rows = await prisma.discountCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });

  const initial: DiscountRow[] = rows.map((d) => ({
    id: d.id,
    code: d.code,
    type: d.type === "FIXED" ? "FIXED" : "PERCENT",
    value: d.value,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    minOrderAmount: d.minOrderAmount,
    maxDiscount: d.maxDiscount,
    usageLimit: d.usageLimit,
    perUserLimit: d.perUserLimit,
    isActive: d.isActive,
    archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
    usedCount: d.usedCount,
    redemptionCount: d._count.redemptions,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="heading-section mb-6">کدهای تخفیف</h1>
      <DiscountsAdmin initial={initial} />
    </div>
  );
}
