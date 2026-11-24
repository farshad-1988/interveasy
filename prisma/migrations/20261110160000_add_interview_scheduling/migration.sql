-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'PENDING',
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAvailability" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewNote" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'SHARED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewStatusHistory" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "fromStatus" "InterviewStatus" NOT NULL,
    "toStatus" "InterviewStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_userId_idx" ON "Interview"("userId");

-- CreateIndex
CREATE INDEX "Interview_interviewerId_idx" ON "Interview"("interviewerId");

-- CreateIndex
CREATE INDEX "Interview_status_idx" ON "Interview"("status");

-- CreateIndex
CREATE INDEX "Interview_startAt_idx" ON "Interview"("startAt");

-- CreateIndex
CREATE INDEX "Interview_endAt_idx" ON "Interview"("endAt");

-- CreateIndex
CREATE INDEX "Interview_userId_startAt_idx" ON "Interview"("userId", "startAt");

-- CreateIndex
CREATE INDEX "Interview_interviewerId_startAt_idx" ON "Interview"("interviewerId", "startAt");

-- CreateIndex
CREATE INDEX "Interview_assessmentId_idx" ON "Interview"("assessmentId");

-- CreateIndex
CREATE INDEX "InterviewAvailability_interviewerId_idx" ON "InterviewAvailability"("interviewerId");

-- CreateIndex
CREATE INDEX "InterviewAvailability_interviewerId_isActive_idx" ON "InterviewAvailability"("interviewerId", "isActive");

-- CreateIndex
CREATE INDEX "InterviewAvailability_dayOfWeek_idx" ON "InterviewAvailability"("dayOfWeek");

-- CreateIndex
CREATE INDEX "InterviewNote_interviewId_idx" ON "InterviewNote"("interviewId");

-- CreateIndex
CREATE INDEX "InterviewNote_authorId_idx" ON "InterviewNote"("authorId");

-- CreateIndex
CREATE INDEX "InterviewNote_visibility_idx" ON "InterviewNote"("visibility");

-- CreateIndex
CREATE INDEX "InterviewStatusHistory_interviewId_idx" ON "InterviewStatusHistory"("interviewId");

-- CreateIndex
CREATE INDEX "InterviewStatusHistory_createdAt_idx" ON "InterviewStatusHistory"("createdAt");

-- CreateIndex
CREATE INDEX "InterviewStatusHistory_changedById_idx" ON "InterviewStatusHistory"("changedById");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAvailability" ADD CONSTRAINT "InterviewAvailability_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewNote" ADD CONSTRAINT "InterviewNote_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewNote" ADD CONSTRAINT "InterviewNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewStatusHistory" ADD CONSTRAINT "InterviewStatusHistory_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewStatusHistory" ADD CONSTRAINT "InterviewStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exclusion constraints to prevent overlapping active interviews for candidate and interviewer
ALTER TABLE "Interview"
  ADD CONSTRAINT "Interview_no_overlap_user"
  EXCLUDE USING gist (
    "userId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("status" IN ('PENDING', 'CONFIRMED'));

ALTER TABLE "Interview"
  ADD CONSTRAINT "Interview_no_overlap_interviewer"
  EXCLUDE USING gist (
    "interviewerId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("status" IN ('PENDING', 'CONFIRMED'));
