import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { staffUpdateSchema } from "@/lib/staff-api";

const includeRotation = {
  shiftRotation: {
    include: { slots: { orderBy: { position: "asc" as const } } },
  },
};

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = staffUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const { rotation, ...data } = parsed.data;
  if (Object.keys(data).length === 0 && rotation === undefined) {
    return NextResponse.json({ error: "فیلدی برای ویرایش ارسال نشده است" }, { status: 400 });
  }

  const current = await prisma.staff.findUnique({
    where: { id: params.id },
    select: { id: true, shiftStart: true, shiftEnd: true },
  });
  if (!current) return NextResponse.json({ error: "پرسنل یافت نشد" }, { status: 404 });
  if (data.shiftStart !== undefined || data.shiftEnd !== undefined) {
    const shiftStart = data.shiftStart === undefined ? current.shiftStart : data.shiftStart;
    const shiftEnd = data.shiftEnd === undefined ? current.shiftEnd : data.shiftEnd;
    if ((shiftStart == null) !== (shiftEnd == null)) {
      return NextResponse.json({ error: "ساعت شروع و پایان باید هر دو مقدار داشته باشند" }, { status: 400 });
    }
  }

  const member = await prisma.$transaction(async (tx) => {
    if (rotation !== undefined) {
      if (rotation === null) {
        await tx.staffShiftRotation.deleteMany({ where: { staffId: params.id } });
      } else {
        const slots = rotation.slots.map(({ position, label, shiftStart, shiftEnd }) => ({
          position,
          label,
          shiftStart,
          shiftEnd,
        }));
        await tx.staffShiftRotation.upsert({
          where: { staffId: params.id },
          create: {
            staffId: params.id,
            isEnabled: rotation.isEnabled,
            startDate: rotation.startDate,
            slots: { create: slots },
          },
          update: {
            isEnabled: rotation.isEnabled,
            startDate: rotation.startDate,
            slots: { deleteMany: {}, create: slots },
          },
        });
      }
    }
    if (Object.keys(data).length > 0) {
      await tx.staff.update({ where: { id: params.id }, data });
    }
    return tx.staff.findUnique({ where: { id: params.id }, include: includeRotation });
  });

  if (!member) return NextResponse.json({ error: "پرسنل یافت نشد" }, { status: 404 });
  return NextResponse.json({ ok: true, staff: member });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  await prisma.staff.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
