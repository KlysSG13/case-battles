-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_caseId_fkey";

-- DropIndex
DROP INDEX "ReminderLog_userId_date_key";

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "attemptNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "difficulty" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "isBest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missedJson" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN     "roundId" TEXT,
ADD COLUMN     "scenarioJson" TEXT,
ALTER COLUMN "caseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ReminderLog" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'streak';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mascotCharge" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "mascotDay" TIMESTAMP(3),
ADD COLUMN     "profilePublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rating" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "rewardsUnlockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Duel" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'normal',
    "aUserId" INTEGER NOT NULL,
    "bUserId" INTEGER,
    "style" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "aAttemptId" INTEGER,
    "bAttemptId" INTEGER,
    "winnerUserId" INTEGER,
    "delta" INTEGER,
    "rivalJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingMatch" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "duelId" INTEGER,
    "delta" INTEGER NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Duel_status_expiresAt_idx" ON "Duel"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "RatingMatch_userId_idx" ON "RatingMatch"("userId");

-- CreateIndex
CREATE INDEX "Attempt_roundId_idx" ON "Attempt"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_userId_date_type_key" ON "ReminderLog"("userId", "date", "type");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

