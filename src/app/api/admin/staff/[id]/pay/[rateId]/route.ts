import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { validatePayInput, PayError } from "@/lib/staff-pay";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const schema = z.object({
  payType: z.enum(["MONTHLY", "HOURLY"]).optional(),
  amount: z.number().int().positive().optional(),
  effectiveAt: z.coerce.date().optional(),
  note: z.string().max(200).nullable().optional(),
});

/**
 * Only FUTURE-dated rates may be edited or deleted, so past payroll periods
 * are immutable (append-only history guarantee).
 */
type EditableRate = { rate: NonNullable<Awaited<ReturnType<typeof prisma.staffPayRate.findUnique>>> };

async function loadEditable(rateId: string): Promise<EditableRate | { error: string }> {
  const rate = await prisma.staffPayRate.findUnique({ where: { id: rateId } });
  if (!rate) return { error: "ثبت حقوق یافت نشد" };
  if (rate.effectiveAt <= new Date()) {
    return { error: "فقط ثبت‌های آینده قابل ویرایش یا حذف هستند؛ تاریخ گذشته محفوظ می‌ماند" };
  }
  return { rate };
}

export async function PATCH(req: Request, { params }: { params: { rateId: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const found = await loadEditable(params.rateId);
  if ("error" in found) {
    const loadError: string = found.error;
    return NextResponse.json({ error: loadError }, { status: loadError.startsWith("ثبت") ? 404 : 409 });
  }
  const existing = found.rate;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 });
  try {
    const payType = parsed.data.payType ?? existing.payType;
    const amount = parsed.data.amount ?? existing.amount;
    const effectiveAt = parsed.data.effectiveAt ?? existing.effectiveAt;
    const value = validatePayInput({ payType, amount, effectiveAt });
    const rate = await prisma.staffPayRate.update({
      where: { id: params.rateId },
      data: {
        payType: value.payType,
        amount: value.amount,
        effectiveAt: value.effectiveAt,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      },
    });
    return NextResponse.json({ ok: true, rate }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof PayError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { rateId: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const found = await loadEditable(params.rateId);
  if ("error" in found) {
    const loadError: string = found.error;
    return NextResponse.json({ error: loadError }, { status: loadError.startsWith("ثبت") ? 404 : 409 });
  }
  await prisma.staffPayRate.delete({ where: { id: params.rateId } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
