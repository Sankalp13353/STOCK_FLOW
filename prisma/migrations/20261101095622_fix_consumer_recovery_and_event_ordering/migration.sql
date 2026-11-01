/*
  Warnings:

  - Added the required column `updated_at` to the `processed_events` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProcessedEventStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- DropIndex
DROP INDEX "idx_processed_events_consumer";

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "retry_after" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "processed_events" ADD COLUMN     "claim_token" UUID,
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "locked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "ProcessedEventStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL,
ALTER COLUMN "processed_at" DROP NOT NULL,
ALTER COLUMN "processed_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "idx_processed_events_consumer_status" ON "processed_events"("consumer_name", "status");
