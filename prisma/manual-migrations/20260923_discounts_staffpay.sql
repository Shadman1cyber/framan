-- FARMAN manual migration: discount codes + staff pay (idempotent).
-- Local/dev deploys use `prisma db push` (already in sync); apply this file
-- on managed PostgreSQL instances where `db push` is not used.
-- All money amounts are integer toman (project currency convention).

-- 1. Order totals breakdown (subtotal / discount / applied code).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "subtotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountCodeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountCode" TEXT;
CREATE INDEX IF NOT EXISTS "Order_discountCodeId_idx" ON "Order"("discountCodeId");

-- 2. Owner-managed discount codes.
CREATE TABLE IF NOT EXISTS "DiscountCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
  "maxDiscount" INTEGER,
  "usageLimit" INTEGER,
  "perUserLimit" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "DiscountCode_isActive_archivedAt_idx" ON "DiscountCode"("isActive", "archivedAt");
CREATE INDEX IF NOT EXISTS "DiscountCode_createdAt_idx" ON "DiscountCode"("createdAt");

-- 3. One redemption row per redeemed order (orderId UNIQUE = replay-safe).
CREATE TABLE IF NOT EXISTS "DiscountRedemption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "discountCodeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL UNIQUE,
  "userId" TEXT,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountRedemption_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DiscountRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DiscountRedemption_discountCodeId_createdAt_idx" ON "DiscountRedemption"("discountCodeId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscountRedemption_discountCodeId_userId_idx" ON "DiscountRedemption"("discountCodeId", "userId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_discountCodeId_fkey'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_discountCodeId_fkey"
      FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Append-only staff pay history (MONTHLY | HOURLY, toman).
CREATE TABLE IF NOT EXISTS "StaffPayRate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "staffId" TEXT NOT NULL,
  "payType" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TOMAN',
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffPayRate_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StaffPayRate_staffId_effectiveAt_idx" ON "StaffPayRate"("staffId", "effectiveAt");

-- 5. Order ingredient usage snapshots (reservation idempotency).
CREATE TABLE IF NOT EXISTS "OrderIngredientUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderIngredientUsage_orderId_ingredientId_key" UNIQUE ("orderId", "ingredientId")
);
CREATE INDEX IF NOT EXISTS "OrderIngredientUsage_ingredientId_state_idx" ON "OrderIngredientUsage"("ingredientId", "state");

-- 6. Internal supervisor-agent monitor events.
CREATE TABLE IF NOT EXISTS "AgentMonitorEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "details" TEXT,
  "workflowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentMonitorEvent_createdAt_idx" ON "AgentMonitorEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AgentMonitorEvent_severity_createdAt_idx" ON "AgentMonitorEvent"("severity", "createdAt");
