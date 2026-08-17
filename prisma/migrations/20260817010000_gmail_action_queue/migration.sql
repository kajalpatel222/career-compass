ALTER TABLE "GmailMessage" ADD COLUMN "labelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GmailMessage" ADD COLUMN "isUnread" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GmailMessage" ADD COLUMN "threadHasReply" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EmailAction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "priorityReason" TEXT NOT NULL,
  "draftText" TEXT,
  "draftModel" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAction_gmailMessageId_key" ON "EmailAction"("gmailMessageId");
CREATE INDEX "EmailAction_userId_status_priority_idx" ON "EmailAction"("userId", "status", "priority");
ALTER TABLE "EmailAction" ADD CONSTRAINT "EmailAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAction" ADD CONSTRAINT "EmailAction_gmailMessageId_fkey" FOREIGN KEY ("gmailMessageId") REFERENCES "GmailMessage"("gmailMessageId") ON DELETE CASCADE ON UPDATE CASCADE;
