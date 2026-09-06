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

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin((session.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const data = parsed.data;
  await prisma.$transaction([
    prisma.productIngredient.deleteMany({ where: { productId: params.id } }),
    prisma.productAllergen.deleteMany({ where: { productId: params.id } }),
    prisma.product.update({
      where: { id: params.id },
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
    }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin((session.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await prisma.product.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "محصول قابل حذف نیست" }, { status: 400 });
  }
}