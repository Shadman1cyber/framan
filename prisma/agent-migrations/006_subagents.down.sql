-- Reversal of 006: child history is audit data; archive before running.
DROP INDEX IF EXISTS "AgentRun_parentRunId_idx";
ALTER TABLE "AgentRun" DROP COLUMN "toolCallBudget";
ALTER TABLE "AgentRun" DROP COLUMN "parentRunId";
