import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  preferences: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  dietaryTagIds: z.array(z.string()).optional(),
});

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id!;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const ops = [];
  if (parsed.data.preferences) {
    ops.push(prisma.userPreference.deleteMany({ where: { userId } }));
    for (const p of parsed.data.preferences) {
      ops.push(
        prisma.userPreference.create({ data: { userId, key: p.key, value: p.value } }),
      );
    }
  }
  if (parsed.data.dietaryTagIds) {
    ops.push(prisma.userDietaryTag.deleteMany({ where: { userId } }));
    if (parsed.data.dietaryTagIds.length) {
      ops.push(
        prisma.userDietaryTag.createMany({
          data: parsed.data.dietaryTagIds.map((id) => ({ userId, dietaryTagId: id })),
        }),
      );
    }
  }
  if (ops.length) await prisma.$transaction(ops);
  return NextResponse.json({ ok: true });
}