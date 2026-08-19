CREATE TABLE "PlannerItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INBOX',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "scheduledStart" TIMESTAMP(3),
  "scheduledEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlannerItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlannerItem_userId_status_scheduledStart_idx" ON "PlannerItem"("userId", "status", "scheduledStart");
CREATE INDEX "PlannerItem_userId_source_sourceId_idx" ON "PlannerItem"("userId", "source", "sourceId");
ALTER TABLE "PlannerItem" ADD CONSTRAINT "PlannerItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
