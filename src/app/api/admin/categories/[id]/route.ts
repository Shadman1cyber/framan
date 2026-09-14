import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({
  nameFa: z.string().min(1).optional(),
  nameEn: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("categories.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const cat = await prisma.category.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ id: cat.id });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("categories.manage");
  if ("res" in g) return g.res;
  try {
    await prisma.category.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "این دسته محصول دارد و قابل حذف نیست" }, { status: 400 });
  }
}
