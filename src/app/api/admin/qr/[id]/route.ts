import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({
  isActive: z.boolean().optional(),
  label: z.string().max(60).optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("qr.manage", "qr");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  await prisma.qRCode.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("qr.manage", "qr");
  if ("res" in g) return g.res;
  await prisma.qRCode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
