import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { staffCreateSchema } from "@/lib/staff-api";

export async function GET() {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const staff = await prisma.staff.findMany({
    include: {
      shiftRotation: {
        include: { slots: { orderBy: { position: "asc" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ staff }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const parsed = staffCreateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const { rotation, ...data } = parsed.data;
  const member = await prisma.staff.create({
    data: {
      ...data,
      ...(rotation
        ? {
            shiftRotation: {
              create: {
                isEnabled: rotation.isEnabled,
                startDate: rotation.startDate,
                slots: { create: rotation.slots },
              },
            },
          }
        : {}),
    },
  });
  return NextResponse.json({ id: member.id });
}
