-- 004_memory (Phase 4): episodic memory derived from real runs and
-- evidence-backed lessons. Additive only; lessons never change permissions.
CREATE TABLE "AgentEpisode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "errorCode" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AgentEpisode_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "AgentEpisode_scopeId_runId_key" ON "AgentEpisode"("scopeId", "runId");
CREATE INDEX "AgentEpisode_scopeId_userId_createdAt_idx" ON "AgentEpisode"("scopeId", "userId", "createdAt");

CREATE TABLE "AgentLesson" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "evidence" TEXT NOT NULL DEFAULT '[]',
  "proposedBy" TEXT NOT NULL,
  "reviewedBy" TEXT,
  "validFrom" DATETIME NOT NULL,
  "validTo" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "AgentLesson_scopeId_status_topic_idx" ON "AgentLesson"("scopeId", "status", "topic");
