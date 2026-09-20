import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { nextCursorAfter } from "@/lib/ledger/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const scope = process.env.AGENT_CAFE_ID;
  const cafes = await prisma.cafe.findMany({ select: { id: true }, take: 2 });
  if (!scope || cafes.length !== 1 || cafes[0].id !== scope) {
    return NextResponse.json(
      { error: "پیکربندی کافه ناقص است", code: "SINGLE_CAFE_SCOPE_REQUIRED" },
      { status: 403 },
    );
  }
  const [cursor, entryCount, movementCount, last] = await Promise.all([
    nextCursorAfter(prisma, scope),
    prisma.ledgerEntry.count({ where: { scopeId: scope } }),
    prisma.stockMovement.count({ where: { scopeId: scope } }),
    prisma.ledgerEntry.findFirst({
      where: { scopeId: scope },
      orderBy: { serverSequence: "desc" },
      select: { serverReceivedAt: true },
    }),
  ]);
  return NextResponse.json({
    scope,
    cursor,
    entry_count: entryCount,
    movement_count: movementCount,
    last_applied_at: last?.serverReceivedAt?.toISOString() ?? null,
    server_time: new Date().toISOString(),
  });
}
