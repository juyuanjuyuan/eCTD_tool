-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "application_number" TEXT NOT NULL,
    "application_type_code" TEXT NOT NULL,
    "application_type_version" TEXT NOT NULL,
    "product_type_code" TEXT NOT NULL,
    "product_type_version" TEXT NOT NULL,
    "product_number" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "application_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "regulatory_activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "regulatory_activity_type_code" TEXT NOT NULL,
    "regulatory_activity_type_version" TEXT NOT NULL,
    "related_sequence" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "regulatory_activity_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "regulatory_activity_id" TEXT NOT NULL,
    "sequence_number" TEXT NOT NULL,
    "sequence_type_code" TEXT NOT NULL,
    "sequence_type_version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sequence_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sequence_regulatory_activity_id_fkey" FOREIGN KEY ("regulatory_activity_id") REFERENCES "regulatory_activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ctd_template_node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parent_id" TEXT,
    "module" INTEGER NOT NULL,
    "element_name" TEXT NOT NULL,
    "ctd_section_number" TEXT NOT NULL,
    "title_zh" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "is_leaf" BOOLEAN NOT NULL DEFAULT false,
    "requires_stf" BOOLEAN NOT NULL DEFAULT false,
    "requires_e_seal" BOOLEAN NOT NULL DEFAULT false,
    "allows_extension" BOOLEAN NOT NULL DEFAULT false,
    "is_repeatable" BOOLEAN NOT NULL DEFAULT false,
    "instance_key_fields" TEXT,
    "default_stf_categories" TEXT,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "ctd_template_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ctd_template_node" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ctd_completeness_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_type_code" TEXT NOT NULL,
    "regulatory_activity_type_code" TEXT NOT NULL,
    "sequence_type_codes" TEXT NOT NULL DEFAULT '["cnsqt1"]',
    "product_type_codes" TEXT NOT NULL DEFAULT '[]',
    "template_node_id" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL DEFAULT 'REQUIRED',
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    CONSTRAINT "ctd_completeness_rule_template_node_id_fkey" FOREIGN KEY ("template_node_id") REFERENCES "ctd_template_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sequence_node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence_id" TEXT NOT NULL,
    "template_node_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "element_name" TEXT NOT NULL,
    "ctd_section_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "operation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EMPTY',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_leaf" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "substance" TEXT,
    "manufacturer" TEXT,
    "product_name" TEXT,
    "dosage_form" TEXT,
    "indication" TEXT,
    "instance_index" INTEGER NOT NULL DEFAULT 0,
    "instance_label" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submitted_by" TEXT,
    "submitted_at" DATETIME,
    "approved_by" TEXT,
    "approved_at" DATETIME,
    "rejection_reason" TEXT,
    CONSTRAINT "sequence_node_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sequence_node_template_node_id_fkey" FOREIGN KEY ("template_node_id") REFERENCES "ctd_template_node" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sequence_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sequence_node" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "node_id" TEXT NOT NULL,
    "content_json" TEXT,
    "content_html" TEXT,
    "content_text" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "xml_lang" TEXT NOT NULL DEFAULT 'zh',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "document_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "sequence_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_version" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content_json" TEXT,
    "content_html" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "xml_lang" TEXT NOT NULL DEFAULT 'zh',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_version_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "controlled_vocabulary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabulary_name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "valid_from" DATETIME NOT NULL,
    "valid_to" DATETIME,
    "description_zh" TEXT NOT NULL,
    "description_en" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "cv_dependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_type_code" TEXT NOT NULL,
    "regulatory_activity_type_code" TEXT NOT NULL,
    "sequence_type_code" TEXT,
    "version" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "file_attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence_node_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "export_name" TEXT,
    "storage_path" TEXT NOT NULL,
    "ectd_relative_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "md5_checksum" TEXT NOT NULL,
    "xml_lang" TEXT NOT NULL DEFAULT 'zh',
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "reference_file_id" TEXT,
    "uploaded_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_attachment_sequence_node_id_fkey" FOREIGN KEY ("sequence_node_id") REFERENCES "sequence_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "file_attachment_reference_file_id_fkey" FOREIGN KEY ("reference_file_id") REFERENCES "file_attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_pdf_analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_attachment_id" TEXT NOT NULL,
    "pdf_version" TEXT,
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
    "compliance_status" TEXT NOT NULL DEFAULT 'PASS',
    "compliance_details" TEXT,
    "analyzed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_pdf_analysis_file_attachment_id_fkey" FOREIGN KEY ("file_attachment_id") REFERENCES "file_attachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence_id" TEXT NOT NULL,
    "sequence_node_id" TEXT NOT NULL,
    "ctd_section_number" TEXT NOT NULL,
    "study_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'NEW',
    "modified_from_id" TEXT,
    "stf_file_path" TEXT,
    "stf_checksum" TEXT,
    "stf_xml_content" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "study_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "study_sequence_node_id_fkey" FOREIGN KEY ("sequence_node_id") REFERENCES "sequence_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "study_modified_from_id_fkey" FOREIGN KEY ("modified_from_id") REFERENCES "study" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study_category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "study_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "info_type" TEXT NOT NULL DEFAULT 'ich',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "study_category_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "study" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study_document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "study_id" TEXT NOT NULL,
    "file_attachment_id" TEXT NOT NULL,
    "file_tag" TEXT NOT NULL,
    "file_tag_info_type" TEXT NOT NULL DEFAULT 'ich',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "study_document_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "study" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "study_document_file_attachment_id_fkey" FOREIGN KEY ("file_attachment_id") REFERENCES "file_attachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "validation_report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence_id" TEXT NOT NULL,
    "total_errors" INTEGER NOT NULL DEFAULT 0,
    "total_warnings" INTEGER NOT NULL DEFAULT 0,
    "total_infos" INTEGER NOT NULL DEFAULT 0,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "validation_report_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "validation_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "report_id" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "rule_category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detail" TEXT,
    "file_path" TEXT,
    "suggestion" TEXT,
    CONSTRAINT "validation_item_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "validation_report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence_node_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT DEFAULT '[]',
    "parent_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comment_sequence_node_id_fkey" FOREIGN KEY ("sequence_node_id") REFERENCES "sequence_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "invited_by" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_invitation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_invitation_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "node_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "node_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'EDIT',
    "assigned_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_assignment_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "sequence_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "node_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "node_assignment_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "project_id" TEXT,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_project_id_user_id_key" ON "project_member"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_application_number_key" ON "application"("application_number");

