-- Method C: Global sequence numbering at application level.
-- Test data is being discarded per user instruction; truncate the sequence/RA/application
-- cascade so the new NOT NULL column and unique constraint can be added cleanly.
TRUNCATE TABLE "sequence", "regulatory_activity", "application" RESTART IDENTITY CASCADE;

-- DropIndex (old RA-scoped uniqueness)
DROP INDEX "sequence_regulatory_activity_id_sequence_number_key";

-- AlterTable: add application_id column
ALTER TABLE "sequence" ADD COLUMN "application_id" TEXT NOT NULL;

-- CreateIndex: application-scoped uniqueness
CREATE UNIQUE INDEX "sequence_application_id_sequence_number_key" ON "sequence"("application_id", "sequence_number");

-- CreateIndex: lookup by application
CREATE INDEX "sequence_application_id_idx" ON "sequence"("application_id");

-- AddForeignKey
ALTER TABLE "sequence" ADD CONSTRAINT "sequence_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
