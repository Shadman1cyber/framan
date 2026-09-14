import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { UNITS } from "@/lib/constants";

const schema = z.object({
  nameFa: z.string().min(1),
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

export async function GET() {
  const g = await guard("ingredients.manage");
  if ("res" in g) return g.res;
  const ingredients = await prisma.ingredient.findMany({
    orderBy: { nameFa: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json({ ingredients });
}

export async function POST(req: Request) {
  const g = await guard("ingredients.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const exists = await prisma.ingredient.findFirst({ where: { nameFa: parsed.data.nameFa } });
  if (exists) return NextResponse.json({ error: "ماده اولیه‌ای با این نام وجود دارد" }, { status: 400 });
  const ing = await prisma.ingredient.create({ data: parsed.data });
  return NextResponse.json({ id: ing.id });
}
