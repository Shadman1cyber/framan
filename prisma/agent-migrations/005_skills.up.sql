-- 005_skills (Phase 5): versioned skill drafts with sandbox evaluation and
-- explicit promotion. Additive only; skills carry no permissions.
CREATE TABLE "AgentSkill" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "definition" TEXT NOT NULL,
  "sourceEpisodes" TEXT NOT NULL DEFAULT '[]',
  "testResult" TEXT,
  "testedAt" DATETIME,
  "createdBy" TEXT NOT NULL,
  "activatedBy" TEXT,
  "activatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AgentSkill_scopeId_slug_version_key" ON "AgentSkill"("scopeId", "slug", "version");
CREATE INDEX "AgentSkill_scopeId_slug_status_idx" ON "AgentSkill"("scopeId", "slug", "status");
