import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { invalidateMenuCache } from "@/lib/cache";

const schema = z.object({
  nameFa: z.string().min(1),
  nameEn: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  const g = await guard("categories.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const data = parsed.data;
  const slug = data.slug?.trim() ? slugify(data.slug) : slugify(data.nameFa);
  const exists = await prisma.category.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: "slug تکراری" }, { status: 400 });
  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
  const cat = await prisma.category.create({
    data: {
      slug,
      nameFa: data.nameFa,
      nameEn: data.nameEn ?? null,
      icon: data.icon ?? null,
      description: data.description ?? null,
      order: data.order ?? (maxOrder._max.order ?? 0) + 1,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateMenuCache();
  return NextResponse.json({ id: cat.id });
}
