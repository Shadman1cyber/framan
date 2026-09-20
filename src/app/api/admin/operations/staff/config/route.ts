import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { getLeaveDeadlineHours } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  return NextResponse.json({ deadlineH: await getLeaveDeadlineHours() });
}

const schema = z.object({ deadlineH: z.number().min(0).max(720) });

export async function PUT(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  await prisma.setting.upsert({
    where: { key: "leave_advance_deadline_h" },
    create: { key: "leave_advance_deadline_h", value: String(parsed.data.deadlineH) },
    update: { value: String(parsed.data.deadlineH) },
  });
  return NextResponse.json({ ok: true, deadlineH: parsed.data.deadlineH });
}
