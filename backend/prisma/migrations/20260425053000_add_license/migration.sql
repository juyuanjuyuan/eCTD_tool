-- CreateTable
CREATE TABLE "license" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customer" VARCHAR(200) NOT NULL,
    "machine_id" VARCHAR(64) NOT NULL,
    "issued_at" DATE NOT NULL,
    "expires_at" DATE NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "license_code_key" ON "license"("code");

-- CreateIndex
CREATE INDEX "license_is_active_idx" ON "license"("is_active");

-- CreateIndex
CREATE INDEX "license_expires_at_idx" ON "license"("expires_at");
