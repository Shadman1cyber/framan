import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

const schema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  try {
    await prisma.staffLeave.update({ where: { id: params.id }, data: { status: parsed.data.status } });
  } catch {
    return NextResponse.json({ error: "مرخصی یافت نشد" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
