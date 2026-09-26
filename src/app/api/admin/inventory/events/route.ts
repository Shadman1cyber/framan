import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { guard } from "@/lib/api";
import { prisma } from "@/lib/db";
import { recordInventoryAction } from "@/lib/business/inventory-flow";
import { OrderError } from "@/lib/orders";

const schema = z.object({
  ingredientId: z.string().min(1),
  kind: z.enum(["PURCHASE", "WASTE", "CORRECTION"]),
  quantity: z.number().finite(),
  reason: z.string().trim().min(3).max(300),
  operationKey: z.string().uuid(),
  expiresAt: z.string().datetime().nullable().optional(),
  supplier: z.string().trim().max(120).nullable().optional(),
  costPerPurchaseUnit: z.number().finite().nonnegative().nullable().optional(),
});

export async function POST(req: Request) {
  const g = await guard("ingredients.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 });
  try {
    const event = await prisma.$transaction((tx) => recordInventoryAction(tx, {
      ...parsed.data,
      actorId: g.user.id,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "موجودی هم‌زمان تغییر کرد؛ دوباره تلاش کنید" }, { status: 409 });
    }
    return NextResponse.json({ error: "خطای ثبت عملیات" }, { status: 500 });
  }
}
