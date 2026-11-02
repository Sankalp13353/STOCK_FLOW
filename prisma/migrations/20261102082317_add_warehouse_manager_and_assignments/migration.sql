-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'WAREHOUSE_MANAGER';

-- CreateTable
CREATE TABLE "user_warehouse_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "role" "UserRole",
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_warehouse_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_user_warehouse_user" ON "user_warehouse_assignments"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_warehouse_warehouse" ON "user_warehouse_assignments"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_warehouse" ON "user_warehouse_assignments"("user_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "user_warehouse_assignments" ADD CONSTRAINT "user_warehouse_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_warehouse_assignments" ADD CONSTRAINT "user_warehouse_assignments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
