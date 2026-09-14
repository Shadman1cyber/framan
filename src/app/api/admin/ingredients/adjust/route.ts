import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { prisma } from "@/lib/db";
import { adjustInventory } from "@/lib/business/inventory";
import { OrderError } from "@/lib/orders";

const schema = z.object({
  ingredientId: z.string().min(1),
  delta: z.number().finite().refine(v => v !== 0, "delta must be non-zero"),
  reason: z.string().trim().min(3).max(300),
  allowNegativeDelta: z.boolean().optional(),
});

/** Additive stock adjustment (before/after/delta audited), shared with the agent. */
export async function POST(req: Request) {
  const g = await guard("ingredients.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 });
  try {
    const { receipt } = await prisma.$transaction(tx => adjustInventory(tx, parsed.data));
    return NextResponse.json({ ok: true, receipt });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
