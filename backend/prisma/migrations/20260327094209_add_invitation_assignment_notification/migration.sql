-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NodePermission" AS ENUM ('EDIT', 'REVIEW', 'VIEW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITATION', 'ASSIGNMENT', 'MENTION', 'APPROVAL_SUBMITTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'COMMENT', 'LOCK_FORCE_RELEASED', 'MEMBER_ROLE_CHANGED', 'OWNERSHIP_TRANSFERRED');

-- CreateTable
CREATE TABLE "project_invitation" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "invited_by" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_assignment" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "NodePermission" NOT NULL DEFAULT 'EDIT',
    "assigned_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "project_id" TEXT,
    "resource_type" VARCHAR(50),
    "resource_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_assignment" ADD CONSTRAINT "node_assignment_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "sequence_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_assignment" ADD CONSTRAINT "node_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_assignment" ADD CONSTRAINT "node_assignment_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
