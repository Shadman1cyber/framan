import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "@/lib/offline/server";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  tableId: z.string(),
  customerName: z.string().min(1).max(80),
  customerPhone: z.string().max(20).optional().nullable(),
  guests: z.number().int().min(1).max(40),
  reservedAt: z.string().min(1), // ISO datetime
  durationMin: z.number().int().min(15).max(480).optional(),
});

class ReservationError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** List reservations (cashier + owner). */
export async function GET() {
  const g = await guard("tables.manage", "reservations");
  if ("res" in g) return g.res;
  const reservations = await prisma.tableReservation.findMany({
    orderBy: { reservedAt: "asc" },
    take: 200,
    include: { table: { select: { number: true, label: true } } },
  });
  return NextResponse.json({
    reservations: reservations.map((r) => ({
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
    })),
  });
}

/** Create a reservation with overlap/conflict detection per table. */
export async function POST(req: Request) {
  const g = await guard("tables.manage", "reservations");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const d = parsed.data;

  const reservedAt = new Date(d.reservedAt);
  if (Number.isNaN(reservedAt.getTime())) {
    return NextResponse.json({ error: "تاریخ نامعتبر است" }, { status: 400 });
  }
  try {
    const receipt = await runIdempotentOfflineMutation(req, g.user.id, d, async (tx) => {
      const table = await tx.cafeTable.findUnique({ where: { id: d.tableId } });
      if (!table) throw new ReservationError("میز یافت نشد", 404);

      // Conflict detection and creation share the receipt transaction.
      const durationMin = d.durationMin ?? 60;
      const end = new Date(reservedAt.getTime() + durationMin * 60000);
      const existing = await tx.tableReservation.findMany({
        where: {
          tableId: d.tableId,
          status: { in: ["RESERVED", "SEATED"] },
          reservedAt: { lt: end },
        },
      });
      for (const r of existing) {
        const rEnd = new Date(r.reservedAt.getTime() + r.durationMin * 60000);
        if (rEnd > reservedAt) {
          throw new ReservationError(`این میز در این بازه رزرو دارد (${r.customerName})`, 409);
        }
      }

      const reservation = await tx.tableReservation.create({
        data: {
          tableId: d.tableId,
          customerName: d.customerName,
          customerPhone: d.customerPhone || null,
          guests: d.guests,
          reservedAt,
          durationMin,
          createdBy: g.user.id,
        },
      });
      return { body: { id: reservation.id } };
    });
    return NextResponse.json(receipt.body, {
      status: receipt.status,
      headers: { "X-Farman-Replayed": receipt.replayed ? "1" : "0" },
    });
  } catch (error) {
    if (error instanceof OfflineMutationConflict) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReservationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "ثبت رزرو انجام نشد" }, { status: 500 });
  }
}
