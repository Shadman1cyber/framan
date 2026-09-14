-- 002_failure_recovery (Phase 2): durable attempt tracking on AgentRun.
-- Additive only; the existing `error` column is reused as the bounded last-error code.
ALTER TABLE "AgentRun" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
