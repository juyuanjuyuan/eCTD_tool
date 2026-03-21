-- CreateEnum
CREATE TYPE "CompletenessRuleType" AS ENUM ('REQUIRED', 'FORBIDDEN');

-- AlterTable
ALTER TABLE "ctd_completeness_rule" ADD COLUMN     "rule_type" "CompletenessRuleType" NOT NULL DEFAULT 'REQUIRED';
