import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("allergens.manage");
  if ("res" in g) return g.res;
  try {
    await prisma.allergen.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "قابل حذف نیست" }, { status: 400 });
  }
}
