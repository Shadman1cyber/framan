import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";

const schema = z.object({
  slug: z.string().min(1),
  nameFa: z.string().min(1),
  nameEn: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  order: z.number().int(),
  isActive: z.boolean(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin((session?.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const exists = await prisma.category.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) return NextResponse.json({ error: "slug تکراری" }, { status: 400 });
  const cat = await prisma.category.create({ data: parsed.data });
  return NextResponse.json({ id: cat.id });
}