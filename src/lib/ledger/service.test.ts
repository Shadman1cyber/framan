import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { postgresReachable, testDatabaseUrl } from "../test-db-url";
import {
  applyLedgerOperation,
  canonicalRequestHash,
  ledgerBalance,
  listLedger,
  nextCursorAfter,
  LedgerError,
} from "./service";

const url = testDatabaseUrl("ledger-service");
const d = postgresReachable() ? describe : describe.skip;
const db = new PrismaClient({ datasources: { db: { url } } });

const TRIGGERS = [
  { name: "LedgerEntry_no_update", table: "LedgerEntry", operation: "UPDATE", functionName: "ledger_test_no_update", message: "LEDGER_IMMUTABLE" },
  { name: "LedgerEntry_no_delete", table: "LedgerEntry", operation: "DELETE", functionName: "ledger_test_no_delete", message: "LEDGER_IMMUTABLE" },
  { name: "SyncOperation_no_update", table: "SyncOperation", operation: "UPDATE", functionName: "receipt_test_no_update", message: "RECEIPT_IMMUTABLE" },
  { name: "SyncOperation_no_delete", table: "SyncOperation", operation: "DELETE", functionName: "receipt_test_no_delete", message: "RECEIPT_IMMUTABLE" },
] as const;

type TestOp = {
  operationId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  clientTimestamp: string | null;
};

function entry(): TestOp {
  const id = randomUUID();
  return {
    operationId: randomUUID(),
    entityType: "ledger_entry",
    entityId: id,
    operationType: "CREATE_TRANSACTION",
    payload: {
      entry: {
        id,
        entryType: "EXPENSE",
        referenceType: "order",
        referenceId: "order-1",
        accountId: "cash",
        amount: 100,
        currency: "TOMAN",
        occurredAt: "2026-09-18T10:00:00.000Z",
        deviceId: randomUUID(),
        metadata: {},
      },
    },
    idempotencyKey: randomUUID(),
    clientTimestamp: "2026-09-18T10:00:00.000Z",
  };
}

beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const trigger of TRIGGERS) {
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${trigger.functionName}"() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION '${trigger.message}';
        RETURN NULL;
      END;
      $$
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "${trigger.name}"
      BEFORE ${trigger.operation} ON "${trigger.table}"
      FOR EACH ROW
      EXECUTE FUNCTION "${trigger.functionName}"()
    `);
  }
}, 60000);

afterAll(async () => {
  await db.$disconnect();
});

d("append-only ledger integrity", () => {
  it("posts a creation with sequence 1 and derives the balance", async () => {
    const scope = `s-${randomUUID()}`;
    const op = entry();
    const res = await db.$transaction((tx) => applyLedgerOperation(tx, scope, op));
    expect(res.serverSequence).toBe(1);
    expect(await ledgerBalance(db, scope)).toBe(100);
    const rows = await listLedger(db, scope);
    expect(rows.map((r) => r.serverSequence)).toEqual([1]);
  });

  it("rejects a duplicate idempotency key at the database level", async () => {
    const scope = `s-${randomUUID()}`;
    const op = entry();
    await db.$transaction((tx) => applyLedgerOperation(tx, scope, op));
    await expect(db.$transaction((tx) => applyLedgerOperation(tx, scope, op))).rejects.toMatchObject({
      code: "P2002",
    });
    expect(await ledgerBalance(db, scope)).toBe(100);
  });

  it("corrects +100 to +120 via reversal plus replacement", async () => {
    const scope = `s-${randomUUID()}`;
    const op = entry();
    const created = await db.$transaction((tx) => applyLedgerOperation(tx, scope, op));
    const replacementId = randomUUID();
    const correct = {
      operationId: randomUUID(),
      entityType: "ledger_entry",
      entityId: replacementId,
      operationType: "CORRECT_TRANSACTION",
      payload: {
        reversalOf: created.entryId,
        deviceId: randomUUID(),
        entry: {
          id: replacementId,
          entryType: "EXPENSE",
          referenceType: "order",
          referenceId: "order-1",
          accountId: "cash",
          amount: 120,
          currency: "TOMAN",
          occurredAt: "2026-09-18T11:00:00.000Z",
          deviceId: randomUUID(),
          metadata: {},
        },
      },
      idempotencyKey: randomUUID(),
      clientTimestamp: null,
    };
    const res = await db.$transaction((tx) => applyLedgerOperation(tx, scope, correct));
    expect(res.reversalOf).toBe(created.entryId);
    expect(res.reversalSequence).toBe(2);
    expect(res.serverSequence).toBe(3);
    expect(await ledgerBalance(db, scope)).toBe(120);
    const original = await db.ledgerEntry.findUniqueOrThrow({ where: { id: created.entryId } });
    expect(original.amount).toBe(100);
  });

  it("mirrors a negative entry on reversal", async () => {
    const scope = `s-${randomUUID()}`;
    const op = entry();
    (op.payload.entry as { amount: number }).amount = -50;
    const created = await db.$transaction((tx) => applyLedgerOperation(tx, scope, op));
    const rev = {
      operationId: randomUUID(),
      entityType: "ledger_entry",
      entityId: randomUUID(),
      operationType: "REVERSE_TRANSACTION",
      payload: { reversalOf: created.entryId, deviceId: randomUUID() },
      idempotencyKey: randomUUID(),
      clientTimestamp: null,
    };
    const res = await db.$transaction((tx) => applyLedgerOperation(tx, scope, rev));
    expect(res.serverSequence).toBe(2);
    expect(await ledgerBalance(db, scope)).toBe(0);
  });

  it("rejects a second reversal of the same entry", async () => {
    const scope = `s-${randomUUID()}`;
    const created = await db.$transaction((tx) => applyLedgerOperation(tx, scope, entry()));
    const rev = () => ({
      operationId: randomUUID(),
      entityType: "ledger_entry",
      entityId: randomUUID(),
      operationType: "REVERSE_TRANSACTION",
      payload: { reversalOf: created.entryId, deviceId: randomUUID() },
      idempotencyKey: randomUUID(),
      clientTimestamp: null,
    });
    await db.$transaction((tx) => applyLedgerOperation(tx, scope, rev()));
    await expect(db.$transaction((tx) => applyLedgerOperation(tx, scope, rev()))).rejects.toMatchObject({
      code: "ALREADY_REVERSED",
    } satisfies Partial<LedgerError>);
  });

  it("validates amounts, currency, and identity", async () => {
    const scope = `s-${randomUUID()}`;
    const zero = entry();
    (zero.payload.entry as { amount: number }).amount = 0;
    await expect(db.$transaction((tx) => applyLedgerOperation(tx, scope, zero))).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
    const big = entry();
    (big.payload.entry as { amount: number }).amount = 3_000_000_000;
    await expect(db.$transaction((tx) => applyLedgerOperation(tx, scope, big))).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
    const cur = entry();
    (cur.payload.entry as { currency: string }).currency = "USD";
    await expect(db.$transaction((tx) => applyLedgerOperation(tx, scope, cur))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const bad = entry();
    bad.idempotencyKey = "not-a-uuid";
    await expect(db.$transaction((tx) => applyLedgerOperation(tx, scope, bad))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("blocks direct SQL mutation of financial rows", async () => {
    const scope = `s-${randomUUID()}`;
    const created = await db.$transaction((tx) => applyLedgerOperation(tx, scope, entry()));
    await expect(
      db.$executeRawUnsafe(`UPDATE "LedgerEntry" SET amount = 5 WHERE id = '${created.entryId}'`),
    ).rejects.toThrow(/LEDGER_IMMUTABLE/);
    await expect(
      db.$executeRawUnsafe(`DELETE FROM "LedgerEntry" WHERE id = '${created.entryId}'`),
    ).rejects.toThrow(/LEDGER_IMMUTABLE/);
    expect(await ledgerBalance(db, scope)).toBe(100);
  });

  it("applies concurrent same-key writes exactly once", async () => {
    const scope = `s-${randomUUID()}`;
    const op = entry();
    const run = () => db.$transaction((tx) => applyLedgerOperation(tx, scope, op));
    const [a, b] = await Promise.allSettled([run(), run()]);
    const ok = [a, b].filter((r) => r.status === "fulfilled");
    const failed = [a, b].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as { code?: string }).code).toBe("P2002");
    expect(
      await db.ledgerEntry.count({ where: { scopeId: scope, idempotencyKey: op.idempotencyKey } }),
    ).toBe(1);
  });

  it("merges two offline devices additively with ordered sequences", async () => {
    const scope = `s-${randomUUID()}`;
    const a = entry();
    (a.payload.entry as { amount: number }).amount = 100;
    const b = entry();
    (b.payload.entry as { amount: number }).amount = 200;
    const ra = await db.$transaction((tx) => applyLedgerOperation(tx, scope, a));
    const rb = await db.$transaction((tx) => applyLedgerOperation(tx, scope, b));
    expect(new Set([ra.serverSequence, rb.serverSequence])).toEqual(new Set([1, 2]));
    expect(await ledgerBalance(db, scope)).toBe(300);
    expect(await nextCursorAfter(db, scope)).toBe(2);
    const page = await listLedger(db, scope, { afterSequence: 1 });
    expect(page.map((r) => r.serverSequence)).toEqual([2]);
  });

  it("hashes requests deterministically for idempotency comparison", () => {
    const base = {
      scopeId: "s",
      operationId: "11111111-1111-4111-8111-111111111111",
      entityType: "ledger_entry",
      entityId: "22222222-2222-4222-8222-222222222222",
      operationType: "CREATE_TRANSACTION",
      payload: { b: 1, a: 2 },
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      deviceId: "unknown",
      createdBy: "owner",
    };
    expect(canonicalRequestHash(base)).toBe(canonicalRequestHash({ ...base, payload: { a: 2, b: 1 } }));
    expect(canonicalRequestHash(base)).not.toBe(
      canonicalRequestHash({ ...base, payload: { a: 2, b: 3 } }),
    );
  });

  it("rolls back the whole operation when the receipt write fails", async () => {
    const scope = `s-${randomUUID()}`;
    const op = entry();
    await expect(
      db.$transaction(async (tx) => {
        await applyLedgerOperation(tx, scope, op);
        throw new Error("receipt-write-boom");
      }),
    ).rejects.toThrow("receipt-write-boom");
    expect(await db.ledgerEntry.count({ where: { scopeId: scope } })).toBe(0);
  });
});

void Prisma;
