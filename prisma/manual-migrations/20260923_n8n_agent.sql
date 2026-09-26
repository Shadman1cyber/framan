CREATE TABLE IF NOT EXISTS "OrderIngredientUsage" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderIngredientUsage_orderId_ingredientId_key" ON "OrderIngredientUsage" ("orderId", "ingredientId");
CREATE INDEX IF NOT EXISTS "OrderIngredientUsage_ingredientId_state_idx" ON "OrderIngredientUsage" ("ingredientId", "state");

CREATE TABLE IF NOT EXISTS "AgentMonitorEvent" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "details" TEXT,
  "workflowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentMonitorEvent_createdAt_idx" ON "AgentMonitorEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS "AgentMonitorEvent_severity_createdAt_idx" ON "AgentMonitorEvent" ("severity", "createdAt");
