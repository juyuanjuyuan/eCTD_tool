-- AlterTable
ALTER TABLE "ctd_completeness_rule" ADD COLUMN     "product_type_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sequence_type_codes" TEXT[] DEFAULT ARRAY['cnsqt1']::TEXT[];

-- AlterTable
ALTER TABLE "ctd_template_node" ADD COLUMN     "instance_key_fields" JSONB,
ADD COLUMN     "is_repeatable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sequence_node" ADD COLUMN     "instance_index" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "instance_label" VARCHAR(200);
