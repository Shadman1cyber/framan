import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { resolvePayRate, estimateHourlyPay } from "@/lib/staff-pay";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function workedMinutes(checkIn: Date | null, checkOut: Date | null): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000));
}

/**
 * Day-by-day pay estimate for one staff member over a date range.
 * Rate is resolved per attendance day from the append-only history, so
 * mid-month pay changes price each day correctly. No overtime multiplier —
 * overtime is paid at the same rate and reported separately.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;

  const url = new URL(req.url);
  const toParam = url.searchParams.get("to");
  const fromParam = url.searchParams.get("from");
  const to = toParam ? new Date(`${toParam}T23:59:59.999+03:30`) : new Date();
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00.000+03:30`)
    : new Date(to.getTime() - 29 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return NextResponse.json({ error: "بازه زمانی نامعتبر است" }, { status: 400 });
  }

  const staff = await prisma.staff.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!staff) return NextResponse.json({ error: "عضو تیم یافت نشد" }, { status: 404 });

  // Rates effective on or before end of range (plus one earlier for lookup).
  const rates = await prisma.staffPayRate.findMany({
    where: { staffId: params.id, effectiveAt: { lte: to } },
    orderBy: { effectiveAt: "desc" },
  });

  const attendance = await prisma.staffAttendance.findMany({
    where: { staffId: params.id, date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } },
    orderBy: { date: "asc" },
  });

  const days = attendance.map((a) => {
    const dayStart = new Date(`${a.date}T12:00:00.000+03:30`); // midday anchor for rate resolution
    const rate = resolvePayRate(rates, Number.isNaN(dayStart.getTime()) ? from : dayStart);
    const workedMin = workedMinutes(a.checkIn, a.checkOut);
    const est = estimateHourlyPay({ workedMin, overtimeMin: a.overtimeMin, rate });
    return {
      date: a.date,
      workedMin,
      overtimeMin: a.overtimeMin,
      rate,
      estimate: est,
    };
  });

  const totalPay = days.reduce((s, d) => s + d.estimate.totalPay, 0);
  const totalWorkedMin = days.reduce((s, d) => s + d.workedMin, 0);
  const totalOvertimeMin = days.reduce((s, d) => s + d.estimate.overtimeMin, 0);

  return NextResponse.json(
    {
      staff,
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      summary: { totalPay, totalWorkedMin, totalOvertimeMin, dayCount: days.length },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
