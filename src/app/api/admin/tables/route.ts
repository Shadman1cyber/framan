import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";

const schema = z.object({
  number: z.string().min(1).max(20),
  label: z.string().max(60).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin((session?.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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