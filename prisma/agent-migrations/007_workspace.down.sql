-- 007_workspace down. Removes only workspace additions; business data untouched.
-- Artifacts' stored files are NOT deleted here (they are private business data);
-- archive them before dropping the table if the bytes must be removed too.
DROP INDEX IF EXISTS "AgentArtifact_sessionId_idx";
DROP INDEX IF EXISTS "AgentArtifact_scopeId_createdAt_idx";
DROP TABLE IF EXISTS "AgentArtifact";
DROP INDEX IF EXISTS "AgentStep_scopeId_state_idx";
DROP INDEX IF EXISTS "AgentStep_runId_idx_key";
DROP TABLE IF EXISTS "AgentStep";
DROP INDEX IF EXISTS "AgentRun_state_leaseUntil_idx";
DROP INDEX IF EXISTS "AgentRun_sessionId_idx";
ALTER TABLE "AgentEvent" DROP COLUMN "completionTokens";
ALTER TABLE "AgentEvent" DROP COLUMN "promptTokens";
ALTER TABLE "AgentEvent" DROP COLUMN "durationMs";
-- SQLite >= 3.35 supports DROP COLUMN.
ALTER TABLE "AgentRun" DROP COLUMN "skillVersion";
ALTER TABLE "AgentRun" DROP COLUMN "promptVersion";
ALTER TABLE "AgentRun" DROP COLUMN "modelId";
ALTER TABLE "AgentRun" DROP COLUMN "planKind";
ALTER TABLE "AgentRun" DROP COLUMN "leaseUntil";
ALTER TABLE "AgentRun" DROP COLUMN "leaseOwner";
ALTER TABLE "AgentRun" DROP COLUMN "sessionId";
DROP INDEX IF EXISTS "AIChatSession_ownerId_archived_updatedAt_idx";
ALTER TABLE "AIChatSession" DROP COLUMN "archived";
ALTER TABLE "AIChatSession" DROP COLUMN "ownerId";
