import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { STAFF_ROLES } from "@/lib/constants";

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  isActive: z.boolean().optional(),
  task: z.string().max(200).optional().nullable(),
  shiftStart: z.string().regex(HHMM, "ساعت شروع نامعتبر (HH:mm)").optional().nullable(),
  shiftEnd: z.string().regex(HHMM, "ساعت پایان نامعتبر (HH:mm)").optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  await prisma.staff.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  await prisma.staff.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
