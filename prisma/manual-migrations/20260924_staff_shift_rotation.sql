CREATE TABLE IF NOT EXISTS "StaffShiftRotation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "staffId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffShiftRotation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffShiftRotation_staffId_key" ON "StaffShiftRotation"("staffId");

CREATE TABLE IF NOT EXISTS "StaffShiftSlot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rotationId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "shiftStart" TEXT,
  "shiftEnd" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffShiftSlot_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "StaffShiftRotation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffShiftSlot_rotationId_position_key" ON "StaffShiftSlot"("rotationId", "position");
CREATE INDEX IF NOT EXISTS "StaffShiftSlot_rotationId_idx" ON "StaffShiftSlot"("rotationId");
