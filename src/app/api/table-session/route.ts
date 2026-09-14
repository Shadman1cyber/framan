import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createTableSessionValue,
  TABLE_SESSION_COOKIE,
  TABLE_SESSION_TTL_MS,
} from "@/lib/table-session";

export const dynamic = "force-dynamic";

const schema = z.object({ qrCode: z.string().min(1).max(80) });

/**
 * Called when a guest opens a table QR link.
 * - issues a signed, HttpOnly table session cookie (bounds ordering to THIS table)
 * - marks the table occupied automatically
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });

  const qr = await prisma.qRCode.findFirst({
    where: { OR: [{ id: parsed.data.qrCode }, { code: parsed.data.qrCode }] },
    include: { table: true },
  });
  if (!qr || !qr.isActive) {
    return NextResponse.json({ error: "کد QR معتبر نیست" }, { status: 400 });
  }
  if (qr.expiresAt && qr.expiresAt < new Date()) {
    return NextResponse.json({ error: "کد QR منقضی شده است" }, { status: 400 });
  }

  const res = NextResponse.json({
    ok: true,
    tableId: qr.tableId,
    tableLabel: qr.table?.label ?? qr.table?.number ?? null,
  });

  if (qr.tableId) {
    // Auto-occupy the table on scan.
    await prisma.cafeTable.update({
      where: { id: qr.tableId },
      data: { isOccupied: true, occupiedAt: new Date() },
    });
    // Signed session binding this browser to this table.
    res.cookies.set(TABLE_SESSION_COOKIE, createTableSessionValue(qr.tableId, qr.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: TABLE_SESSION_TTL_MS / 1000,
    });
  }

  return res;
}
