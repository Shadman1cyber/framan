import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({ allergenIds: z.array(z.string()) });

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id!;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  await prisma.$transaction([
    prisma.userAllergy.deleteMany({ where: { userId } }),
    prisma.userAllergy.createMany({
      data: parsed.data.allergenIds.map((id) => ({ userId, allergenId: id })),
    }),
  ]);
  return NextResponse.json({ ok: true });
}