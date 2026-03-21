-- CreateEnum
CREATE TYPE "CtdNodeType" AS ENUM ('MODULE', 'SECTION', 'LEAF', 'EXTENSION_POINT');

-- CreateEnum
CREATE TYPE "SequenceNodeStatus" AS ENUM ('EMPTY', 'EDITING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LeafOperation" AS ENUM ('NEW', 'REPLACE', 'APPEND', 'DELETE');

-- CreateEnum
CREATE TYPE "CompletenessRuleSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateTable
CREATE TABLE "ctd_template_node" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "module" SMALLINT NOT NULL,
    "element_name" VARCHAR(120) NOT NULL,
    "ctd_section_number" VARCHAR(20) NOT NULL,
    "title_zh" VARCHAR(500) NOT NULL,
    "title_en" VARCHAR(500) NOT NULL,
    "node_type" "CtdNodeType" NOT NULL,
    "is_leaf" BOOLEAN NOT NULL DEFAULT false,
    "requires_stf" BOOLEAN NOT NULL DEFAULT false,
    "requires_e_seal" BOOLEAN NOT NULL DEFAULT false,
    "allows_extension" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "ctd_template_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctd_completeness_rule" (
    "id" TEXT NOT NULL,
    "application_type_code" VARCHAR(10) NOT NULL,
    "regulatory_activity_type_code" VARCHAR(10) NOT NULL,
    "template_node_id" TEXT NOT NULL,
    "severity" "CompletenessRuleSeverity" NOT NULL DEFAULT 'ERROR',

    CONSTRAINT "ctd_completeness_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_node" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "template_node_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "element_name" VARCHAR(120) NOT NULL,
    "ctd_section_number" VARCHAR(20) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "operation" "LeafOperation",
    "status" "SequenceNodeStatus" NOT NULL DEFAULT 'EMPTY',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_leaf" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "substance" VARCHAR(200),
    "manufacturer" VARCHAR(200),
    "product_name" VARCHAR(200),
    "dosage_form" VARCHAR(200),
    "indication" VARCHAR(500),

    CONSTRAINT "sequence_node_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctd_template_node_element_name_key" ON "ctd_template_node"("element_name");

-- CreateIndex
CREATE INDEX "ctd_template_node_parent_id_idx" ON "ctd_template_node"("parent_id");

-- CreateIndex
CREATE INDEX "ctd_template_node_module_idx" ON "ctd_template_node"("module");

-- CreateIndex
CREATE INDEX "ctd_completeness_rule_application_type_code_regulatory_acti_idx" ON "ctd_completeness_rule"("application_type_code", "regulatory_activity_type_code");

-- CreateIndex
CREATE INDEX "sequence_node_sequence_id_idx" ON "sequence_node"("sequence_id");

-- CreateIndex
CREATE INDEX "sequence_node_template_node_id_idx" ON "sequence_node"("template_node_id");

-- CreateIndex
CREATE INDEX "sequence_node_parent_id_idx" ON "sequence_node"("parent_id");

-- AddForeignKey
ALTER TABLE "ctd_template_node" ADD CONSTRAINT "ctd_template_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ctd_template_node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctd_completeness_rule" ADD CONSTRAINT "ctd_completeness_rule_template_node_id_fkey" FOREIGN KEY ("template_node_id") REFERENCES "ctd_template_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_node" ADD CONSTRAINT "sequence_node_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_node" ADD CONSTRAINT "sequence_node_template_node_id_fkey" FOREIGN KEY ("template_node_id") REFERENCES "ctd_template_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_node" ADD CONSTRAINT "sequence_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sequence_node"("id") ON DELETE SET NULL ON UPDATE CASCADE;
