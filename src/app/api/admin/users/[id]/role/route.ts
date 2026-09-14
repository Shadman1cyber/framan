import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { ROLES } from "@/lib/constants";

const schema = z.object({ role: z.enum([ROLES.CUSTOMER, ROLES.CASHIER, ROLES.OWNER]) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("users.manage");
  if ("res" in g) return g.res;
  const sessionUserId = g.user.id;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (user.id === sessionUserId && parsed.data.role !== "OWNER") {
    return NextResponse.json({ error: "نمی‌توانید نقش خود را تغییر دهید" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: params.id }, data: { role: parsed.data.role } });
  return NextResponse.json({ ok: true });
}
