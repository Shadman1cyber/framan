-- 006_subagents (Phase 6): bounded child runs under a supervisor run.
-- Additive only; children inherit permissions and cannot widen them.
ALTER TABLE "AgentRun" ADD COLUMN "parentRunId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "toolCallBudget" INTEGER NOT NULL DEFAULT 12;
CREATE INDEX "AgentRun_parentRunId_idx" ON "AgentRun"("parentRunId");
