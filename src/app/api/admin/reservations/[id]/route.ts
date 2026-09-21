import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "@/lib/offline/server";

const updateSchema = z.object({
  status: z.enum(["RESERVED", "SEATED", "CANCELLED", "NO_SHOW"]).optional(),
  customerName: z.string().min(1).max(80).optional(),
  customerPhone: z.string().max(20).optional().nullable(),
  guests: z.number().int().min(1).max(40).optional(),
  reservedAt: z.string().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
});

class ReservationUpdateError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("tables.manage", "reservations");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });

  try {
    const receipt = await runIdempotentOfflineMutation(req, g.user.id, { id: params.id, ...parsed.data }, async (tx) => {
      const current = await tx.tableReservation.findUnique({ where: { id: params.id } });
      if (!current) throw new ReservationUpdateError("رزرو یافت نشد", 404);

      const data: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.reservedAt) {
        const d = new Date(parsed.data.reservedAt);
        if (Number.isNaN(d.getTime())) throw new ReservationUpdateError("تاریخ نامعتبر است", 400);
        data.reservedAt = d;
      }

      if ((parsed.data.durationMin != null || parsed.data.reservedAt) && ["RESERVED", "SEATED"].includes(current.status)) {
        const start = (data.reservedAt as Date | undefined) ?? current.reservedAt;
        const duration = parsed.data.durationMin ?? current.durationMin;
        const end = new Date(start.getTime() + duration * 60000);
        const possibleConflicts = await tx.tableReservation.findMany({
          where: {
            id: { not: current.id },
            tableId: current.tableId,
            status: { in: ["RESERVED", "SEATED"] },
            reservedAt: { lt: end },
          },
          select: { reservedAt: true, durationMin: true, customerName: true },
        });
        const conflict = possibleConflicts.find((item) => new Date(item.reservedAt.getTime() + item.durationMin * 60000) > start);
        if (conflict) throw new ReservationUpdateError(`تمدید با رزرو ${conflict.customerName} تداخل دارد`, 409);
      }

      const reservation = await tx.tableReservation.update({
        where: { id: params.id },
        data,
        include: { table: { select: { id: true } } },
      });

      if (parsed.data.status === "SEATED") {
        await tx.cafeTable.update({
          where: { id: reservation.tableId },
          data: { isOccupied: true, occupiedAt: new Date() },
        });
      }
      return { body: { ok: true } };
    });
    return NextResponse.json(receipt.body, {
      status: receipt.status,
      headers: { "X-Farman-Replayed": receipt.replayed ? "1" : "0" },
    });
  } catch (error) {
    if (error instanceof OfflineMutationConflict) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReservationUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "به‌روزرسانی رزرو انجام نشد" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("tables.manage", "reservations");
  if ("res" in g) return g.res;
  await prisma.tableReservation.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
