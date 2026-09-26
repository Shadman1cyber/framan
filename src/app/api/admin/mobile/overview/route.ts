import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { getSessionUser } from "@/lib/guards";
import type { Permission } from "@/lib/constants";
import { adjustInventory } from "@/lib/business/inventory";
import { OrderError } from "@/lib/orders";

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

/** Action → required permission (owner has every permission). */
const ACTION_PERMISSIONS: Record<string, Permission> = {
  productAvailability: "products.manage",
  categoryActive: "categories.manage",
  ingredientAdjust: "ingredients.manage",
  staffActive: "staff.manage",
  tableOccupied: "tables.manage",
  reservationStatus: "tables.manage",
  ratingDelete: "ratings.moderate",
  userRole: "users.manage",
  qrActive: "qr.manage",
  leaveStatus: "staff.manage",
  discountActive: "discounts.manage",
  discountArchive: "discounts.manage",
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (user.role as string) === "ADMIN" ? "OWNER" : user.role;
  if (role !== "OWNER" && role !== "CASHIER") {
    return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  const owner = role === "OWNER";

  const permitted = new Set<string>();
  if (owner) {
    for (const k of [
      "products", "categories", "ingredients", "allergens", "customers", "tables",
      "reservations", "staff", "pay", "leaves", "ratings", "finance", "users", "qr",
      "settings", "discounts",
    ]) permitted.add(k);
  } else {
    for (const k of ["customers", "tables", "reservations", "leaves", "ratings", "qr"]) {
      permitted.add(k);
    }
  }
  // Cashier leave/rating actions are view-only (approval/delete stays on REST
  // where permissions are enforced per-endpoint).
  const ownerOnlyAction = (a?: string) => a != null && owner;

  const want = (key: string) => permitted.has(key);

  const [products, categories, ingredients, allergens, customers, tables, reservations, staff, payRates, leaves, ratings, users, qrCodes, settings, discounts] = await Promise.all([
    want("products")
      ? prisma.product.findMany({ orderBy: { order: "asc" }, include: { category: true }, take: 150 })
      : Promise.resolve([]),
    want("categories")
      ? prisma.category.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { products: true } } } })
      : Promise.resolve([]),
    want("ingredients") ? prisma.ingredient.findMany({ orderBy: { nameFa: "asc" } }) : Promise.resolve([]),
    want("allergens")
      ? prisma.allergen.findMany({ orderBy: { nameFa: "asc" }, include: { _count: { select: { products: true } } } })
      : Promise.resolve([]),
    want("customers")
      ? prisma.user.findMany({ where: { role: "CUSTOMER" }, orderBy: { updatedAt: "desc" }, take: 100,
          include: { preferences: { where: { key: "LOYALTY_POINTS" }, take: 1 }, _count: { select: { orders: true } } } })
      : Promise.resolve([]),
    want("tables") ? prisma.cafeTable.findMany({ orderBy: { number: "asc" }, include: { branch: true } }) : Promise.resolve([]),
    want("reservations")
      ? prisma.tableReservation.findMany({ orderBy: { reservedAt: "desc" }, include: { table: true }, take: 100 })
      : Promise.resolve([]),
    want("staff") ? prisma.staff.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    want("pay")
      ? prisma.staffPayRate.findMany({ orderBy: { effectiveAt: "desc" }, take: 200, include: { staff: { select: { name: true } } } })
      : Promise.resolve([]),
    want("leaves")
      ? prisma.staffLeave.findMany({ orderBy: { createdAt: "desc" }, include: { staff: { select: { name: true } } }, take: 100 })
      : Promise.resolve([]),
    want("ratings")
      ? prisma.rating.findMany({ orderBy: { createdAt: "desc" }, include: { product: true, user: true }, take: 100 })
      : Promise.resolve([]),
    want("users")
      ? prisma.user.findMany({ where: { role: { in: ["CASHIER", "OWNER"] } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    want("qr")
      ? prisma.qRCode.findMany({ orderBy: { createdAt: "desc" }, include: { table: true, branch: true } })
      : Promise.resolve([]),
    want("settings") ? prisma.setting.findMany({ orderBy: { key: "asc" } }) : Promise.resolve([]),
    want("discounts")
      ? prisma.discountCode.findMany({ orderBy: { createdAt: "desc" }, take: 150 })
      : Promise.resolve([]),
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
      id: x.id, title: x.nameFa, subtitle: x.nameEn,
      value: `${x._count.products.toLocaleString("fa-IR")} محصول`, status: "ثبت‌شده",
    })),
    customers: customers.map((x) => ({
      id: x.id, title: x.name || "مشتری", subtitle: `${x.phone || x.email || "بدون اطلاعات تماس"} • ${x._count.orders.toLocaleString("fa-IR")} سفارش`,
      value: `${(Number(x.preferences[0]?.value ?? 0) || 0).toLocaleString("fa-IR")} امتیاز`, status: "مشتری",
    })),
    tables: tables.map((x) => ({
      id: x.id, title: x.label || `میز ${x.number}`, subtitle: x.branch.nameFa,
      status: x.isOccupied ? "اشغال" : "آزاد", action: "tableOccupied", enabled: x.isOccupied,
    })),
    reservations: reservations.map((x) => ({
      id: x.id, title: x.customerName,
      subtitle: `${x.table.label || `میز ${x.table.number}`} • ${x.guests.toLocaleString("fa-IR")} نفر`,
      value: x.reservedAt.toISOString(), status: x.status, action: "reservationStatus",
      enabled: x.status === "RESERVED",
    })),
    staff: staff.map((x) => ({
      id: x.id, title: x.name, subtitle: x.role, status: x.isActive ? "فعال" : "غیرفعال",
      action: "staffActive", enabled: x.isActive,
    })),
    leaves: leaves.map((x) => ({
      id: x.id, title: x.staff.name,
      subtitle: `${x.type === "INSTANT" ? "فوری" : "قبلی"} • ${x.from.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })} تا ${x.to.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}`,
      ...(x.reason ? { value: x.reason } : {}),
      status: x.status,
      ...(ownerOnlyAction("leaveStatus") ? { action: "leaveStatus" as const } : {}),
      enabled: x.status === "PENDING",
    })),
    ratings: ratings.map((x) => ({
      id: x.id, title: x.product.nameFa, subtitle: x.user.name || "مشتری",
      value: `${x.rating.toLocaleString("fa-IR")} از ۵`, status: x.review || "بدون متن",
      ...(ownerOnlyAction("ratingDelete") ? { action: "ratingDelete" as const } : {}),
    })),
    finance: want("finance") ? [
      { id: "analytics", title: "داشبورد مالی", subtitle: "درآمد، سفارش و میانگین سبد", status: "زنده" },
      { id: "sales-flow", title: "جریان فروش", subtitle: "الگوی ساعتی فروش کافه", status: "امروز" },
    ] : [],
    users: users.map((x) => ({
      id: x.id, title: x.name || x.email || "کاربر", subtitle: x.email || "بدون ایمیل", status: x.role,
      action: "userRole", enabled: x.role === "CASHIER",
    })),
    qr: qrCodes.map((x) => ({
      id: x.id, title: x.label || x.code, subtitle: x.table?.label || x.branch.nameFa,
      value: x.code,
      status: x.isActive ? "فعال" : "غیرفعال", action: "qrActive", enabled: x.isActive,
    })),
    settings: settings.map((x) => ({ id: x.key, title: x.key, subtitle: x.value, status: "تنظیم‌شده" })),
    // Owner-managed discount codes with the same fields as the web form so the
    // native app can list, toggle and archive. Full create/edit goes through
    // /api/admin/discounts (same session auth).
    discounts: discounts.map((x) => {
      const now = new Date();
      const archived = x.archivedAt != null;
      const expired = now > x.endsAt;
      const exhausted = x.usageLimit != null && x.usedCount >= x.usageLimit;
      const status = archived ? "بایگانی" : expired ? "منقضی" : exhausted ? "تکمیل ظرفیت" : x.isActive ? "فعال" : "غیرفعال";
      const kind = x.type === "FIXED" ? `${x.value.toLocaleString("fa-IR")} تومان` : `${x.value.toLocaleString("fa-IR")}٪`;
      return {
        id: x.id,
        title: x.code,
        subtitle: `${kind} • ${x.startsAt.toLocaleDateString("fa-IR")} تا ${x.endsAt.toLocaleDateString("fa-IR")}`,
        value: x.usageLimit != null
          ? `${x.usedCount.toLocaleString("fa-IR")} از ${x.usageLimit.toLocaleString("fa-IR")}`
          : `${x.usedCount.toLocaleString("fa-IR")} استفاده`,
        status,
        action: "discountActive",
        enabled: x.isActive && !archived,
      };
    }),
    // Current pay rate per staff member (OWNER only, never cached publicly).
    // Detailed history + estimates live on /api/admin/staff/[id]/pay*.
    pay: (staff as Array<{ id: string; name: string; role: string }>).map((s) => {
      const current = (payRates as Array<{ staffId: string; payType: string; amount: number; effectiveAt: Date }>)
        .filter((r) => r.staffId === s.id && r.effectiveAt <= new Date())
        .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0];
      return {
        id: s.id,
        title: s.name,
        subtitle: s.role,
        value: current
          ? `${current.amount.toLocaleString("fa-IR")} تومان (${current.payType === "HOURLY" ? "ساعتی" : "ماهانه"})`
          : "تعریف نشده",
        status: current ? `از ${current.effectiveAt.toLocaleDateString("fa-IR")}` : "بدون نرخ",
      };
    }),
  };

  const filtered: Record<string, MobileRecord[]> = {};
  for (const key of Object.keys(modules)) {
    if (permitted.has(key)) filtered[key] = modules[key];
  }

  return NextResponse.json({
    modules: filtered,
    management: Array.from(permitted),
    role,
    updatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

const actionSchema = z.object({
  action: z.enum([
    "productAvailability", "categoryActive", "ingredientAdjust", "staffActive",
    "tableOccupied", "reservationStatus", "ratingDelete", "userRole", "qrActive",
    "leaveStatus", "discountActive", "discountArchive",
  ]),
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  amount: z.number().finite().optional(),
  status: z.enum(["RESERVED", "SEATED", "CANCELLED", "NO_SHOW", "APPROVED", "REJECTED"]).optional(),
});

export async function POST(req: Request) {
  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400 });
  const { action, id, enabled, amount, status } = parsed.data;

  // Per-action permission gate (owner holds every permission automatically).
  const g = await guard(ACTION_PERMISSIONS[action]);
  if ("res" in g) return g.res;

  switch (action) {
    case "productAvailability":
      await prisma.product.update({ where: { id }, data: { isAvailable: enabled ?? false } });
      break;
    case "categoryActive":
      await prisma.category.update({ where: { id }, data: { isActive: enabled ?? false } });
      break;
    case "ingredientAdjust":
      if (amount == null || amount === 0) return NextResponse.json({ error: "مقدار تغییر لازم است" }, { status: 400 });
      try {
        await prisma.$transaction((tx) => adjustInventory(tx, { ingredientId: id, delta: amount, reason: "اصلاح موجودی از اپ مدیریت", allowNegativeDelta: amount < 0 }));
      } catch (error) {
        if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: 400 });
        throw error;
      }
      break;
    case "staffActive":
      await prisma.staff.update({ where: { id }, data: { isActive: enabled ?? false } });
      break;
    case "tableOccupied":
      await prisma.cafeTable.update({
        where: { id },
        data: { isOccupied: enabled ?? false, occupiedAt: enabled ? new Date() : null },
      });
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
    case "discountActive":
      await prisma.discountCode.update({ where: { id }, data: { isActive: enabled ?? false } });
      break;
    case "discountArchive":
      await prisma.discountCode.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
      break;
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
