import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { UNITS } from "@/lib/constants";

const schema = z.object({
  nameFa: z.string().min(1).optional(),
  nameEn: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isAllergen: z.boolean().optional(),
  unit: z.enum(UNITS).optional(),
  stockQuantity: z.number().optional(),
  minQuantity: z.number().nullable().optional(),
  costPerUnit: z.number().nullable().optional(),
  supplier: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("ingredients.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const ing = await prisma.ingredient.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ id: ing.id });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("ingredients.manage");
  if ("res" in g) return g.res;
  try {
    await prisma.ingredient.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "قابل حذف نیست" }, { status: 400 });
  }
}
