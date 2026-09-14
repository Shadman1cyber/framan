-- Additive SQLite migration; review/apply separately from the existing schema.
-- Back up database first. No operational rows are changed.
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
CREATE TABLE "AgentRun" (
 "id" TEXT NOT NULL PRIMARY KEY, "scopeId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "key" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "traceId" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'queued', "tool" TEXT NOT NULL, "input" TEXT NOT NULL,
 "inputHash" TEXT NOT NULL, "version" TEXT, "previous" TEXT, "approvedBy" TEXT,
 "approvedHash" TEXT, "expiresAt" DATETIME, "result" TEXT, "error" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AgentRun_scopeId_userId_key_key" ON "AgentRun"("scopeId","userId","key");
CREATE INDEX "AgentRun_scopeId_userId_createdAt_idx" ON "AgentRun"("scopeId","userId","createdAt");
CREATE TABLE "AgentEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "runId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "state" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "exportedAt" DATETIME,
 FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgentEvent_exportedAt_createdAt_idx" ON "AgentEvent"("exportedAt","createdAt");
COMMIT;
