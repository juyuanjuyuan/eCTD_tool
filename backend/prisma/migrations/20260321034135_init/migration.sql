-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('DRAFT', 'EDITING', 'VALIDATING', 'EXPORTED', 'SUBMITTED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "role" "Role" NOT NULL DEFAULT 'EDITOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "application_number" VARCHAR(15) NOT NULL,
    "application_type_code" VARCHAR(10) NOT NULL,
    "application_type_version" VARCHAR(10) NOT NULL,
    "product_type_code" VARCHAR(10) NOT NULL,
    "product_type_version" VARCHAR(10) NOT NULL,
    "product_number" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_activity" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "regulatory_activity_type_code" VARCHAR(10) NOT NULL,
    "regulatory_activity_type_version" VARCHAR(10) NOT NULL,
    "related_sequence" CHAR(4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence" (
    "id" TEXT NOT NULL,
    "regulatory_activity_id" TEXT NOT NULL,
    "sequence_number" CHAR(4) NOT NULL,
    "sequence_type_code" VARCHAR(10) NOT NULL,
    "sequence_type_version" VARCHAR(10) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "contact_name" VARCHAR(100) NOT NULL,
    "contact_phone" VARCHAR(20) NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controlled_vocabulary" (
    "id" TEXT NOT NULL,
    "vocabulary_name" VARCHAR(50) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "version" VARCHAR(10) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "description_zh" VARCHAR(200) NOT NULL,
    "description_en" VARCHAR(200) NOT NULL,

    CONSTRAINT "controlled_vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_dependency" (
    "id" TEXT NOT NULL,
    "application_type_code" VARCHAR(10) NOT NULL,
    "regulatory_activity_type_code" VARCHAR(10) NOT NULL,
    "sequence_type_code" VARCHAR(10),
    "version" VARCHAR(10) NOT NULL,

    CONSTRAINT "cv_dependency_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "sequence_regulatory_activity_id_idx" ON "sequence"("regulatory_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_regulatory_activity_id_sequence_number_key" ON "sequence"("regulatory_activity_id", "sequence_number");

-- CreateIndex
CREATE INDEX "controlled_vocabulary_vocabulary_name_code_idx" ON "controlled_vocabulary"("vocabulary_name", "code");

-- CreateIndex
CREATE UNIQUE INDEX "controlled_vocabulary_vocabulary_name_code_version_key" ON "controlled_vocabulary"("vocabulary_name", "code", "version");

-- CreateIndex
CREATE INDEX "cv_dependency_application_type_code_regulatory_activity_typ_idx" ON "cv_dependency"("application_type_code", "regulatory_activity_type_code");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_activity" ADD CONSTRAINT "regulatory_activity_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence" ADD CONSTRAINT "sequence_regulatory_activity_id_fkey" FOREIGN KEY ("regulatory_activity_id") REFERENCES "regulatory_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
