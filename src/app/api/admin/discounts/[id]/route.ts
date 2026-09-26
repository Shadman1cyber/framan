import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { normalizeDiscountCode } from "@/lib/discounts";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
    type: z.enum(["PERCENT", "FIXED"]).optional(),
    value: z.number().int().positive().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    minOrderAmount: z.number().int().min(0).optional(),
    maxDiscount: z.number().int().positive().nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    /** Soft-delete: archive instead of destroying redemption history. */
    archived: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "PERCENT" && val.value != null && val.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد" });
    }
    if (val.startsAt && val.endsAt && val.endsAt <= val.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد" });
    }
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("discounts.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" },
      { status: 400 },
    );
  }
  const { archived, code, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (code !== undefined) data.code = normalizeDiscountCode(code);
  if (archived !== undefined) {
    data.archivedAt = archived ? new Date() : null;
    if (archived) data.isActive = false;
  }
  try {
    const updated = await prisma.discountCode.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true, id: updated.id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "این کد تخفیف قبلا ثبت شده است", code: "DUPLICATE" }, { status: 409 });
    }
    if ((e as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "کد تخفیف یافت نشد" }, { status: 404 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("discounts.manage");
  if ("res" in g) return g.res;
  // Archive — redemptions must keep referencing the code for reporting.
  try {
    await prisma.discountCode.update({
      where: { id: params.id },
      data: { archivedAt: new Date(), isActive: false },
    });
    return NextResponse.json({ ok: true, archived: true });
  } catch {
    return NextResponse.json({ error: "کد تخفیف یافت نشد" }, { status: 404 });
  }
}
