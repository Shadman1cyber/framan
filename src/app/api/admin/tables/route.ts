import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({
  number: z.string().min(1).max(20),
  label: z.string().max(60).optional().nullable(),
});

export async function POST(req: Request) {
  const g = await guard("tables.manage", "tables");
  if ("res" in g) return g.res;
  if (g.user.role !== "OWNER") return NextResponse.json({ error: "فقط صاحب کافه می‌تواند میز اضافه کند" }, { status: 403 });
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const branch = await prisma.branch.findFirst({ where: { isActive: true } });
  if (!branch) return NextResponse.json({ error: "شعبه‌ای تعریف نشده است" }, { status: 400 });

  const exists = await prisma.cafeTable.findFirst({
    where: { branchId: branch.id, number: parsed.data.number },
  });
  if (exists) return NextResponse.json({ error: "شماره میز تکراری است" }, { status: 400 });

  const table = await prisma.cafeTable.create({
    data: {
      branchId: branch.id,
      number: parsed.data.number,
      label: parsed.data.label ?? null,
      isActive: true,
    },
  });
  return NextResponse.json({ id: table.id });
}
