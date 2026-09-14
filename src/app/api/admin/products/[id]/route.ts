import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { productSchema } from "@/lib/product-schema";
import { deleteImageByUrl } from "@/lib/storage";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
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
  const existing = await prisma.product.findUnique({
    where: { id: params.id },
    include: { images: true },
  });
  if (!existing) return NextResponse.json({ error: "محصول یافت نشد" }, { status: 404 });

  const oldImageUrls = existing.images.map((i) => i.url);
  const newImageUrls = (data.images ?? []).map((i) => i.url);
  const primaryUrl =
    data.images?.find((i) => i.isPrimary)?.url ?? data.images?.[0]?.url ?? (data.image || null);

  const slug = data.slug?.trim() ? slugify(data.slug) : existing.slug;

  await prisma.$transaction(async (tx) => {
    await tx.productIngredient.deleteMany({ where: { productId: params.id } });
    await tx.productAllergen.deleteMany({ where: { productId: params.id } });
    await tx.productImage.deleteMany({ where: { productId: params.id } });
    await tx.productCoffeeLine.deleteMany({ where: { productId: params.id } });
    await tx.product.update({
      where: { id: params.id },
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
  });

  // Clean up removed image files (best effort).
  for (const url of oldImageUrls) {
    if (!newImageUrls.includes(url)) await deleteImageByUrl(url);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("products.manage");
  if ("res" in g) return g.res;
  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: { images: true },
    });
    if (!product) return NextResponse.json({ error: "محصول یافت نشد" }, { status: 404 });
    await prisma.product.delete({ where: { id: params.id } });
    for (const img of product.images) await deleteImageByUrl(img.url);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "محصول قابل حذف نیست" }, { status: 400 });
  }
}
