import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/guards";
import { quoteDiscount, DiscountError } from "@/lib/discounts";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(1).max(64),
  subtotal: z.number().int().positive(),
});

/**
 * Read-only discount preview for checkout. Never mutates usage counts —
 * the real redemption happens atomically inside order creation.
 */
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر است", code: "INVALID_INPUT" }, { status: 400 });
    }
    const user = await getSessionUser();
    const quote = await quoteDiscount({
      code: parsed.data.code,
      subtotal: parsed.data.subtotal,
      userId: user?.id ?? null,
    });
    return NextResponse.json({ ok: true, quote }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof DiscountError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
