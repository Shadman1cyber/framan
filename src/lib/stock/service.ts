import type { Prisma } from "@prisma/client";
import { LedgerError } from "@/lib/ledger/service";
import { nextSharedSequence } from "@/lib/ledger/service";

export const STOCK_OPERATION_TYPES = ["RECORD_MOVEMENT"] as const;
export type StockOperationType = (typeof STOCK_OPERATION_TYPES)[number];

export const STOCK_ENTITY_TYPE = "stock_movement";

const MAX_DELTA = 1_000_000_000;
const MAX_REASON_LEN = 300;
const MIN_REASON_LEN = 3;

export type StockMovementInput = {
  id: string;
  ingredientId: string;
  delta: number;
  reason: string;
  occurredAt: string;
  deviceId: string;
  allowNegative?: boolean;
};

export type StockOperationInput = {
  operationId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  clientTimestamp?: string | null;
};

export type StockAppliedResult = {
  movementId: string;
  serverSequence: number;
  ingredientId: string;
  delta: number;
  /** Ingredient stock level after applying this movement. */
  after: number;
};

function isUuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

function validateMovement(m: StockMovementInput): void {
  if (!isUuid(m.id) || !isUuid(m.deviceId)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "movement.id/device_id must be UUIDs");
  }
  if (typeof m.ingredientId !== "string" || m.ingredientId.length === 0) {
    throw new LedgerError("VALIDATION_FAILED", 400, "ingredient_id is required");
  }
  if (typeof m.delta !== "number" || !Number.isFinite(m.delta) || m.delta === 0) {
    throw new LedgerError("VALIDATION_FAILED", 400, "delta must be a finite non-zero number");
  }
  if (Math.abs(m.delta) > MAX_DELTA) {
    throw new LedgerError("VALIDATION_FAILED", 400, "delta exceeds the allowed magnitude");
  }
  const reason = typeof m.reason === "string" ? m.reason.trim() : "";
  if (reason.length < MIN_REASON_LEN || reason.length > MAX_REASON_LEN) {
    throw new LedgerError("VALIDATION_FAILED", 400, "reason must be 3..300 characters");
  }
  if (Number.isNaN(Date.parse(m.occurredAt))) {
    throw new LedgerError("VALIDATION_FAILED", 400, "occurred_at must be an ISO-8601 timestamp");
  }
  if (m.allowNegative !== undefined && typeof m.allowNegative !== "boolean") {
    throw new LedgerError("VALIDATION_FAILED", 400, "allow_negative must be a boolean");
  }
}

/**
 * Append-only stock movement. The movement row and the additive snapshot
 * update commit atomically; concurrent offline devices merge additively
 * (100 +20 −5 = 115) instead of last-write-wins. Same validation rules as
 * adjustInventory (src/lib/business/inventory.ts): negative deltas need an
 * explicit flag and the resulting stock can never go below zero.
 */
export async function applyStockOperation(
  tx: Prisma.TransactionClient,
  scopeId: string,
  op: StockOperationInput,
): Promise<StockAppliedResult> {
  if (!isUuid(op.operationId) || !isUuid(op.idempotencyKey)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "operation_id/idempotency_key must be UUIDs");
  }
  if (op.entityType !== STOCK_ENTITY_TYPE) {
    throw new LedgerError("VALIDATION_FAILED", 400, `unsupported entity_type: ${op.entityType}`);
  }
  if (!STOCK_OPERATION_TYPES.includes(op.operationType as StockOperationType)) {
    throw new LedgerError("VALIDATION_FAILED", 400, `unsupported operation_type: ${op.operationType}`);
  }
  const raw = (op.payload as { movement?: StockMovementInput }).movement;
  if (!raw) throw new LedgerError("VALIDATION_FAILED", 400, "payload.movement is required");
  const movement: StockMovementInput = {
    id: raw.id,
    ingredientId: raw.ingredientId,
    delta: raw.delta,
    reason: raw.reason,
    occurredAt: raw.occurredAt,
    deviceId: raw.deviceId,
    allowNegative: raw.allowNegative,
  };
  validateMovement(movement);

  if (movement.delta < 0 && movement.allowNegative !== true) {
    throw new LedgerError(
      "VALIDATION_FAILED",
      400,
      "stock decrease requires an explicit allow_negative flag",
    );
  }

  const ingredient = await tx.ingredient.findUnique({ where: { id: movement.ingredientId } });
  if (!ingredient) throw new LedgerError("NOT_FOUND", 404, "ingredient not found in this scope");
  if (!ingredient.isActive) {
    throw new LedgerError("VALIDATION_FAILED", 400, "ingredient is inactive");
  }
  const after = ingredient.stockQuantity + movement.delta;
  if (!Number.isFinite(after)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "resulting stock must be finite");
  }
  if (after < 0) {
    throw new LedgerError("VALIDATION_FAILED", 400, "resulting stock cannot be negative");
  }

  const serverSequence = await nextSharedSequence(tx, scopeId);
  await tx.stockMovement.create({
    data: {
      id: movement.id,
      scopeId,
      ingredientId: ingredient.id,
      delta: movement.delta,
      reason: movement.reason.trim(),
      occurredAt: new Date(movement.occurredAt),
      deviceId: movement.deviceId,
      idempotencyKey: op.idempotencyKey,
      serverSequence,
      serverReceivedAt: new Date(),
    },
  });
  await tx.ingredient.update({
    where: { id: ingredient.id },
    data: { stockQuantity: after },
  });
  return { movementId: movement.id, serverSequence, ingredientId: ingredient.id, delta: movement.delta, after };
}

export async function listStockMovements(
  db: Prisma.TransactionClient,
  scopeId: string,
  opts: { take?: number; afterSequence?: number } = {},
) {
  const take = Math.min(Math.max(opts.take ?? 200, 1), 500);
  return db.stockMovement.findMany({
    where: {
      scopeId,
      ...(opts.afterSequence != null ? { serverSequence: { gt: opts.afterSequence } } : {}),
    },
    orderBy: { serverSequence: "asc" },
    take,
  });
}
