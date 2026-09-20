-- 009_stock_movement.up.sql — additive append-only inventory movement ledger.
-- Mirrors 008_offline_ledger: movements are immutable rows; current stock is
-- always derived (snapshot + SUM(delta)). Corrections are new rows, never updates.
-- Shares the per-scope server sequence space with LedgerEntry so a single pull
-- cursor stays totally ordered (see src/lib/stock/service.ts).

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "scopeId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "delta" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "deviceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "serverSequence" INTEGER,
  "serverReceivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StockMovement_scopeId_occurredAt_idx" ON "StockMovement"("scopeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "StockMovement_scopeId_ingredientId_idx" ON "StockMovement"("scopeId", "ingredientId");
CREATE INDEX IF NOT EXISTS "StockMovement_ingredientId_idx" ON "StockMovement"("ingredientId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_scopeId_idempotencyKey_key" ON "StockMovement"("scopeId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_scopeId_serverSequence_key" ON "StockMovement"("scopeId", "serverSequence");

CREATE TRIGGER IF NOT EXISTS "StockMovement_no_update" BEFORE UPDATE ON "StockMovement"
BEGIN SELECT RAISE(ABORT, 'STOCK_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS "StockMovement_no_delete" BEFORE DELETE ON "StockMovement"
BEGIN SELECT RAISE(ABORT, 'STOCK_IMMUTABLE'); END;
