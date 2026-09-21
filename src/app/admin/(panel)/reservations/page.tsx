import { prisma } from "@/lib/db";
import { ReservationsAdmin } from "@/components/admin/ReservationsAdmin";
import { requireAdminPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

export default async function AdminReservationsPage() {
  await requireAdminPage("reservations");
  const [reservations, tables] = await Promise.all([
    prisma.tableReservation.findMany({
      orderBy: { reservedAt: "asc" },
      take: 200,
      include: { table: { select: { number: true, label: true } } },
    }),
    prisma.cafeTable.findMany({
      orderBy: { number: "asc" },
      select: { id: true, number: true, label: true },
    }),
  ]);

  return (
    <div>
      <h1 className="heading-section mb-2">رزرو میزها</h1>
      <p className="mb-6 text-sm text-muted">
        رزرو ثبت کنید، تداخل زمانی به‌صورت خودکار بررسی می‌شود و با «نشست مشتری» میز اشغال می‌شود.
      </p>
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
  );
}
