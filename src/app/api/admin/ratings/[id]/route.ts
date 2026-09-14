import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("ratings.moderate");
  if ("res" in g) return g.res;
  await prisma.rating.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
