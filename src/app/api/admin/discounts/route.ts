import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { normalizeDiscountCode } from "@/lib/discounts";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "کد فقط شامل حروف انگلیسی، عدد، خط تیره و زیرخط است"),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    minOrderAmount: z.number().int().min(0).default(0),
    maxDiscount: z.number().int().positive().nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.type === "PERCENT" && val.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد" });
    }
    if (val.endsAt <= val.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "تاریخ پایان باید بعد از تاریخ شروع باشد" });
    }
  });

export async function GET() {
  const g = await guard("discounts.manage");
  if ("res" in g) return g.res;
  const discounts = await prisma.discountCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  return NextResponse.json(
    { discounts },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const g = await guard("discounts.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" },
      { status: 400 },
    );
  }
  const data = {
    ...parsed.data,
    code: normalizeDiscountCode(parsed.data.code),
    maxDiscount: parsed.data.maxDiscount ?? null,
    usageLimit: parsed.data.usageLimit ?? null,
    perUserLimit: parsed.data.perUserLimit ?? null,
  };
  try {
    const created = await prisma.discountCode.create({ data });
    return NextResponse.json({ id: created.id, code: created.code }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "این کد تخفیف قبلا ثبت شده است", code: "DUPLICATE" }, { status: 409 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
