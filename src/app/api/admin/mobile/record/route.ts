import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/guards";
import { todayGregorianInput } from "@/lib/jalali";
import { resolveStaffShift } from "@/lib/staff-shifts";

export const dynamic = "force-dynamic";

/**
 * Full editable record for the native (iOS/Android/desktop-shell) apps.
 * The overview feed carries display rows; this endpoint returns every field
 * the corresponding web form edits, so update sheets can round-trip without
 * guessing. OWNER-only modules stay OWNER-only here too (guard() per module).
 */
const MODULE_PERMISSION: Record<string, string> = {
  products: "products.manage",
  categories: "categories.manage",
  ingredients: "ingredients.manage",
  staff: "staff.manage",
  tables: "tables.manage",
  discounts: "discounts.manage",
};

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (user.role as string) === "ADMIN" ? "OWNER" : user.role;
  if (role !== "OWNER" && role !== "CASHIER") {
    return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  const url = new URL(req.url);
  const moduleKey = url.searchParams.get("module") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!moduleKey || !id) {
    return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400 });
  }
  const owner = role === "OWNER";
  // Cashiers may read operational tables data only; everything else is owner-only.
  if (!owner && moduleKey !== "tables") {
    return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  if (!(moduleKey in MODULE_PERMISSION)) {
    return NextResponse.json({ error: "ماژول نامعتبر است" }, { status: 400 });
  }

  try {
    switch (moduleKey) {
      case "products": {
        const p = await prisma.product.findUnique({
          where: { id },
          include: {
            category: { select: { id: true, nameFa: true } },
            ingredients: { select: { ingredientId: true, quantity: true, unit: true } },
            allergens: { select: { allergenId: true } },
            coffeeLines: { select: { coffeeLineId: true, price: true, isActive: true } },
            images: { select: { url: true, isPrimary: true } },
          },
        });
        if (!p) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
        return NextResponse.json({
          record: {
            id: p.id,
            nameFa: p.nameFa,
            nameEn: p.nameEn,
            description: p.description,
            price: p.price,
            categoryId: p.categoryId,
            categoryName: p.category.nameFa,
            isAvailable: p.isAvailable,
            isFeatured: p.isFeatured,
            allergenStatus: p.allergenStatus,
            prepBaseMin: p.prepBaseMin,
            image: p.image,
            images: p.images,
            ingredientIds: p.ingredients.map((i) => i.ingredientId),
            ingredientQuantities: p.ingredients,
            allergenIds: p.allergens.map((a) => a.allergenId),
            coffeeLines: p.coffeeLines,
          },
        });
      }
      case "categories": {
        const c = await prisma.category.findUnique({ where: { id } });
        if (!c) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
        return NextResponse.json({
          record: {
            id: c.id,
            nameFa: c.nameFa,
            nameEn: c.nameEn,
            icon: c.icon,
            description: c.description,
            order: c.order,
            isActive: c.isActive,
          },
        });
      }
      case "ingredients": {
        const g = await prisma.ingredient.findUnique({ where: { id } });
        if (!g) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
        return NextResponse.json({
          record: {
            id: g.id,
            nameFa: g.nameFa,
            nameEn: g.nameEn,
            description: g.description,
            isAllergen: g.isAllergen,
            unit: g.unit,
            stockQuantity: g.stockQuantity,
            minQuantity: g.minQuantity,
            costPerUnit: g.costPerUnit,
            supplier: g.supplier,
            isActive: g.isActive,
          },
        });
      }
      case "staff": {
        const s = await prisma.staff.findUnique({
          where: { id },
          include: {
            shiftRotation: {
              include: { slots: { orderBy: { position: "asc" } } },
            },
          },
        });
        if (!s) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
        const today = todayGregorianInput();
        return NextResponse.json({
          record: {
            id: s.id,
            name: s.name,
            role: s.role,
            task: s.task,
            shiftStart: s.shiftStart,
            shiftEnd: s.shiftEnd,
            isActive: s.isActive,
            todayShift: resolveStaffShift(s.shiftStart, s.shiftEnd, s.shiftRotation, today),
            shiftRotation: s.shiftRotation
              ? {
                  id: s.shiftRotation.id,
                  isEnabled: s.shiftRotation.isEnabled,
                  startDate: s.shiftRotation.startDate,
                  slots: s.shiftRotation.slots.map((slot) => ({
                    id: slot.id,
                    position: slot.position,
                    label: slot.label,
                    shiftStart: slot.shiftStart,
                    shiftEnd: slot.shiftEnd,
                  })),
                }
              : null,
          },
        });
      }
      case "tables": {
        const t = await prisma.cafeTable.findUnique({
          where: { id },
          include: { branch: { select: { id: true, nameFa: true } } },
        });
        if (!t) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
        return NextResponse.json({
          record: {
            id: t.id,
            number: t.number,
            label: t.label,
            branchName: t.branch.nameFa,
            isActive: t.isActive,
            isOccupied: t.isOccupied,
          },
        });
      }
      case "discounts": {
        const d = await prisma.discountCode.findUnique({ where: { id } });
        if (!d) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
        return NextResponse.json({
          record: {
            id: d.id,
            code: d.code,
            type: d.type,
            value: d.value,
            startsAt: d.startsAt.toISOString(),
            endsAt: d.endsAt.toISOString(),
            minOrderAmount: d.minOrderAmount,
            maxDiscount: d.maxDiscount,
            usageLimit: d.usageLimit,
            perUserLimit: d.perUserLimit,
            isActive: d.isActive,
            archivedAt: d.archivedAt?.toISOString() ?? null,
            usedCount: d.usedCount,
          },
        });
      }
      default:
        return NextResponse.json({ error: "ماژول نامعتبر است" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
