import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/guards";
import { getLeaveDeadlineHours } from "@/lib/operations";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().trim().max(500).optional().nullable(),
  staffId: z.string().min(1).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user || (user.role !== "OWNER" && user.role !== "CASHIER")) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: user ? 403 : 401 });
  }

  const [leaves, staffList] = await Promise.all([
    prisma.staffLeave.findMany({
      include: { staff: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, task: true, isActive: true },
    }),
  ]);

  return NextResponse.json({
    pendingCount: leaves.filter((leave) => leave.status === "PENDING").length,
    leaves,
    staff: staffList,
    deadlineH: await getLeaveDeadlineHours(),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });
  if (user.role !== "CASHIER") {
    return NextResponse.json({ error: "ثبت این فرم مخصوص صندوق‌دار است" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 });

  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to)) {
    return NextResponse.json({ error: "بازهٔ مرخصی نامعتبر است" }, { status: 400 });
  }

  const deadlineH = await getLeaveDeadlineHours();
  const hoursAhead = (from.getTime() - Date.now()) / 3_600_000;
  if (hoursAhead < deadlineH) {
    return NextResponse.json(
      { error: `درخواست مرخصی باید حداقل ${deadlineH} ساعت قبل ثبت شود` },
      { status: 400 },
    );
  }

  const staff = parsed.data.staffId
    ? await prisma.staff.findUnique({ where: { id: parsed.data.staffId } })
    : await prisma.staff.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        name: user.name?.trim() || user.email || "صندوق‌دار",
        role: "OTHER",
        task: "صندوق‌دار",
      },
      update: { userId: user.id },
    });
  if (!staff) {
    return NextResponse.json({ error: "پرسنل یافت نشد" }, { status: 404 });
  }

  const overlap = await prisma.staffLeave.findFirst({
    where: {
      staffId: staff.id,
      status: { in: ["PENDING", "APPROVED"] },
      from: { lt: to },
      to: { gt: from },
    },
    select: { id: true },
  });
  if (overlap) {
    return NextResponse.json({ error: "برای این بازه قبلاً درخواست مرخصی ثبت شده است" }, { status: 409 });
  }

  const leave = await prisma.staffLeave.create({
    data: {
      staffId: staff.id,
      type: "ADVANCE",
      from,
      to,
      status: "PENDING",
      reason: parsed.data.reason || null,
    },
  });
  return NextResponse.json({ id: leave.id, status: leave.status }, { status: 201 });
}
