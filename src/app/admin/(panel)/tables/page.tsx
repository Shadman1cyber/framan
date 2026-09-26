import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/guards";
import { getEnabledCashierTabs } from "@/lib/cashier-access";
import { TablesAdmin } from "@/components/admin/TablesAdmin";
import { ReservationsAdmin } from "@/components/admin/ReservationsAdmin";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

/** میزها + رزرو میزها live on one page; either cashier permission opens it. */
export default async function AdminTablesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const isOwner = user.role === "OWNER";
  const enabled = isOwner ? [] : await getEnabledCashierTabs();
  const canManageTables = isOwner || enabled.includes("tables");
  const canSeeReservations = isOwner || enabled.includes("reservations");
  if (!canManageTables && !canSeeReservations) redirect("/admin/no-access");

  const now = new Date();
  const [tables, reservations] = await Promise.all([
    prisma.cafeTable.findMany({
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
    }),
    canSeeReservations
      ? prisma.tableReservation.findMany({
          orderBy: { reservedAt: "asc" },
          take: 200,
          include: { table: { select: { number: true, label: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <SectionPage
      kind="crm"
      title="میزها و رزرو میزها"
      exclude="/admin/tables"
      description="مدیریت میزها، اشغال و کد QR — به‌همراه رزرو میزها و بررسی خودکار تداخل زمانی."
    >
      {canManageTables && (
        <TablesAdmin canManageStructure={user.role === "OWNER"}
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
      )}
      {canSeeReservations && (
        <div className="mt-5 border-t border-dashboard-line pt-5">
          <p className="mb-4 text-xs leading-relaxed text-dashboard-foreground">رزرو ثبت کنید، تداخل زمانی به‌صورت خودکار بررسی می‌شود و با «نشست مشتری» میز اشغال می‌شود.</p>
          <ReservationsAdmin
            tables={tables.map((t) => ({ id: t.id, number: t.number, label: t.label }))}
            initial={reservations.map((r) => ({
              id: r.id,
              tableId: r.tableId,
              tableNumber: r.table.number,
              tableLabel: r.table.label,
              customerName: r.customerName,
              customerPhone: r.customerPhone,
              guests: r.guests,
              reservedAt: r.reservedAt.toISOString(),
              durationMin: r.durationMin,
              status: r.status,
            }))}
          />
        </div>
      )}
    </SectionPage>
  );
}
