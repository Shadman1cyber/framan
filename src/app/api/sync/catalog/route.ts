import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/**
 * Versioned reference-data snapshot for offline-first clients (Android app,
 * PWA). Server-authoritative: clients replace their local snapshot whenever
 * `version` changes and never edit these rows offline. Requires the same
 * OWNER-level `finance.view` permission as the other sync endpoints (OWNER
 * holds every permission, so one check covers the whole snapshot).
 */
export async function GET() {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const scope = process.env.AGENT_CAFE_ID;
  const cafes = await prisma.cafe.findMany({ select: { id: true }, take: 2 });
  if (!scope || cafes.length !== 1 || cafes[0].id !== scope) {
    return NextResponse.json(
      { error: "پیکربندی کافه ناقص است", code: "SINGLE_CAFE_SCOPE_REQUIRED" },
      { status: 403 },
    );
  }

  const [categories, products, ingredients, coffeeLines, staff, tables] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" }, take: MAX_ROWS }),
    prisma.product.findMany({
      orderBy: { order: "asc" },
      take: MAX_ROWS,
      include: {
        coffeeLines: {
          include: { coffeeLine: { select: { id: true, nameFa: true, nameEn: true } } },
        },
      },
    }),
    prisma.ingredient.findMany({ orderBy: { nameFa: "asc" }, take: MAX_ROWS }),
    prisma.coffeeLine.findMany({ take: MAX_ROWS }),
    prisma.staff.findMany({ where: { isActive: true }, take: MAX_ROWS }),
    prisma.cafeTable.findMany({ where: { isActive: true }, take: MAX_ROWS }),
  ]);

  const version = Math.max(
    0,
    ...categories.map((c) => c.updatedAt.getTime()),
    ...products.map((p) => p.updatedAt.getTime()),
    ...ingredients.map((i) => i.updatedAt.getTime()),
    ...coffeeLines.map((c) => c.updatedAt.getTime()),
    ...staff.map((s) => s.updatedAt.getTime()),
    ...tables.map((t) => t.updatedAt.getTime()),
  );

  return NextResponse.json({
    version,
    server_time: new Date().toISOString(),
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name_fa: c.nameFa,
      name_en: c.nameEn,
      icon: c.icon,
      is_active: c.isActive,
      sort_order: c.order,
    })),
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name_fa: p.nameFa,
      name_en: p.nameEn,
      description: p.description,
      price: p.price,
      image: p.image,
      category_id: p.categoryId,
      is_available: p.isAvailable,
      is_featured: p.isFeatured,
      sort_order: p.order,
      allergen_status: p.allergenStatus,
      prep_base_min: p.prepBaseMin,
      updated_at: p.updatedAt.toISOString(),
      coffee_lines: p.coffeeLines.map((cl) => ({
        coffee_line_id: cl.coffeeLineId,
        name_fa: cl.coffeeLine.nameFa,
        name_en: cl.coffeeLine.nameEn,
        price: cl.price,
        is_active: cl.isActive,
      })),
    })),
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name_fa: i.nameFa,
      name_en: i.nameEn,
      unit: i.unit,
      stock_quantity: i.stockQuantity,
      min_quantity: i.minQuantity,
      cost_per_unit: i.costPerUnit,
      supplier: i.supplier,
      is_active: i.isActive,
      updated_at: i.updatedAt.toISOString(),
    })),
    coffee_lines: coffeeLines.map((c) => ({
      id: c.id,
      name_fa: c.nameFa,
      name_en: c.nameEn,
      is_active: c.isActive,
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role })),
    tables: tables.map((t) => ({
      id: t.id,
      branch_id: t.branchId,
      number: t.number,
      label: t.label,
      is_occupied: t.isOccupied,
    })),
  });
}
