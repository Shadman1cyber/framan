import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";

const schema = z.object({ role: z.enum(["CUSTOMER", "STAFF", "ADMIN"]) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin((session?.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (user.id === sessionUserId && parsed.data.role !== "ADMIN") {
    return NextResponse.json({ error: "نمی‌توانید نقش خود را تغییر دهید" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: params.id }, data: { role: parsed.data.role } });
  return NextResponse.json({ ok: true });
}
