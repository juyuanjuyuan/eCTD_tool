-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "content_json" JSONB,
    "content_html" TEXT,
    "content_text" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "xml_lang" VARCHAR(10) NOT NULL DEFAULT 'zh',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_version" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content_json" JSONB,
    "content_html" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "xml_lang" VARCHAR(10) NOT NULL DEFAULT 'zh',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_node_id_key" ON "document"("node_id");

-- CreateIndex
CREATE INDEX "document_node_id_idx" ON "document"("node_id");

-- CreateIndex
CREATE INDEX "document_version_document_id_idx" ON "document_version"("document_id");

-- CreateIndex
CREATE INDEX "document_version_document_id_version_idx" ON "document_version"("document_id", "version");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "sequence_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
