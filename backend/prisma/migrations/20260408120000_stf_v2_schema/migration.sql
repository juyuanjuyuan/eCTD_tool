-- Plan 12: STF v2 schema (2026-04-08)
-- Drop the v1 single-document StudyTaggingFile model and replace it with the
-- v2 Study/StudyCategory/StudyDocument trio so a single CTD section can host
-- multiple research studies, each with multiple documents (body / protocol /
-- CRF). Per user direction (open dev DB), no v1 data is preserved.

-- ============================================================================
-- 1. Drop v1 table.  Nothing FKs into study_tagging_file so plain DROP suffices.
-- ============================================================================
DROP TABLE IF EXISTS "study_tagging_file";

-- ============================================================================
-- 2. Create v2 tables
-- ============================================================================

-- ----- Study (one row per research study within a sequence node) -----
CREATE TABLE "study" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "sequence_node_id" TEXT NOT NULL,
    "ctd_section_number" VARCHAR(20) NOT NULL,
    "study_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "operation" "LeafOperation" NOT NULL DEFAULT 'NEW',
    "modified_from_id" TEXT,
    "stf_file_path" VARCHAR(500),
    "stf_checksum" CHAR(32),
    "stf_xml_content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "study_sequence_id_idx" ON "study"("sequence_id");
CREATE INDEX "study_sequence_node_id_idx" ON "study"("sequence_node_id");
CREATE INDEX "study_modified_from_id_idx" ON "study"("modified_from_id");
CREATE UNIQUE INDEX "study_sequence_node_id_study_id_key" ON "study"("sequence_node_id", "study_id");

ALTER TABLE "study" ADD CONSTRAINT "study_sequence_id_fkey"
    FOREIGN KEY ("sequence_id") REFERENCES "sequence"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "study" ADD CONSTRAINT "study_sequence_node_id_fkey"
    FOREIGN KEY ("sequence_node_id") REFERENCES "sequence_node"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "study" ADD CONSTRAINT "study_modified_from_id_fkey"
    FOREIGN KEY ("modified_from_id") REFERENCES "study"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ----- StudyCategory (per-study ICH STF dimension values) -----
CREATE TABLE "study_category" (
    "id" TEXT NOT NULL,
    "study_id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "info_type" VARCHAR(10) NOT NULL DEFAULT 'ich',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_category_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "study_category_study_id_idx" ON "study_category"("study_id");
CREATE UNIQUE INDEX "study_category_study_id_name_key" ON "study_category"("study_id", "name");

ALTER TABLE "study_category" ADD CONSTRAINT "study_category_study_id_fkey"
    FOREIGN KEY ("study_id") REFERENCES "study"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- StudyDocument (per-study attached files: body / protocol / CRF / ...) -----
CREATE TABLE "study_document" (
    "id" TEXT NOT NULL,
    "study_id" TEXT NOT NULL,
    "file_attachment_id" TEXT NOT NULL,
    "file_tag" VARCHAR(60) NOT NULL,
    "file_tag_info_type" VARCHAR(10) NOT NULL DEFAULT 'ich',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "study_document_study_id_idx" ON "study_document"("study_id");
CREATE INDEX "study_document_file_attachment_id_idx" ON "study_document"("file_attachment_id");

ALTER TABLE "study_document" ADD CONSTRAINT "study_document_study_id_fkey"
    FOREIGN KEY ("study_id") REFERENCES "study"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "study_document" ADD CONSTRAINT "study_document_file_attachment_id_fkey"
    FOREIGN KEY ("file_attachment_id") REFERENCES "file_attachment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 3. CtdTemplateNode.default_stf_categories (Plan 12 决策 4)
--    Stores the per-section preset list of STF categories for the frontend
--    "basic area" form. Format: [{ name: "species", required: true }, ...]
-- ============================================================================
ALTER TABLE "ctd_template_node" ADD COLUMN "default_stf_categories" JSONB;
