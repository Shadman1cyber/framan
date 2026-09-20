import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { getLeaveDeadlineHours } from "@/lib/operations";

export const dynamic = "force-dynamic";

const schema = z.object({
  staffId: z.string().min(1),
  type: z.enum(["ADVANCE", "INSTANT"]).default("ADVANCE"),
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

export async function GET(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const staffId = searchParams.get("staffId");
  const rows = await prisma.staffLeave.findMany({
    where: {
      ...(staffId ? { staffId } : {}),
      ...(status && ["PENDING", "APPROVED", "REJECTED"].includes(status) ? { status } : {}),
    },
    include: { staff: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const deadlineH = await getLeaveDeadlineHours();
  return NextResponse.json({ leaves: rows, deadlineH });
}

export async function POST(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const staff = await prisma.staff.findUnique({ where: { id: parsed.data.staffId } });
  if (!staff) return NextResponse.json({ error: "پرسنل یافت نشد" }, { status: 404 });
  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to)) {
    return NextResponse.json({ error: "بازهٔ مرخصی نامعتبر است" }, { status: 400 });
  }
  if (parsed.data.type === "ADVANCE") {
    // Staff advance request: must respect configurable deadline (default 48h).
    const deadlineH = await getLeaveDeadlineHours();
    const hoursAhead = (from.getTime() - Date.now()) / 3600000;
    if (hoursAhead < deadlineH) {
      return NextResponse.json({ error: `درخواست مرخصی باید حداقل ${deadlineH} ساعت قبل ثبت شود` }, { status: 400 });
    }
    const created = await prisma.staffLeave.create({
      data: { staffId: staff.id, type: "ADVANCE", from, to, status: "PENDING", reason: parsed.data.reason ?? null },
    });
    return NextResponse.json({ id: created.id, status: "PENDING" });
  }
  // Instant leave registered directly by the manager: auto-approved.
  const created = await prisma.staffLeave.create({
    data: { staffId: staff.id, type: "INSTANT", from, to, status: "APPROVED", reason: parsed.data.reason ?? null },
  });
  return NextResponse.json({ id: created.id, status: "APPROVED" });
}
