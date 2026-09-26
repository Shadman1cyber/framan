import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { postgresReachable, testDatabaseUrl } from "../test-db-url";
import { applyLedgerOperation, nextCursorAfter, ledgerBalance } from "@/lib/ledger/service";
import {
  STOCK_ENTITY_TYPE,
  applyStockOperation,
  listStockMovements,
  type StockOperationInput,
} from "./service";

const url = testDatabaseUrl("stock-service");
const d = postgresReachable() ? describe : describe.skip;
const db = new PrismaClient({ datasources: { db: { url } } });

const TRIGGERS = [
  { name: "LedgerEntry_no_update", table: "LedgerEntry", operation: "UPDATE", functionName: "stock_test_ledger_no_update", message: "LEDGER_IMMUTABLE" },
  { name: "LedgerEntry_no_delete", table: "LedgerEntry", operation: "DELETE", functionName: "stock_test_ledger_no_delete", message: "LEDGER_IMMUTABLE" },
  { name: "StockMovement_no_update", table: "StockMovement", operation: "UPDATE", functionName: "stock_test_movement_no_update", message: "STOCK_IMMUTABLE" },
  { name: "StockMovement_no_delete", table: "StockMovement", operation: "DELETE", functionName: "stock_test_movement_no_delete", message: "STOCK_IMMUTABLE" },
] as const;

function movement(ingredientId: string, delta: number, extra: Record<string, unknown> = {}): StockOperationInput {
  const id = randomUUID();
  return {
    operationId: randomUUID(),
    entityType: STOCK_ENTITY_TYPE,
    entityId: id,
    operationType: "RECORD_MOVEMENT",
    payload: {
      movement: {
        id,
        ingredientId,
        delta,
        reason: "خرید روزانه",
        occurredAt: "2026-09-19T08:00:00.000Z",
        deviceId: randomUUID(),
        ...(delta < 0 ? { allowNegative: true } : {}),
        ...extra,
      },
    },
    idempotencyKey: randomUUID(),
    clientTimestamp: "2026-09-19T08:00:00.000Z",
  };
}

async function seedIngredient(stock: number, active = true) {
  return db.ingredient.create({
    data: { nameFa: `ماده ${randomUUID().slice(0, 8)}`, unit: "GRAM", stockQuantity: stock, isActive: active },
  });
}

function ledgerOp(amount: number) {
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
        amount,
        currency: "TOMAN",
        occurredAt: "2026-09-19T08:00:00.000Z",
        deviceId: randomUUID(),
        metadata: {},
      },
    },
    idempotencyKey: randomUUID(),
    clientTimestamp: "2026-09-19T08:00:00.000Z",
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

d("append-only stock movements", () => {
  it("records a purchase additively and advances the snapshot", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(100);
    const res = await db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, 20)));
    expect(res.serverSequence).toBe(1);
    expect(res.after).toBe(120);
    expect((await db.ingredient.findUnique({ where: { id: ing.id } }))?.stockQuantity).toBe(120);
  });

  it("shares one monotonic sequence space with ledger entries", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(50);
    const a = await db.$transaction((tx) => applyLedgerOperation(tx, scope, ledgerOp(100)));
    const b = await db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, 10)));
    const c = await db.$transaction((tx) => applyLedgerOperation(tx, scope, ledgerOp(200)));
    expect([a.serverSequence, b.serverSequence, c.serverSequence]).toEqual([1, 2, 3]);
    expect(await nextCursorAfter(db, scope)).toBe(3);
    expect(await ledgerBalance(db, scope)).toBe(300);
  });

  it("merges two offline devices additively without losing either write", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(100);
    // Device A offline: purchase +20. Device B offline: usage −5.
    await db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, 20)));
    await db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, -5)));
    const final = await db.ingredient.findUnique({ where: { id: ing.id } });
    expect(final?.stockQuantity).toBe(115);
    const rows = await listStockMovements(db, scope);
    expect(rows.map((r) => r.delta).sort((x, y) => x - y)).toEqual([-5, 20]);
  });

  it("rejects a replayed idempotency key at the database level", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(100);
    const op = movement(ing.id, 5);
    await db.$transaction((tx) => applyStockOperation(tx, scope, op));
    await expect(db.$transaction((tx) => applyStockOperation(tx, scope, op))).rejects.toMatchObject({
      code: "P2002",
    });
    expect((await db.ingredient.findUnique({ where: { id: ing.id } }))?.stockQuantity).toBe(105);
  });

  it("validates input the same way as the online adjust path", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(100);
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["zero delta", { delta: 0 }, "non-zero"],
      ["non-uuid id", { id: "nope" }, "UUID"],
      ["short reason", { reason: "ab" }, "reason"],
      ["bad timestamp", { occurredAt: "yesterday" }, "ISO-8601"],
      ["negative without flag", { delta: -5, allowNegative: undefined }, "allow_negative"],
    ];
    for (const [name, extra, message] of cases) {
      const op = movement(ing.id, 10, extra);
      if (extra.allowNegative === undefined && extra.delta === undefined) {
        delete (op.payload.movement as Record<string, unknown>).allowNegative;
      }
      await expect(
        db.$transaction((tx) => applyStockOperation(tx, scope, op)),
        name,
      ).rejects.toThrow(message);
    }
    // Negative stock is rejected even with the flag.
    await expect(
      db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, -200))),
    ).rejects.toThrow("negative");
    // Unknown / inactive ingredients are rejected.
    await expect(
      db.$transaction((tx) => applyStockOperation(tx, scope, movement("missing", 5))),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const quiet = await seedIngredient(10, false);
    await expect(
      db.$transaction((tx) => applyStockOperation(tx, scope, movement(quiet.id, 5))),
    ).rejects.toThrow("inactive");
    // Unknown entity / operation types are rejected.
    const badEntity = movement(ing.id, 5);
    badEntity.entityType = "ledger_entry";
    await expect(db.$transaction((tx) => applyStockOperation(tx, scope, badEntity))).rejects.toThrow(
      "unsupported entity_type",
    );
    const badOp = movement(ing.id, 5);
    badOp.operationType = "CREATE_TRANSACTION";
    await expect(db.$transaction((tx) => applyStockOperation(tx, scope, badOp))).rejects.toThrow(
      "unsupported operation_type",
    );
    expect((await db.ingredient.findUnique({ where: { id: ing.id } }))?.stockQuantity).toBe(100);
  });

  it("aborts direct SQL mutation of movement rows", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(10);
    const res = await db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, 5)));
    await expect(
      db.$executeRawUnsafe(`UPDATE "StockMovement" SET delta = 999 WHERE id = '${res.movementId}'`),
    ).rejects.toThrow("STOCK_IMMUTABLE");
    await expect(
      db.$executeRawUnsafe(`DELETE FROM "StockMovement" WHERE id = '${res.movementId}'`),
    ).rejects.toThrow("STOCK_IMMUTABLE");
  });

  it("lists movements after a cursor in sequence order", async () => {
    const scope = `s-${randomUUID()}`;
    const ing = await seedIngredient(0);
    for (const d of [5, 10, 15]) {
      await db.$transaction((tx) => applyStockOperation(tx, scope, movement(ing.id, d)));
    }
    const page = await listStockMovements(db, scope, { take: 2, afterSequence: 1 });
    expect(page.map((r) => r.delta)).toEqual([10, 15]);
  });
});
