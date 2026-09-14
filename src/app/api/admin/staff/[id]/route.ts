import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { STAFF_ROLES } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  isActive: z.boolean().optional(),
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
