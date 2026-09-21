import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { STAFF_ROLES } from "@/lib/constants";

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(STAFF_ROLES),
  isActive: z.boolean().optional(),
  task: z.string().max(200).optional().nullable(),
  shiftStart: z.string().regex(HHMM, "ساعت شروع نامعتبر (HH:mm)").optional().nullable(),
  shiftEnd: z.string().regex(HHMM, "ساعت پایان نامعتبر (HH:mm)").optional().nullable(),
});

export async function GET() {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const staff = await prisma.staff.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ staff }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
}

export async function POST(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const member = await prisma.staff.create({ data: parsed.data });
  return NextResponse.json({ id: member.id });
}
