-- Reversal of 002. Requires SQLite >= 3.35 (DROP COLUMN).
ALTER TABLE "AgentRun" DROP COLUMN "attemptCount";
