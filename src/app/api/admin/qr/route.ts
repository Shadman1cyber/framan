import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { generateQrCode } from "@/lib/table-session";

const schema = z.object({
  code: z.string().max(60).optional().nullable(), // ignored: generated server-side
  label: z.string().max(60).optional().nullable(),
  tableNumber: z.string().max(20).optional().nullable(),
});

export async function POST(req: Request) {
  const g = await guard("qr.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

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

  // Codes are unguessable random tokens so guests cannot reach other tables'
  // URLs by typing them; only the printed QR reveals them.
  const prefix = tableId ? "t" : "m";
  const qr = await prisma.qRCode.create({
    data: {
      code: generateQrCode(prefix),
      label: parsed.data.label ?? null,
      branchId: branch.id,
      tableId,
      isActive: true,
    },
  });
  return NextResponse.json({ id: qr.id, code: qr.code });
}
