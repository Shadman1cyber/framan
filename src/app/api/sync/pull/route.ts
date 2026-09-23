import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { listLedger } from "@/lib/ledger/service";
import { listStockMovements } from "@/lib/stock/service";

export const dynamic = "force-dynamic";

async function scopeId(): Promise<string | null> {
  const scope = process.env.AGENT_CAFE_ID;
  const cafes = await prisma.cafe.findMany({ select: { id: true }, take: 2 });
  if (!scope || cafes.length !== 1 || cafes[0].id !== scope) return null;
  return scope;
}

export async function GET(req: NextRequest) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const scope = await scopeId();
  if (!scope) {
    return NextResponse.json(
      { error: "پیکربندی کافه ناقص است", code: "SINGLE_CAFE_SCOPE_REQUIRED" },
      { status: 403 },
    );
  }
  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") ?? "0");
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? "200"), 1), 500);
  const account = url.searchParams.get("account") ?? undefined;
  if (!Number.isSafeInteger(after) || after < 0) {
    return NextResponse.json(
      { error: "after نامعتبر است", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }
  // Over-fetch per kind then merge by the shared sequence so one cursor stays
  // totally ordered across ledger entries and stock movements.
  const [ledgerRows, stockRows] = await Promise.all([
    listLedger(prisma, scope, { take, afterSequence: after }),
    listStockMovements(prisma, scope, { take, afterSequence: after }),
  ]);
  // The account filter scopes ledger rows only; stock movements carry no
  // account and are omitted from account-filtered pulls.
  const ledgerOut = account ? ledgerRows.filter((r) => r.accountId === account) : ledgerRows;
  const stockOut = account ? [] : stockRows;
  const changes = [
    ...ledgerOut.map((r) => ({
      kind: "ledger_entry" as const,
      id: r.id,
      entry_type: r.entryType,
      reference_type: r.referenceType,
      reference_id: r.referenceId,
      account_id: r.accountId,
      amount: r.amount,
      currency: r.currency,
      occurred_at: r.occurredAt.toISOString(),
      device_id: r.deviceId,
      reversal_of: r.reversalOf,
      server_sequence: r.serverSequence,
      server_received_at: r.serverReceivedAt?.toISOString() ?? null,
    })),
    ...stockOut.map((m) => ({
      kind: "stock_movement" as const,
      id: m.id,
      ingredient_id: m.ingredientId,
      delta: m.delta,
      reason: m.reason,
      occurred_at: m.occurredAt.toISOString(),
      device_id: m.deviceId,
      server_sequence: m.serverSequence,
      server_received_at: m.serverReceivedAt?.toISOString() ?? null,
    })),
  ]
    .sort((a, b) => (a.server_sequence ?? 0) - (b.server_sequence ?? 0))
    .slice(0, take);
  // Merge is sorted by sequence and sliced to the lowest `take` rows, so any
  // row dropped by the slice has a higher sequence than the cursor: the next
  // page re-fetches from the cursor with no loss and no duplicates.
  const nextCursor =
    changes.length > 0 ? Math.max(...changes.map((c) => c.server_sequence ?? 0)) : after;
  return NextResponse.json({ changes, next_cursor: nextCursor });
}