-- CreateIndex
CREATE INDEX "application_project_id_idx" ON "application"("project_id");

-- CreateIndex
CREATE INDEX "regulatory_activity_application_id_idx" ON "regulatory_activity"("application_id");

-- CreateIndex
CREATE INDEX "sequence_application_id_idx" ON "sequence"("application_id");

-- CreateIndex
CREATE INDEX "sequence_regulatory_activity_id_idx" ON "sequence"("regulatory_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_application_id_sequence_number_key" ON "sequence"("application_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "ctd_template_node_element_name_key" ON "ctd_template_node"("element_name");

-- CreateIndex
CREATE INDEX "ctd_template_node_parent_id_idx" ON "ctd_template_node"("parent_id");

-- CreateIndex
CREATE INDEX "ctd_template_node_module_idx" ON "ctd_template_node"("module");

-- CreateIndex
CREATE INDEX "ctd_completeness_rule_application_type_code_regulatory_activity_type_code_idx" ON "ctd_completeness_rule"("application_type_code", "regulatory_activity_type_code");

-- CreateIndex
CREATE INDEX "sequence_node_sequence_id_idx" ON "sequence_node"("sequence_id");

-- CreateIndex
CREATE INDEX "sequence_node_template_node_id_idx" ON "sequence_node"("template_node_id");

-- CreateIndex
CREATE INDEX "sequence_node_parent_id_idx" ON "sequence_node"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_node_id_key" ON "document"("node_id");

-- CreateIndex
CREATE INDEX "document_node_id_idx" ON "document"("node_id");

-- CreateIndex
CREATE INDEX "document_version_document_id_idx" ON "document_version"("document_id");

-- CreateIndex
CREATE INDEX "document_version_document_id_version_idx" ON "document_version"("document_id", "version");

-- CreateIndex
CREATE INDEX "controlled_vocabulary_vocabulary_name_code_idx" ON "controlled_vocabulary"("vocabulary_name", "code");

-- CreateIndex
CREATE UNIQUE INDEX "controlled_vocabulary_vocabulary_name_code_version_key" ON "controlled_vocabulary"("vocabulary_name", "code", "version");

-- CreateIndex
CREATE INDEX "cv_dependency_application_type_code_regulatory_activity_type_code_idx" ON "cv_dependency"("application_type_code", "regulatory_activity_type_code");

-- CreateIndex
CREATE INDEX "file_attachment_sequence_node_id_idx" ON "file_attachment"("sequence_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_pdf_analysis_file_attachment_id_key" ON "file_pdf_analysis"("file_attachment_id");

-- CreateIndex
CREATE INDEX "study_sequence_id_idx" ON "study"("sequence_id");

-- CreateIndex
CREATE INDEX "study_sequence_node_id_idx" ON "study"("sequence_node_id");

-- CreateIndex
CREATE INDEX "study_modified_from_id_idx" ON "study"("modified_from_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_sequence_node_id_study_id_key" ON "study"("sequence_node_id", "study_id");

-- CreateIndex
CREATE INDEX "study_category_study_id_idx" ON "study_category"("study_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_category_study_id_name_key" ON "study_category"("study_id", "name");

-- CreateIndex
CREATE INDEX "study_document_study_id_idx" ON "study_document"("study_id");

-- CreateIndex
CREATE INDEX "study_document_file_attachment_id_idx" ON "study_document"("file_attachment_id");

-- CreateIndex
CREATE INDEX "validation_report_sequence_id_idx" ON "validation_report"("sequence_id");

-- CreateIndex
CREATE INDEX "validation_item_report_id_idx" ON "validation_item"("report_id");

-- CreateIndex
CREATE INDEX "validation_item_report_id_severity_idx" ON "validation_item"("report_id", "severity");

-- CreateIndex
CREATE INDEX "comment_sequence_node_id_created_at_idx" ON "comment"("sequence_node_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_log_resource_resource_id_idx" ON "activity_log"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "activity_log_user_id_idx" ON "activity_log"("user_id");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_invitation_token_key" ON "project_invitation"("token");

-- CreateIndex
CREATE INDEX "project_invitation_project_id_idx" ON "project_invitation"("project_id");

-- CreateIndex
CREATE INDEX "project_invitation_email_idx" ON "project_invitation"("email");

-- CreateIndex
CREATE INDEX "project_invitation_token_idx" ON "project_invitation"("token");

-- CreateIndex
CREATE INDEX "node_assignment_node_id_idx" ON "node_assignment"("node_id");

-- CreateIndex
CREATE INDEX "node_assignment_user_id_idx" ON "node_assignment"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "node_assignment_node_id_user_id_key" ON "node_assignment"("node_id", "user_id");

-- CreateIndex
CREATE INDEX "notification_user_id_is_read_idx" ON "notification"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at");

