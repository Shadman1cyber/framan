import { prisma } from "@/lib/db";
import { TablesAdmin } from "@/components/admin/TablesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const tables = await prisma.cafeTable.findMany({
    orderBy: { createdAt: "desc" },
    include: { branch: true, _count: { select: { orders: true, qrCodes: true } } },
    take: 200,
  });
  return (
    <div>
      <h1 className="heading-section mb-6">میزها</h1>
      <TablesAdmin
        initial={tables.map((t) => ({
          id: t.id,
          number: t.number,
          label: t.label,
          isActive: t.isActive,
          branchName: t.branch.nameFa,
          orderCount: t._count.orders,
          qrCount: t._count.qrCodes,
        }))}
      />
    </div>
  );
}