-- 008_offline_ledger.down.sql — removes only the offline-ledger additions.
-- Never run against a database holding financial history without authorization.

DROP TRIGGER IF EXISTS "SyncOperation_no_delete";
DROP TRIGGER IF EXISTS "SyncOperation_no_update";
DROP TRIGGER IF EXISTS "LedgerEntry_no_delete";
DROP TRIGGER IF EXISTS "LedgerEntry_no_update";
DROP INDEX IF EXISTS "SyncDevice_scopeId_lastSeenAt_idx";
DROP TABLE IF EXISTS "SyncDevice";
DROP INDEX IF EXISTS "SyncOperation_scopeId_serverSequence_idx";
DROP TABLE IF EXISTS "SyncOperation";
DROP INDEX IF EXISTS "LedgerEntry_scopeId_serverSequence_key";
DROP INDEX IF EXISTS "LedgerEntry_scopeId_reversalOf_key";
DROP INDEX IF EXISTS "LedgerEntry_scopeId_idempotencyKey_key";
DROP INDEX IF EXISTS "LedgerEntry_scopeId_accountId_idx";
DROP INDEX IF EXISTS "LedgerEntry_reversalOf_idx";
DROP INDEX IF EXISTS "LedgerEntry_referenceType_referenceId_idx";
DROP INDEX IF EXISTS "LedgerEntry_scopeId_occurredAt_idx";
DROP TABLE IF EXISTS "LedgerEntry";
