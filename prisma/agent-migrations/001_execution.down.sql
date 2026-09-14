-- Disable AGENT_ENABLED and drain requests before rollback.
-- Archive agent audit data before dropping: this removes execution history only.
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
DROP TABLE "AgentEvent";
DROP TABLE "AgentRun";
COMMIT;
