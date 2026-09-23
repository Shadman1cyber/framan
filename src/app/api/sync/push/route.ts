import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import {
  applyLedgerOperation,
  canonicalRequestHash,
  LedgerError,
  type SyncOperationInput,
} from "@/lib/ledger/service";
import {
  STOCK_ENTITY_TYPE,
  applyStockOperation,
  type StockOperationInput,
} from "@/lib/stock/service";

export const dynamic = "force-dynamic";

const MAX_BATCH = 100;
const MAX_OP_BYTES = 32 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PushOperation = {
  operation_id?: string;
  entity_type?: string;
  entity_id?: string;
  operation_type?: string;
  payload?: Record<string, unknown>;
  idempotency_key?: string;
  client_timestamp?: string;
};

export async function POST(req: NextRequest) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const createdBy = g.user.id;

  const scope = process.env.AGENT_CAFE_ID;
  const cafes = await prisma.cafe.findMany({ select: { id: true }, take: 2 });
  if (!scope || cafes.length !== 1 || cafes[0].id !== scope) {
    return NextResponse.json(
      { error: "پیکربندی کافه ناقص است", code: "SINGLE_CAFE_SCOPE_REQUIRED" },
      { status: 403 },
    );
  }

  let body: { device_id?: string; operations?: PushOperation[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "بدنه درخواست نامعتبر است", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }
  const deviceId = body.device_id ?? "unknown";
  if (deviceId !== "unknown" && !UUID_RE.test(deviceId)) {
    return NextResponse.json(
      { error: "device_id نامعتبر است", code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }
  const operations = Array.isArray(body.operations) ? body.operations : [];
  if (operations.length === 0 || operations.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `operations باید بین ۱ تا ${MAX_BATCH} باشد`, code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }

  const results: Array<Record<string, unknown>> = [];

  for (const raw of operations) {
    const operationId = String(raw.operation_id ?? "");
    if (Buffer.byteLength(JSON.stringify(raw), "utf8") > MAX_OP_BYTES) {
      results.push({
        operation_id: operationId,
        status: "rejected",
        code: "VALIDATION_FAILED",
        retryable: false,
        message: "operation too large",
      });
      continue;
    }
    let clientTimestamp: Date | null = null;
    if (raw.client_timestamp !== undefined && raw.client_timestamp !== null) {
      const t = new Date(String(raw.client_timestamp));
      if (Number.isNaN(t.getTime())) {
        results.push({
          operation_id: operationId,
          status: "rejected",
          code: "VALIDATION_FAILED",
          retryable: false,
          message: "client_timestamp must be ISO-8601",
        });
        continue;
      }
      clientTimestamp = t;
    }
    try {
      const op: SyncOperationInput = {
        operationId,
        entityType: String(raw.entity_type ?? ""),
        entityId: String(raw.entity_id ?? ""),
        operationType: String(raw.operation_type ?? ""),
        payload: (raw.payload ?? {}) as Record<string, unknown>,
        idempotencyKey: String(raw.idempotency_key ?? ""),
        clientTimestamp: raw.client_timestamp ?? null,
      };
      const requestHash = canonicalRequestHash({
        scopeId: scope,
        operationId: op.operationId,
        entityType: op.entityType,
        entityId: op.entityId,
        operationType: op.operationType,
        payload: op.payload,
        idempotencyKey: op.idempotencyKey,
        deviceId,
        createdBy,
      });

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.syncOperation.findUnique({
          where: { scopeId_idempotencyKey: { scopeId: scope, idempotencyKey: op.idempotencyKey } },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new LedgerError(
              "IDEMPOTENCY_KEY_REUSE",
              409,
              "idempotency key already used with a different request",
            );
          }
          // Receipts written by protocol v1 store `entryId`; v1.1 stores
          // `entityId`. Accept both so old rows still replay correctly.
          const prev = JSON.parse(existing.result) as {
            entityId?: string;
            entryId?: string;
            serverSequence: number;
          };
          return {
            replayed: true as const,
            serverSequence: prev.serverSequence,
            entityId: prev.entityId ?? prev.entryId ?? "",
          };
        }

        const entityType = String(raw.entity_type ?? "");
        const applied =
          entityType === STOCK_ENTITY_TYPE
            ? await applyStockOperation(tx, scope, { ...op, entityType } as StockOperationInput).then(
                (r) => ({ entityId: r.movementId, serverSequence: r.serverSequence }),
              )
            : await applyLedgerOperation(tx, scope, op).then((r) => ({
                entityId: r.entryId,
                serverSequence: r.serverSequence,
              }));
        await tx.syncOperation.create({
          data: {
            id: op.operationId,
            scopeId: scope,
            idempotencyKey: op.idempotencyKey,
            entityType: op.entityType,
            entityId: applied.entityId,
            operationType: op.operationType,
            payload: JSON.stringify(op.payload),
            requestHash,
            createdBy,
            status: "applied",
            result: JSON.stringify(applied),
            serverSequence: applied.serverSequence,
            deviceId,
            clientTimestamp,
          },
        });
        return { replayed: false as const, serverSequence: applied.serverSequence, entityId: applied.entityId };
      });

      results.push({
        operation_id: operationId,
        status: "applied",
        server_sequence: result.serverSequence,
        entity_id: result.entityId,
        // Kept for backward compatibility with v1 ledger clients.
        entry_id: result.entityId,
        ...(result.replayed ? { duplicate: true } : {}),
      });
    } catch (e) {
      if (e instanceof LedgerError) {
        results.push({
          operation_id: operationId,
          status: "rejected",
          code: e.code,
          retryable: e.code === "NOT_FOUND" || e.status >= 500,
          message: e.message,
        });
      } else if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        results.push({
          operation_id: operationId,
          status: "rejected",
          code: "CONFLICT_RETRY",
          retryable: true,
          message: "concurrent write conflict; retry with the same idempotency key",
        });
      } else {
        results.push({
          operation_id: operationId,
          status: "rejected",
          code: "INTERNAL_ERROR",
          retryable: true,
          message: "خطای داخلی سرور",
        });
      }
    }
  }

  return NextResponse.json({ results });
}
