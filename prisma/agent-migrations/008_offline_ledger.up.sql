-- 008_offline_ledger.up.sql — additive offline-first accounting tables.
-- Financial entries are append-only; corrections are new rows, never updates.

CREATE TABLE IF NOT EXISTS "LedgerEntry" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "scopeId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL DEFAULT 'order',
  "referenceId" TEXT,
  "reversalOf" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TOMAN',
  "occurredAt" DATETIME NOT NULL,
  "accountId" TEXT NOT NULL DEFAULT 'cash',
  "deviceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "serverSequence" INTEGER,
  "serverReceivedAt" DATETIME,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LedgerEntry_scopeId_occurredAt_idx" ON "LedgerEntry"("scopeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "LedgerEntry_scopeId_accountId_idx" ON "LedgerEntry"("scopeId", "accountId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_referenceType_referenceId_idx" ON "LedgerEntry"("referenceType", "referenceId");
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_scopeId_idempotencyKey_key" ON "LedgerEntry"("scopeId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_scopeId_reversalOf_key" ON "LedgerEntry"("scopeId", "reversalOf");
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_scopeId_serverSequence_key" ON "LedgerEntry"("scopeId", "serverSequence");

CREATE TABLE IF NOT EXISTS "SyncOperation" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "scopeId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'applied',
  "result" TEXT NOT NULL DEFAULT '{}',
  "serverSequence" INTEGER,
  "deviceId" TEXT,
  "clientTimestamp" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SyncOperation_scopeId_idempotencyKey_key" UNIQUE ("scopeId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "SyncOperation_scopeId_serverSequence_idx" ON "SyncOperation"("scopeId", "serverSequence");

CREATE TABLE IF NOT EXISTS "SyncDevice" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "scopeId" TEXT NOT NULL,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgent" TEXT
);
CREATE INDEX IF NOT EXISTS "SyncDevice_scopeId_lastSeenAt_idx" ON "SyncDevice"("scopeId", "lastSeenAt");

CREATE TRIGGER IF NOT EXISTS "LedgerEntry_no_update" BEFORE UPDATE ON "LedgerEntry"
BEGIN SELECT RAISE(ABORT, 'LEDGER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS "LedgerEntry_no_delete" BEFORE DELETE ON "LedgerEntry"
BEGIN SELECT RAISE(ABORT, 'LEDGER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS "SyncOperation_no_update" BEFORE UPDATE ON "SyncOperation"
BEGIN SELECT RAISE(ABORT, 'RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS "SyncOperation_no_delete" BEFORE DELETE ON "SyncOperation"
BEGIN SELECT RAISE(ABORT, 'RECEIPT_IMMUTABLE'); END;
