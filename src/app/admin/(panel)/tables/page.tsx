import { prisma } from "@/lib/db";
import { TablesAdmin } from "@/components/admin/TablesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const now = new Date();
  const tables = await prisma.cafeTable.findMany({
    orderBy: [{ isActive: "desc" }, { number: "asc" }],
    include: {
      branch: true,
      _count: { select: { orders: true, qrCodes: true } },
      reservations: {
        where: { status: { in: ["RESERVED", "SEATED"] }, reservedAt: { gte: now } },
        orderBy: { reservedAt: "asc" },
        take: 1,
      },
    },
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
          isOccupied: t.isOccupied,
          occupiedAt: t.occupiedAt?.toISOString() ?? null,
          branchName: t.branch.nameFa,
          orderCount: t._count.orders,
          qrCount: t._count.qrCodes,
          nextReservation: t.reservations[0]
            ? {
                customerName: t.reservations[0].customerName,
                reservedAt: t.reservations[0].reservedAt.toISOString(),
              }
            : null,
        }))}
      />
    </div>
  );
}
