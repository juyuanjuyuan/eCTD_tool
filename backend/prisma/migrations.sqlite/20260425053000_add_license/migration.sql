-- CreateTable
CREATE TABLE "license" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "issued_at" DATETIME NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "nonce" TEXT NOT NULL,
    "activated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "license_code_key" ON "license"("code");

-- CreateIndex
CREATE INDEX "license_is_active_idx" ON "license"("is_active");

-- CreateIndex
CREATE INDEX "license_expires_at_idx" ON "license"("expires_at");
