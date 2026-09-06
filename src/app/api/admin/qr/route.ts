import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";

const schema = z.object({
  code: z.string().min(1).max(60),
  label: z.string().max(60).optional().nullable(),
  tableNumber: z.string().max(20).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin((session?.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const exists = await prisma.qRCode.findUnique({ where: { code: parsed.data.code } });
  if (exists) return NextResponse.json({ error: "این کد قبلاً استفاده شده" }, { status: 400 });

  const branch = await prisma.branch.findFirst({ where: { isActive: true } });
  if (!branch) return NextResponse.json({ error: "شعبه‌ای تعریف نشده است" }, { status: 400 });

  let tableId: string | null = null;
  if (parsed.data.tableNumber) {
    const table = await prisma.cafeTable.findFirst({
      where: { branchId: branch.id, number: parsed.data.tableNumber },
    });
    if (!table) return NextResponse.json({ error: "میز با این شماره یافت نشد" }, { status: 400 });
    tableId = table.id;
  }

  const qr = await prisma.qRCode.create({
    data: {
      code: parsed.data.code,
      label: parsed.data.label ?? null,
      branchId: branch.id,
      tableId,
      isActive: true,
    },
  });
  return NextResponse.json({ id: qr.id });
}