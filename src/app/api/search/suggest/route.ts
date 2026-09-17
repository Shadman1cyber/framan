import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Suggestion = {
  type: "product" | "category" | "ingredient";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  image: string | null;
  price: number | null;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  }

  const term = `%${q}%`;

  const [products, categories, ingredients] = await Promise.all([
    prisma.product.findMany({
      where: {
        OR: [
          { nameFa: { contains: q } },
          { nameEn: { contains: q } },
          { slug: { contains: q } },
        ],
        isAvailable: true,
      },
      select: { id: true, slug: true, nameFa: true, nameEn: true, price: true, image: true, categoryId: true },
      take: 5,
    }),
    prisma.category.findMany({
      where: {
        OR: [
          { nameFa: { contains: q } },
          { nameEn: { contains: q } },
          { slug: { contains: q } },
        ],
        isActive: true,
      },
      select: { id: true, slug: true, nameFa: true, nameEn: true, icon: true },
      take: 3,
    }),
    prisma.ingredient.findMany({
      where: {
        OR: [
          { nameFa: { contains: q } },
          { nameEn: { contains: q } },
        ],
        isActive: true,
      },
      select: { id: true, nameFa: true, nameEn: true, isAllergen: true },
      take: 3,
    }),
  ]);

  const suggestions: Suggestion[] = [
    ...products.map((p) => ({
      type: "product" as const,
      id: p.id,
      title: p.nameFa,
      subtitle: p.nameEn ?? null,
      href: `/product/${p.slug}`,
      image: p.image,
      price: p.price,
    })),
    ...categories.map((c) => ({
      type: "category" as const,
      id: c.id,
      title: c.nameFa,
      subtitle: c.nameEn ?? null,
      href: `/?category=${c.slug}`,
      image: null,
      price: null,
    })),
    ...ingredients.map((i) => ({
      type: "ingredient" as const,
      id: i.id,
      title: i.nameFa,
      subtitle: i.nameEn ?? null,
      href: `/?ingredient=${i.id}`,
      image: null,
      price: null,
    })),
  ];

  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}