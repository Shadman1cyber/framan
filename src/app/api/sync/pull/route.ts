import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { listLedger } from "@/lib/ledger/service";

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
  const rows = await listLedger(prisma, scope, { take, afterSequence: after });
  const filtered = account ? rows.filter((r) => r.accountId === account) : rows;
  const changes = filtered.map((r) => ({
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
  }));
  const nextCursor = changes.length > 0 ? Math.max(...changes.map((c) => c.server_sequence ?? 0)) : after;
  return NextResponse.json({ changes, next_cursor: nextCursor });
}
