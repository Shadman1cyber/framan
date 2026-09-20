import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOrder, OrderError } from "@/lib/orders";
import { invalidateOrdersCache } from "@/lib/cache";
import { z } from "zod";
import { normalizeRole } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { readCookie, TABLE_SESSION_COOKIE, verifyTableSession } from "@/lib/table-session";

const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        coffeeLineId: z.string().nullable().optional(),
      }),
    )
    .min(1),
  qrCodeId: z.string().nullable().optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 });
    }
    const session = await getServerSession(authOptions);
    const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
    // Rule 7: management accounts do not use the customer shopping flow.
    if (role === "CASHIER" || role === "OWNER") {
      return NextResponse.json(
        { error: "حساب‌های مدیریتی نمی‌توانند سفارش مشتری ثبت کنند" },
        { status: 403 },
      );
    }

    // Table orders require a valid table session for THAT table, obtained by
    // scanning the table's own (unguessable) QR code.
    if (parsed.data.qrCodeId) {
      const qr = await prisma.qRCode.findFirst({
        where: { OR: [{ id: parsed.data.qrCodeId }, { code: parsed.data.qrCodeId }] },
        select: { tableId: true },
      });
      if (qr?.tableId) {
        const cookieValue = readCookie(req, TABLE_SESSION_COOKIE);
        if (!verifyTableSession(cookieValue, qr.tableId)) {
          return NextResponse.json(
            { error: "سفارش برای این میز فقط با اسکن کد QR همان میز امکان‌پذیر است" },
            { status: 403 },
          );
        }
      }
    }

    const userId = session?.user ? (session.user as { id?: string }).id : undefined;
    const order = await createOrder({ ...parsed.data, userId });
    await invalidateOrdersCache();
    return NextResponse.json({ order });
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
