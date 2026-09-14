import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({
  nameFa: z.string().min(1).max(80).optional(),
  nameEn: z.string().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("products.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  await prisma.coffeeLine.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("products.manage");
  if ("res" in g) return g.res;
  try {
    await prisma.coffeeLine.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "قابل حذف نیست" }, { status: 400 });
  }
}
