import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { calcLateOvertime, tehranDateKey } from "@/lib/operations";
import { resolveStaffShift } from "@/lib/staff-shifts";

export const dynamic = "force-dynamic";

const checkSchema = z.object({
  staffId: z.string().min(1),
  action: z.enum(["checkin", "checkout"]),
  at: z.string().optional(), // ISO datetime; defaults to now
  note: z.string().max(300).optional().nullable(),
});

function dayKeyOf(d: Date): string {
  return tehranDateKey(d);
}

export async function GET(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId");
  const month = searchParams.get("month"); // YYYY-MM
  const where: Record<string, unknown> = {};
  if (staffId) where.staffId = staffId;
  if (month && /^\d{4}-\d{2}$/.test(month)) where.date = { startsWith: month };
  const rows = await prisma.staffAttendance.findMany({
    where,
    include: { staff: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  return NextResponse.json({ attendance: rows });
}

export async function POST(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = checkSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const staff = await prisma.staff.findUnique({
    where: { id: parsed.data.staffId },
    include: {
      shiftRotation: {
        include: { slots: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!staff) return NextResponse.json({ error: "پرسنل یافت نشد" }, { status: 404 });
  const at = parsed.data.at ? new Date(parsed.data.at) : new Date();
  if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "زمان نامعتبر" }, { status: 400 });
  const date = dayKeyOf(at);
  const existing = await prisma.staffAttendance.findUnique({
    where: { staffId_date: { staffId: staff.id, date } },
  }).catch(() => null);
  const checkIn = parsed.data.action === "checkin" ? at : (existing?.checkIn ?? null);
  const checkOut = parsed.data.action === "checkout" ? at : (existing?.checkOut ?? null);
  if (parsed.data.action === "checkout" && !checkIn) {
    return NextResponse.json({ error: "ابتدا ورود ثبت شود" }, { status: 400 });
  }
  const scheduledShift = resolveStaffShift(
    staff.shiftStart,
    staff.shiftEnd,
    staff.shiftRotation,
    date,
  );
  const { lateMin, overtimeMin } = calcLateOvertime(
    scheduledShift.shiftStart,
    scheduledShift.shiftEnd,
    checkIn,
    checkOut,
  );
  const row = existing
    ? await prisma.staffAttendance.update({
        where: { id: existing.id },
        data: { checkIn, checkOut, lateMin, overtimeMin, note: parsed.data.note ?? existing.note },
      })
    : await prisma.staffAttendance.create({
        data: { staffId: staff.id, date, checkIn, checkOut, lateMin, overtimeMin, note: parsed.data.note ?? null },
      });
  return NextResponse.json({ attendance: row, scheduledShift, lateMin, overtimeMin });
}
