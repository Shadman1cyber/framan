import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "@/lib/offline/server";

const schema = z.object({
  isActive: z.boolean().optional(),
  label: z.string().max(60).optional().nullable(),
  isOccupied: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("tables.manage", "tables");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  if (req.headers.has("x-farman-mutation-id") && (parsed.data.isActive != null || parsed.data.label !== undefined)) {
    return NextResponse.json({ error: "تغییرات ساختاری میز باید آنلاین انجام شوند" }, { status: 400 });
  }
  if (g.user.role === "CASHIER" && (parsed.data.isActive != null || parsed.data.label !== undefined)) {
    return NextResponse.json({ error: "صندوق‌دار فقط می‌تواند وضعیت اشغال میز را تغییر دهد" }, { status: 403 });
  }

  const data: { isActive?: boolean; label?: string | null; isOccupied?: boolean; occupiedAt?: Date | null } = {
    ...parsed.data,
  };
  if (parsed.data.isOccupied != null) {
    data.occupiedAt = parsed.data.isOccupied ? new Date() : null;
  }
  try {
    const receipt = await runIdempotentOfflineMutation(req, g.user.id, { id: params.id, ...parsed.data }, async (tx) => {
      await tx.cafeTable.update({ where: { id: params.id }, data });
      return { body: { ok: true } };
    });
    return NextResponse.json(receipt.body, {
      status: receipt.status,
      headers: { "X-Farman-Replayed": receipt.replayed ? "1" : "0" },
    });
  } catch (error) {
    if (error instanceof OfflineMutationConflict) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "به‌روزرسانی میز انجام نشد" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("tables.manage", "tables");
  if ("res" in g) return g.res;
  if (g.user.role !== "OWNER") return NextResponse.json({ error: "فقط صاحب کافه می‌تواند میز را حذف کند" }, { status: 403 });
  await prisma.cafeTable.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
