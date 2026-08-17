CREATE TABLE "GmailConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gmailAddress" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GmailMessage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "sender" TEXT,
  "subject" TEXT,
  "snippet" TEXT,
  "category" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailMessage_gmailMessageId_key" ON "GmailMessage"("gmailMessageId");
CREATE INDEX "GmailMessage_userId_receivedAt_idx" ON "GmailMessage"("userId", "receivedAt");
ALTER TABLE "GmailMessage" ADD CONSTRAINT "GmailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
