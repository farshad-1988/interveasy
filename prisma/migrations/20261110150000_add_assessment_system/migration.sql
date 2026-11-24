-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "durationMinutes" INTEGER,
    "passingScore" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "QuestionType" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAssignment" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "totalPossiblePoints" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "level" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptQuestion" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "originalQuestionId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "typeSnapshot" "QuestionType" NOT NULL,
    "pointsSnapshot" INTEGER NOT NULL,
    "orderSnapshot" INTEGER NOT NULL,

    CONSTRAINT "AttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptOption" (
    "id" TEXT NOT NULL,
    "attemptQuestionId" TEXT NOT NULL,
    "originalOptionId" TEXT NOT NULL,
    "textSnapshot" TEXT NOT NULL,
    "orderSnapshot" INTEGER NOT NULL,
    "isCorrectSnapshot" BOOLEAN NOT NULL,

    CONSTRAINT "AttemptOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "attemptQuestionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "earnedPoints" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_isPublished_idx" ON "Assessment"("isPublished");

-- CreateIndex
CREATE INDEX "Assessment_createdAt_idx" ON "Assessment"("createdAt");

-- CreateIndex
CREATE INDEX "Question_assessmentId_idx" ON "Question"("assessmentId");

-- CreateIndex
CREATE INDEX "Question_assessmentId_order_idx" ON "Question"("assessmentId", "order");

-- CreateIndex
CREATE INDEX "Option_questionId_idx" ON "Option"("questionId");

-- CreateIndex
CREATE INDEX "Option_questionId_order_idx" ON "Option"("questionId", "order");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_userId_idx" ON "AssessmentAssignment"("userId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_assessmentId_idx" ON "AssessmentAssignment"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_status_idx" ON "AssessmentAssignment"("status");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_dueAt_idx" ON "AssessmentAssignment"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAssignment_assessmentId_userId_status_key" ON "AssessmentAssignment"("assessmentId", "userId", "status");

-- CreateIndex
CREATE INDEX "Attempt_userId_idx" ON "Attempt"("userId");

-- CreateIndex
CREATE INDEX "Attempt_assessmentId_idx" ON "Attempt"("assessmentId");

-- CreateIndex
CREATE INDEX "Attempt_status_idx" ON "Attempt"("status");

-- CreateIndex
CREATE INDEX "Attempt_userId_assessmentId_idx" ON "Attempt"("userId", "assessmentId");

-- CreateIndex
CREATE INDEX "Attempt_submittedAt_idx" ON "Attempt"("submittedAt");

-- CreateIndex
CREATE INDEX "AttemptQuestion_attemptId_idx" ON "AttemptQuestion"("attemptId");

-- CreateIndex
CREATE INDEX "AttemptQuestion_attemptId_orderSnapshot_idx" ON "AttemptQuestion"("attemptId", "orderSnapshot");

-- CreateIndex
CREATE INDEX "AttemptQuestion_originalQuestionId_idx" ON "AttemptQuestion"("originalQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_originalQuestionId_key" ON "AttemptQuestion"("attemptId", "originalQuestionId");

-- CreateIndex
CREATE INDEX "AttemptOption_attemptQuestionId_idx" ON "AttemptOption"("attemptQuestionId");

-- CreateIndex
CREATE INDEX "AttemptOption_originalOptionId_idx" ON "AttemptOption"("originalOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptOption_attemptQuestionId_originalOptionId_key" ON "AttemptOption"("attemptQuestionId", "originalOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_attemptQuestionId_key" ON "Answer"("attemptQuestionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_originalQuestionId_fkey" FOREIGN KEY ("originalQuestionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptOption" ADD CONSTRAINT "AttemptOption_attemptQuestionId_fkey" FOREIGN KEY ("attemptQuestionId") REFERENCES "AttemptQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptOption" ADD CONSTRAINT "AttemptOption_originalOptionId_fkey" FOREIGN KEY ("originalOptionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_attemptQuestionId_fkey" FOREIGN KEY ("attemptQuestionId") REFERENCES "AttemptQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
