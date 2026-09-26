-- Inventory flow for PostgreSQL deployments that do not run Prisma db push.
-- Existing stockQuantity values remain the unbatched opening balance.
ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "purchaseUnit" TEXT;
ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "purchaseFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "InventoryBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ingredientId" TEXT NOT NULL,
  "initialQuantity" DOUBLE PRECISION NOT NULL,
  "remainingQuantity" DOUBLE PRECISION NOT NULL,
  "costPerBaseUnit" DOUBLE PRECISION,
  "supplier" TEXT,
  "expiresAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryBatch_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InventoryBatch_ingredientId_expiresAt_receivedAt_idx" ON "InventoryBatch"("ingredientId", "expiresAt", "receivedAt");

CREATE TABLE IF NOT EXISTS "InventoryEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operationKey" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "delta" DOUBLE PRECISION NOT NULL,
  "before" DOUBLE PRECISION NOT NULL,
  "after" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT,
  "orderId" TEXT,
  "allocations" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryEvent_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryEvent_operationKey_key" ON "InventoryEvent"("operationKey");
CREATE INDEX IF NOT EXISTS "InventoryEvent_ingredientId_createdAt_idx" ON "InventoryEvent"("ingredientId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryEvent_kind_createdAt_idx" ON "InventoryEvent"("kind", "createdAt");

CREATE TABLE IF NOT EXISTS "InventoryBatchAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "usageId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "InventoryBatchAllocation_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "OrderIngredientUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryBatchAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InventoryBatchAllocation_usageId_idx" ON "InventoryBatchAllocation"("usageId");
CREATE INDEX IF NOT EXISTS "InventoryBatchAllocation_batchId_idx" ON "InventoryBatchAllocation"("batchId");
