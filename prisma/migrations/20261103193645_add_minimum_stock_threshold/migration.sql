-- CreateTable
CREATE TABLE "minimum_stock_thresholds" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "min_quantity" INTEGER NOT NULL DEFAULT 10,
    "reorder_quantity" INTEGER DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "minimum_stock_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_threshold_product" ON "minimum_stock_thresholds"("product_id");

-- CreateIndex
CREATE INDEX "idx_threshold_warehouse" ON "minimum_stock_thresholds"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_threshold_product_warehouse" ON "minimum_stock_thresholds"("product_id", "warehouse_id");

-- CreateIndex (Partial unique index enforcing exactly one global default threshold per product)
CREATE UNIQUE INDEX "idx_threshold_product_global_unique" ON "minimum_stock_thresholds"("product_id") WHERE "warehouse_id" IS NULL;

-- AddForeignKey
ALTER TABLE "minimum_stock_thresholds" ADD CONSTRAINT "minimum_stock_thresholds_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minimum_stock_thresholds" ADD CONSTRAINT "minimum_stock_thresholds_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
