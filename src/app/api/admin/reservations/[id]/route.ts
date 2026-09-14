import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const updateSchema = z.object({
  status: z.enum(["RESERVED", "SEATED", "CANCELLED", "NO_SHOW"]).optional(),
  customerName: z.string().min(1).max(80).optional(),
  customerPhone: z.string().max(20).optional().nullable(),
  guests: z.number().int().min(1).max(40).optional(),
  reservedAt: z.string().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("tables.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.reservedAt) {
    const d = new Date(parsed.data.reservedAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "تاریخ نامعتبر است" }, { status: 400 });
    }
    data.reservedAt = d;
  }

  const reservation = await prisma.tableReservation.update({
    where: { id: params.id },
    data,
    include: { table: { select: { id: true } } },
  });

  // Seating a reservation occupies the table; cancelling frees it if no other
  // active orders/reservations hold it.
  if (parsed.data.status === "SEATED") {
    await prisma.cafeTable.update({
      where: { id: reservation.tableId },
      data: { isOccupied: true, occupiedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("tables.manage");
  if ("res" in g) return g.res;
  await prisma.tableReservation.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
