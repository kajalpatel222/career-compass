CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE TABLE "CandidateProfile" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "targetRoles" TEXT[], "skills" TEXT[], "searchKeywords" TEXT[], "experienceSummary" TEXT, "preferredLocations" TEXT[], "workModes" TEXT[], "minimumSalary" INTEGER, "compensationPreference" TEXT, "constraints" TEXT, "profileSummary" TEXT, "resumeFileName" TEXT, "resumeText" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Job" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "company" TEXT NOT NULL, "role" TEXT NOT NULL, "url" TEXT, "description" TEXT NOT NULL, "salary" TEXT, "location" TEXT, "source" TEXT NOT NULL DEFAULT 'Indeed', "postedAt" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Job_pkey" PRIMARY KEY ("id"));
CREATE TABLE "JobAnalysis" ("id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "matchScore" INTEGER NOT NULL, "recommendation" TEXT NOT NULL, "strengths" TEXT[], "gaps" TEXT[], "concerns" TEXT[], "reasoning" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "JobAnalysis_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Application" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "jobId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'SAVED', "appliedAt" TIMESTAMP(3), "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Application_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");
CREATE INDEX "Job_userId_createdAt_idx" ON "Job"("userId", "createdAt");
CREATE UNIQUE INDEX "JobAnalysis_jobId_key" ON "JobAnalysis"("jobId");
CREATE UNIQUE INDEX "Application_userId_jobId_key" ON "Application"("userId", "jobId");

ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
