import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export const dynamic = "force-dynamic";

type MobileRecord = {
  id: string;
  title: string;
  subtitle: string;
  value?: string;
  status?: string;
  action?: string;
  enabled?: boolean;
};

export async function GET() {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;

  const [products, categories, ingredients, allergens, customers, tables, reservations, staff, leaves, ratings, users, qrCodes, settings] = await Promise.all([
    prisma.product.findMany({ orderBy: { order: "asc" }, include: { category: true }, take: 150 }),
    prisma.category.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { products: true } } } }),
    prisma.ingredient.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" }, include: { _count: { select: { products: true } } } }),
    prisma.user.findMany({ where: { role: "CUSTOMER" }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.cafeTable.findMany({ orderBy: { number: "asc" }, include: { branch: true } }),
    prisma.tableReservation.findMany({ orderBy: { reservedAt: "desc" }, include: { table: true }, take: 100 }),
    prisma.staff.findMany({ orderBy: { name: "asc" } }),
    prisma.staffLeave.findMany({ orderBy: { createdAt: "desc" }, include: { staff: { select: { name: true } } }, take: 100 }),
    prisma.rating.findMany({ orderBy: { createdAt: "desc" }, include: { product: true, user: true }, take: 100 }),
    prisma.user.findMany({ where: { role: { in: ["CASHIER", "OWNER"] } }, orderBy: { name: "asc" } }),
    prisma.qRCode.findMany({ orderBy: { createdAt: "desc" }, include: { table: true, branch: true } }),
    prisma.setting.findMany({ orderBy: { key: "asc" } }),
  ]);

  const modules: Record<string, MobileRecord[]> = {
    products: products.map((x) => ({
      id: x.id, title: x.nameFa, subtitle: x.category.nameFa,
      value: `${x.price.toLocaleString("fa-IR")} تومان`, status: x.isAvailable ? "فعال" : "ناموجود",
      action: "productAvailability", enabled: x.isAvailable,
    })),
    categories: categories.map((x) => ({
      id: x.id, title: x.nameFa, subtitle: `${x._count.products.toLocaleString("fa-IR")} محصول`,
      status: x.isActive ? "فعال" : "غیرفعال", action: "categoryActive", enabled: x.isActive,
    })),
    ingredients: ingredients.map((x) => {
      const low = x.minQuantity != null && x.stockQuantity <= x.minQuantity;
      return {
        id: x.id, title: x.nameFa, subtitle: x.supplier || "بدون تأمین‌کننده",
        value: `${x.stockQuantity.toLocaleString("fa-IR")} ${x.unit}`,
        status: low ? "رو به اتمام" : "موجود", action: "ingredientAdjust", enabled: !low,
      };
    }),
    allergens: allergens.map((x) => ({
      id: x.id, title: x.nameFa, subtitle: x.nameEn, value: `${x._count.products.toLocaleString("fa-IR")} محصول`, status: "ثبت‌شده",
    })),
    customers: customers.map((x) => ({
      id: x.id, title: x.name || "مشتری", subtitle: x.phone || x.email || "بدون اطلاعات تماس", status: "مشتری",
    })),
    tables: tables.map((x) => ({
      id: x.id, title: x.label || `میز ${x.number}`, subtitle: x.branch.nameFa,
      status: x.isOccupied ? "اشغال" : "آزاد", action: "tableOccupied", enabled: x.isOccupied,
    })),
    reservations: reservations.map((x) => ({
      id: x.id, title: x.customerName, subtitle: `${x.table.label || `میز ${x.table.number}`} • ${x.guests.toLocaleString("fa-IR")} نفر`,
      value: x.reservedAt.toISOString(), status: x.status, action: "reservationStatus", enabled: x.status === "RESERVED",
    })),
    staff: staff.map((x) => ({
      id: x.id, title: x.name, subtitle: x.role, status: x.isActive ? "فعال" : "غیرفعال",
      action: "staffActive", enabled: x.isActive,
    })),
    leaves: leaves.map((x) => ({
      id: x.id, title: x.staff.name,
      subtitle: `${x.type === "INSTANT" ? "فوری" : "قبلی"} • ${x.from.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })} تا ${x.to.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}`,
      ...(x.reason ? { value: x.reason } : {}),
      status: x.status, action: "leaveStatus", enabled: x.status === "PENDING",
    })),
    ratings: ratings.map((x) => ({
      id: x.id, title: x.product.nameFa, subtitle: x.user.name || "مشتری",
      value: `${x.rating.toLocaleString("fa-IR")} از ۵`, status: x.review || "بدون متن", action: "ratingDelete",
    })),
    finance: [
      { id: "analytics", title: "داشبورد مالی", subtitle: "درآمد، سفارش و میانگین سبد", status: "زنده" },
      { id: "sales-flow", title: "جریان فروش", subtitle: "الگوی ساعتی فروش کافه", status: "امروز" },
    ],
    cashier: users.map((x) => ({
      id: x.id, title: x.name || x.email || "کاربر", subtitle: x.email || "بدون ایمیل", status: x.role,
      action: "userRole", enabled: x.role === "CASHIER",
    })),
    qr: qrCodes.map((x) => ({
      id: x.id, title: x.label || x.code, subtitle: x.table?.label || x.branch.nameFa,
      status: x.isActive ? "فعال" : "غیرفعال", action: "qrActive", enabled: x.isActive,
    })),
    settings: settings.map((x) => ({ id: x.key, title: x.key, subtitle: x.value, status: "تنظیم‌شده" })),
  };

  return NextResponse.json({ modules, updatedAt: new Date().toISOString() });
}

