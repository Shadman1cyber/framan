import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { productSchema } from "@/lib/product-schema";
import { invalidateMenuCache } from "@/lib/cache";

export async function POST(req: Request) {
  const g = await guard("products.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ورودی نامعتبر", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Auto-generate slug and sort order; never require the admin to enter them.
  let slug = data.slug?.trim() ? slugify(data.slug) : slugify(data.nameFa);
  const clash = await prisma.product.findUnique({ where: { slug } });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const maxOrder = await prisma.product.aggregate({ _max: { order: true } });
  const order = data.order ?? (maxOrder._max.order ?? 0) + 1;

  const primaryUrl =
    data.images?.find((i) => i.isPrimary)?.url ?? data.images?.[0]?.url ?? (data.image || null);

  const product = await prisma.product.create({
    data: {
      slug,
      nameFa: data.nameFa,
      nameEn: data.nameEn ?? null,
      description: data.description,
      price: data.price,
      image: primaryUrl,
      categoryId: data.categoryId,
      isAvailable: data.isAvailable,
      isFeatured: data.isFeatured,
      order,
      prepBaseMin: data.prepBaseMin ?? 3,
      allergenStatus: data.allergenStatus,
      ingredients: {
        create: data.ingredientIds.map((id) => {
          const q = data.ingredientQuantities?.find((x) => x.ingredientId === id);
          return { ingredientId: id, quantity: q?.quantity ?? 0, unit: q?.unit ?? "GRAM" };
        }),
      },
      allergens: { create: data.allergenIds.map((id) => ({ allergenId: id })) },
      images: {
        create: (data.images ?? []).map((im, idx) => ({
          url: im.url,
          isPrimary: im.isPrimary ?? idx === 0,
          order: idx,
        })),
      },
      coffeeLines: {
        create: (data.coffeeLines ?? []).map((cl) => ({
          coffeeLineId: cl.coffeeLineId,
          price: cl.price,
          isActive: cl.isActive ?? true,
        })),
      },
    },
  });
  await invalidateMenuCache(product.id, product.slug);
  return NextResponse.json({ id: product.id });
}
