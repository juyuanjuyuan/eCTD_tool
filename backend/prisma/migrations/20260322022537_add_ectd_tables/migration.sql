-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PASS', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "file_attachment" (
    "id" TEXT NOT NULL,
    "sequence_node_id" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "ectd_relative_path" VARCHAR(180) NOT NULL,
    "file_type" VARCHAR(10) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "md5_checksum" CHAR(32) NOT NULL,
    "xml_lang" VARCHAR(10) NOT NULL DEFAULT 'zh',
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "reference_file_id" TEXT,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_pdf_analysis" (
    "id" TEXT NOT NULL,
    "file_attachment_id" TEXT NOT NULL,
    "pdf_version" VARCHAR(10),
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "has_bookmarks" BOOLEAN NOT NULL DEFAULT false,
    "bookmark_zoom_inherit" BOOLEAN NOT NULL DEFAULT false,
    "is_encrypted" BOOLEAN NOT NULL DEFAULT false,
    "has_javascript" BOOLEAN NOT NULL DEFAULT false,
    "has_external_links" BOOLEAN NOT NULL DEFAULT false,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "has_multimedia" BOOLEAN NOT NULL DEFAULT false,
    "is_text_searchable" BOOLEAN NOT NULL DEFAULT true,
    "fonts_embedded" BOOLEAN NOT NULL DEFAULT true,
    "has_e_seal" BOOLEAN NOT NULL DEFAULT false,
    "compliance_status" "ComplianceStatus" NOT NULL DEFAULT 'PASS',
    "compliance_details" JSONB,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_pdf_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_tagging_file" (
    "id" TEXT NOT NULL,
    "sequence_node_id" TEXT NOT NULL,
    "study_title" VARCHAR(500) NOT NULL,
    "study_id" VARCHAR(100) NOT NULL,
    "categories" JSONB,
    "file_tags" JSONB,
    "stf_xml_content" TEXT,
    "operation" "LeafOperation" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_tagging_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_report" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "total_errors" INTEGER NOT NULL DEFAULT 0,
    "total_warnings" INTEGER NOT NULL DEFAULT 0,
    "total_infos" INTEGER NOT NULL DEFAULT 0,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_item" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "rule_code" VARCHAR(10) NOT NULL,
    "rule_category" VARCHAR(50) NOT NULL,
    "severity" "ValidationSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "detail" TEXT,
    "file_path" VARCHAR(500),
    "suggestion" TEXT,

    CONSTRAINT "validation_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_attachment_sequence_node_id_idx" ON "file_attachment"("sequence_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_pdf_analysis_file_attachment_id_key" ON "file_pdf_analysis"("file_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_tagging_file_sequence_node_id_key" ON "study_tagging_file"("sequence_node_id");

-- CreateIndex
CREATE INDEX "validation_report_sequence_id_idx" ON "validation_report"("sequence_id");

-- CreateIndex
CREATE INDEX "validation_item_report_id_idx" ON "validation_item"("report_id");

-- CreateIndex
CREATE INDEX "validation_item_report_id_severity_idx" ON "validation_item"("report_id", "severity");

-- AddForeignKey
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_sequence_node_id_fkey" FOREIGN KEY ("sequence_node_id") REFERENCES "sequence_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_reference_file_id_fkey" FOREIGN KEY ("reference_file_id") REFERENCES "file_attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_pdf_analysis" ADD CONSTRAINT "file_pdf_analysis_file_attachment_id_fkey" FOREIGN KEY ("file_attachment_id") REFERENCES "file_attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_tagging_file" ADD CONSTRAINT "study_tagging_file_sequence_node_id_fkey" FOREIGN KEY ("sequence_node_id") REFERENCES "sequence_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_report" ADD CONSTRAINT "validation_report_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_item" ADD CONSTRAINT "validation_item_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "validation_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