const actionSchema = z.object({
  action: z.enum([
    "productAvailability", "categoryActive", "ingredientAdjust", "staffActive",
    "tableOccupied", "reservationStatus", "ratingDelete", "userRole", "qrActive",
    "leaveStatus",
  ]),
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  amount: z.number().finite().optional(),
  status: z.enum(["RESERVED", "SEATED", "CANCELLED", "NO_SHOW", "APPROVED", "REJECTED"]).optional(),
});

export async function POST(req: Request) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400 });
  const { action, id, enabled, amount, status } = parsed.data;

  switch (action) {
    case "productAvailability":
      await prisma.product.update({ where: { id }, data: { isAvailable: enabled ?? false } });
      break;
    case "categoryActive":
      await prisma.category.update({ where: { id }, data: { isActive: enabled ?? false } });
      break;
    case "ingredientAdjust":
      await prisma.ingredient.update({ where: { id }, data: { stockQuantity: { increment: amount ?? 0 } } });
      break;
    case "staffActive":
      await prisma.staff.update({ where: { id }, data: { isActive: enabled ?? false } });
      break;
    case "tableOccupied":
      await prisma.cafeTable.update({ where: { id }, data: { isOccupied: enabled ?? false, occupiedAt: enabled ? new Date() : null } });
      break;
    case "reservationStatus":
      await prisma.tableReservation.update({ where: { id }, data: { status: status ?? "RESERVED" } });
      break;
    case "leaveStatus":
      if (status !== "APPROVED" && status !== "REJECTED") {
        return NextResponse.json({ error: "وضعیت مرخصی نامعتبر است" }, { status: 400 });
      }
      try {
        await prisma.staffLeave.update({ where: { id }, data: { status } });
      } catch {
        return NextResponse.json({ error: "مرخصی یافت نشد" }, { status: 404 });
      }
      break;
    case "ratingDelete":
      await prisma.rating.delete({ where: { id } });
      break;
    case "userRole":
      await prisma.user.update({ where: { id }, data: { role: enabled ? "CASHIER" : "CUSTOMER" } });
      break;
    case "qrActive":
      await prisma.qRCode.update({ where: { id }, data: { isActive: enabled ?? false } });
      break;
  }
  return NextResponse.json({ ok: true });
}
