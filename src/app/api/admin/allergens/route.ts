import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({
  key: z.string().min(1),
  nameFa: z.string().min(1),
  nameEn: z.string().min(1),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const g = await guard("allergens.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const exists = await prisma.allergen.findUnique({ where: { key: parsed.data.key } });
  if (exists) return NextResponse.json({ error: "کلید تکراری" }, { status: 400 });
  const a = await prisma.allergen.create({ data: parsed.data });
  return NextResponse.json({ id: a.id });
}
