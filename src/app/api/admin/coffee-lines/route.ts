import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({
  nameFa: z.string().min(1).max(80),
  nameEn: z.string().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const g = await guard("products.manage");
  if ("res" in g) return g.res;
  const lines = await prisma.coffeeLine.findMany({ orderBy: { nameFa: "asc" } });
  return NextResponse.json({ coffeeLines: lines }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
}

export async function POST(req: Request) {
  const g = await guard("products.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const exists = await prisma.coffeeLine.findFirst({ where: { nameFa: parsed.data.nameFa } });
  if (exists) return NextResponse.json({ error: "خط قهوه‌ای با این نام وجود دارد" }, { status: 400 });
  const line = await prisma.coffeeLine.create({ data: parsed.data });
  return NextResponse.json({ id: line.id });
}
