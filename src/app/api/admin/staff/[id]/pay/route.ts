import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { validatePayInput, resolvePayRate, PayError, previewHourlyFromMonthly } from "@/lib/staff-pay";

export const dynamic = "force-dynamic";

const schema = z.object({
  payType: z.enum(["MONTHLY", "HOURLY"]),
  amount: z.number().int().positive(),
  effectiveAt: z.coerce.date().optional(),
  note: z.string().max(200).nullable().optional(),
});

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Current pay rate + full append-only history for one staff member. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;

  const staff = await prisma.staff.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!staff) return NextResponse.json({ error: "عضو تیم یافت نشد" }, { status: 404 });

  const rates = await prisma.staffPayRate.findMany({
    where: { staffId: params.id },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
  const now = new Date();
  const current = resolvePayRate(rates, now);
  const editableIds = rates.filter((r) => r.effectiveAt > now).map((r) => r.id);

  return NextResponse.json(
    {
      staff,
      rates,
      current,
      editableIds,
      currentHourlyPreview:
        current && current.payType === "MONTHLY" ? previewHourlyFromMonthly(current.amount) : null,
    },
    { headers: NO_STORE },
  );
}

/** Append a new pay rate (history is never rewritten). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ورودی نامعتبر است" }, { status: 400 });
  }
  try {
    const value = validatePayInput({
      payType: parsed.data.payType,
      amount: parsed.data.amount,
      effectiveAt: parsed.data.effectiveAt,
    });
    const staff = await prisma.staff.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!staff) return NextResponse.json({ error: "عضو تیم یافت نشد" }, { status: 404 });
    const rate = await prisma.staffPayRate.create({
      data: {
        staffId: params.id,
        payType: value.payType,
        amount: value.amount,
        effectiveAt: value.effectiveAt,
        note: parsed.data.note ?? null,
        createdBy: g.user.id,
      },
    });
    return NextResponse.json({ ok: true, rate }, { status: 201, headers: NO_STORE });
  } catch (e) {
    if (e instanceof PayError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
