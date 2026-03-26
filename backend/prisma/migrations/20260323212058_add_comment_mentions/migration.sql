-- AlterTable
ALTER TABLE "comment" ADD COLUMN     "mentions" JSONB DEFAULT '[]';
