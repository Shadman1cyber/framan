-- 007_workspace: unified workspace slice. Additive only; never touches business rows.
-- Conversation ownership/archive (R02). Existing rows keep userId and become
-- legacy sessions when userId IS NULL (ownerId stays NULL => legacy archive).
ALTER TABLE "AIChatSession" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "AIChatSession" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "AIChatSession_ownerId_archived_updatedAt_idx" ON "AIChatSession"("ownerId", "archived", "updatedAt");

-- Run linkage + durable queue lease + task provenance (R03/R04/R11).
ALTER TABLE "AgentRun" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "leaseUntil" DATETIME;
ALTER TABLE "AgentRun" ADD COLUMN "planKind" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "AgentRun" ADD COLUMN "modelId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "promptVersion" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "skillVersion" TEXT;
CREATE INDEX IF NOT EXISTS "AgentRun_sessionId_idx" ON "AgentRun"("sessionId");
CREATE INDEX IF NOT EXISTS "AgentRun_state_leaseUntil_idx" ON "AgentRun"("state", "leaseUntil");

-- Bounded plan steps (R04).
CREATE TABLE IF NOT EXISTS "AgentStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "tool" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentStep_runId_idx_key" ON "AgentStep"("runId", "idx");
CREATE INDEX IF NOT EXISTS "AgentStep_scopeId_state_idx" ON "AgentStep"("scopeId", "state");

-- Measured durations + provider token usage on events (R10).
ALTER TABLE "AgentEvent" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "AgentEvent" ADD COLUMN "promptTokens" INTEGER;
ALTER TABLE "AgentEvent" ADD COLUMN "completionTokens" INTEGER;

-- Private artifacts (R06). Metadata only; bytes live outside public uploads.
CREATE TABLE IF NOT EXISTS "AgentArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeId" TEXT NOT NULL,
    "runId" TEXT,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentArtifact_scopeId_createdAt_idx" ON "AgentArtifact"("scopeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentArtifact_sessionId_idx" ON "AgentArtifact"("sessionId");
