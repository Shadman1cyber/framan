import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";

const schema = z.object({
  slug: z.string().min(1).max(120),
  nameFa: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional().nullable(),
  description: z.string().min(1),
  price: z.number().int().nonnegative(),
  image: z.string().url().optional().nullable().or(z.literal("")),
  categoryId: z.string(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  order: z.number().int(),
  allergenStatus: z.enum(["CONTAINS", "MAY_CONTAIN", "UNKNOWN"]),
  ingredientIds: z.array(z.string()),
  allergenIds: z.array(z.string()),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin((session.user as { role?: string } | undefined)?.role)) {
    return null;
  }
  return session;
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const data = parsed.data;
  const exists = await prisma.product.findUnique({ where: { slug: data.slug } });
  if (exists) return NextResponse.json({ error: "این slug قبلاً استفاده شده" }, { status: 400 });
  const product = await prisma.product.create({
    data: {
      slug: data.slug,
      nameFa: data.nameFa,
      nameEn: data.nameEn ?? null,
      description: data.description,
      price: data.price,
      image: data.image || null,
      categoryId: data.categoryId,
      isAvailable: data.isAvailable,
      isFeatured: data.isFeatured,
      order: data.order,
      allergenStatus: data.allergenStatus,
      ingredients: { create: data.ingredientIds.map((id) => ({ ingredientId: id })) },
      allergens: { create: data.allergenIds.map((id) => ({ allergenId: id, status: "CONTAINS" })) },
    },
  });
  return NextResponse.json({ id: product.id });
}