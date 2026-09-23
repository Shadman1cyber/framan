import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "crypto";

export const LEDGER_ENTRY_TYPES = ["ORDER_COMPLETED", "ORDER_CANCELLED", "EXPENSE", "REVERSAL", "CORRECTION"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_OPERATION_TYPES = ["CREATE_TRANSACTION", "REVERSE_TRANSACTION", "CORRECT_TRANSACTION"] as const;
export type LedgerOperationType = (typeof LEDGER_OPERATION_TYPES)[number];

const CURRENCY = "TOMAN";
const MAX_AMOUNT = 2_000_000_000;
const MAX_METADATA_BYTES = 8192;
const MAX_REF_LEN = 128;
const MAX_ACCOUNT_LEN = 64;

export class LedgerError extends Error {
  constructor(
    public code:
      | "VALIDATION_FAILED"
      | "NOT_FOUND"
      | "ALREADY_REVERSED"
      | "IDEMPOTENCY_KEY_REUSE"
      | "INVALID_AMOUNT",
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type LedgerEntryInput = {
  id: string;
  entryType: string;
  referenceType?: string;
  referenceId?: string | null;
  accountId?: string;
  amount: number;
  currency?: string;
  occurredAt: string;
  deviceId: string;
  metadata?: Record<string, unknown>;
};

export type SyncOperationInput = {
  operationId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  clientTimestamp?: string | null;
};

export type AppliedResult = {
  entryId: string;
  serverSequence: number;
  reversalOf: string | null;
  reversalEntryId?: string;
  reversalSequence?: number;
};

function isSafeAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n !== 0 && Math.abs(n) <= MAX_AMOUNT;
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function canonicalRequestHash(input: {
  scopeId: string;
  operationId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  deviceId: string | null;
  createdBy: string;
}): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export async function ledgerBalance(
  db: PrismaClient | Prisma.TransactionClient,
  scopeId: string,
  accountId?: string,
): Promise<number> {
  const rows = await db.ledgerEntry.aggregate({
    where: { scopeId, ...(accountId ? { accountId } : {}) },
    _sum: { amount: true },
  });
  return rows._sum.amount ?? 0;
}

export async function listLedger(
  db: PrismaClient | Prisma.TransactionClient,
  scopeId: string,
  opts: { take?: number; afterSequence?: number } = {},
) {
  const take = Math.min(Math.max(opts.take ?? 200, 1), 500);
  return db.ledgerEntry.findMany({
    where: {
      scopeId,
      ...(opts.afterSequence != null ? { serverSequence: { gt: opts.afterSequence } } : {}),
    },
    orderBy: { serverSequence: "asc" },
    take,
  });
}

/**
 * Per-scope monotonic sequence shared by LedgerEntry and StockMovement rows.
 * One shared space keeps a single pull cursor totally ordered across both
 * change kinds (see src/lib/stock/service.ts). With an empty StockMovement
 * table this degenerates to the ledger-only max, preserving prior behavior.
 */
export async function nextSharedSequence(
  tx: Prisma.TransactionClient,
  scopeId: string,
): Promise<number> {
  const [lastLedger, lastStock] = await Promise.all([
    tx.ledgerEntry.findFirst({
      where: { scopeId, serverSequence: { not: null } },
      orderBy: { serverSequence: "desc" },
      select: { serverSequence: true },
    }),
    tx.stockMovement.findFirst({
      where: { scopeId, serverSequence: { not: null } },
      orderBy: { serverSequence: "desc" },
      select: { serverSequence: true },
    }),
  ]);
  return Math.max(lastLedger?.serverSequence ?? 0, lastStock?.serverSequence ?? 0) + 1;
}

async function nextSequence(tx: Prisma.TransactionClient, scopeId: string): Promise<number> {
  return nextSharedSequence(tx, scopeId);
}

function validateNewEntry(entry: LedgerEntryInput): void {
  if (!LEDGER_ENTRY_TYPES.includes(entry.entryType as LedgerEntryType)) {
    throw new LedgerError("VALIDATION_FAILED", 400, `unsupported entry_type: ${entry.entryType}`);
  }
  if (entry.entryType === "REVERSAL") {
    throw new LedgerError("VALIDATION_FAILED", 400, "REVERSAL entries are server-derived only");
  }
  if (!isSafeAmount(entry.amount)) {
    throw new LedgerError("INVALID_AMOUNT", 400, "amount must be a non-zero integer within ±2000000000");
  }
  if (entry.currency !== undefined && entry.currency !== CURRENCY) {
    throw new LedgerError("VALIDATION_FAILED", 400, `unsupported currency: ${entry.currency}`);
  }
  if (!isUuid(entry.id) || !isUuid(entry.deviceId)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "entry.id/device_id must be UUIDs");
  }
  if (Number.isNaN(Date.parse(entry.occurredAt))) {
    throw new LedgerError("VALIDATION_FAILED", 400, "occurred_at must be an ISO-8601 timestamp");
  }
  if (entry.referenceType !== undefined && entry.referenceType.length > MAX_REF_LEN) {
    throw new LedgerError("VALIDATION_FAILED", 400, "reference_type too long");
  }
  if (entry.referenceId !== undefined && entry.referenceId !== null && entry.referenceId.length > MAX_REF_LEN) {
    throw new LedgerError("VALIDATION_FAILED", 400, "reference_id too long");
  }
  if (entry.accountId !== undefined && (entry.accountId.length === 0 || entry.accountId.length > MAX_ACCOUNT_LEN)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "account_id invalid");
  }
  const metaSize = Buffer.byteLength(JSON.stringify(entry.metadata ?? {}), "utf8");
  if (metaSize > MAX_METADATA_BYTES) {
    throw new LedgerError("VALIDATION_FAILED", 400, "metadata too large");
  }
}

export async function applyLedgerOperation(
  tx: Prisma.TransactionClient,
  scopeId: string,
  op: SyncOperationInput,
): Promise<AppliedResult> {
  const payload = op.payload as {
    entry?: LedgerEntryInput;
    reversalOf?: string;
    deviceId?: string;
  };
  const entry = payload.entry;

  if (!isUuid(op.operationId) || !isUuid(op.idempotencyKey)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "operation_id/idempotency_key must be UUIDs");
  }
  if (op.entityType !== "ledger_entry") {
    throw new LedgerError("VALIDATION_FAILED", 400, `unsupported entity_type: ${op.entityType}`);
  }
  if (!LEDGER_OPERATION_TYPES.includes(op.operationType as LedgerOperationType)) {
    throw new LedgerError("VALIDATION_FAILED", 400, `unsupported operation_type: ${op.operationType}`);
  }

  if (op.operationType === "CREATE_TRANSACTION") {
    if (!entry) throw new LedgerError("VALIDATION_FAILED", 400, "payload.entry is required");
    if (payload.reversalOf !== undefined) {
      throw new LedgerError("VALIDATION_FAILED", 400, "CREATE_TRANSACTION cannot carry reversal_of");
    }
    validateNewEntry(entry);
    const serverSequence = await nextSequence(tx, scopeId);
    await tx.ledgerEntry.create({
      data: {
        id: entry.id,
        scopeId,
        entryType: entry.entryType,
        referenceType: entry.referenceType ?? "order",
        referenceId: entry.referenceId ?? null,
        reversalOf: null,
        amount: entry.amount,
        currency: CURRENCY,
        occurredAt: new Date(entry.occurredAt),
        accountId: entry.accountId ?? "cash",
        deviceId: entry.deviceId,
        idempotencyKey: op.idempotencyKey,
        serverSequence,
        serverReceivedAt: new Date(),
        metadata: JSON.stringify(entry.metadata ?? {}),
      },
    });
    return { entryId: entry.id, serverSequence, reversalOf: null };
  }

  const reversalOf = payload.reversalOf ?? null;
  if (!isUuid(reversalOf)) {
    throw new LedgerError("VALIDATION_FAILED", 400, "reversal_of must be a UUID");
  }
  const original = await tx.ledgerEntry.findFirst({ where: { id: reversalOf, scopeId } });
  if (!original) throw new LedgerError("NOT_FOUND", 404, "reversal target not found in this scope");
  const existing = await tx.ledgerEntry.findFirst({ where: { reversalOf, scopeId } });
  if (existing) throw new LedgerError("ALREADY_REVERSED", 409, "transaction already reversed");

  const reversalSequence = await nextSequence(tx, scopeId);
  const reversalId = randomUUID();
  await tx.ledgerEntry.create({
    data: {
      id: reversalId,
      scopeId,
      entryType: "REVERSAL",
      referenceType: original.referenceType,
      referenceId: original.referenceId,
      reversalOf,
      amount: -original.amount,
      currency: original.currency,
      occurredAt: new Date(),
      accountId: original.accountId,
      deviceId: payload.deviceId ?? "unknown",
      idempotencyKey: `${op.idempotencyKey}:reversal`,
      serverSequence: reversalSequence,
      serverReceivedAt: new Date(),
      metadata: JSON.stringify({ reversalOf }),
    },
  });

  if (op.operationType === "REVERSE_TRANSACTION") {
    return { entryId: reversalId, serverSequence: reversalSequence, reversalOf };
  }

  if (!entry) throw new LedgerError("VALIDATION_FAILED", 400, "payload.entry is required for correction");
  validateNewEntry(entry);
  if ((entry.currency ?? CURRENCY) !== original.currency) {
    throw new LedgerError("VALIDATION_FAILED", 400, "correction currency must match the original");
  }
  if ((entry.accountId ?? original.accountId) !== original.accountId) {
    throw new LedgerError("VALIDATION_FAILED", 400, "correction account must match the original");
  }
  const correctionSequence = await nextSequence(tx, scopeId);
  await tx.ledgerEntry.create({
    data: {
      id: entry.id,
      scopeId,
      entryType: "CORRECTION",
      referenceType: entry.referenceType ?? original.referenceType,
      referenceId: entry.referenceId ?? original.referenceId,
      reversalOf: null,
      amount: entry.amount,
      currency: original.currency,
      occurredAt: new Date(entry.occurredAt),
      accountId: original.accountId,
      deviceId: entry.deviceId,
      idempotencyKey: `${op.idempotencyKey}:correction`,
      serverSequence: correctionSequence,
      serverReceivedAt: new Date(),
      metadata: JSON.stringify({ ...(entry.metadata ?? {}), corrects: reversalOf }),
    },
  });
  return {
    entryId: entry.id,
    serverSequence: correctionSequence,
    reversalOf,
    reversalEntryId: reversalId,
    reversalSequence,
  };
}

export async function nextCursorAfter(db: PrismaClient, scopeId: string): Promise<number> {
  const [lastLedger, lastStock] = await Promise.all([
    db.ledgerEntry.findFirst({
      where: { scopeId, serverSequence: { not: null } },
      orderBy: { serverSequence: "desc" },
      select: { serverSequence: true },
    }),
    db.stockMovement.findFirst({
      where: { scopeId, serverSequence: { not: null } },
      orderBy: { serverSequence: "desc" },
      select: { serverSequence: true },
    }),
  ]);
  return Math.max(lastLedger?.serverSequence ?? 0, lastStock?.serverSequence ?? 0);
}
