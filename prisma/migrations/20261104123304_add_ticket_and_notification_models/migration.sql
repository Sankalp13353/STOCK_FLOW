-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('ORDER_SHORTAGE', 'CUSTOMER_DECISION', 'LOW_STOCK');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'CLOSED', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CustomerDecision" AS ENUM ('PENDING', 'ACCEPTED_PARTIAL', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_SHORTAGE', 'CUSTOMER_DECISION_REQUIRED', 'LOW_STOCK_ALERT', 'TICKET_ASSIGNED', 'TICKET_RESOLVED', 'ORDER_APPROVED', 'ORDER_REJECTED');

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "ticket_number" VARCHAR(50) NOT NULL,
    "type" "TicketType" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "order_id" UUID,
    "customer_id" UUID,
    "product_id" UUID,
    "warehouse_id" UUID,
    "requested_quantity" INTEGER,
    "available_quantity" INTEGER,
    "shortage_quantity" INTEGER,
    "quantity_offered" INTEGER,
    "threshold_quantity" INTEGER,
    "deficit_quantity" INTEGER,
    "customer_decision" "CustomerDecision",
    "decision_deadline" TIMESTAMPTZ,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "assigned_to_user_id" UUID,
    "parent_ticket_id" UUID,
    "resolution_notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ticket_id" UUID,
    "order_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "dedup_key" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_tickets_ticket_number" ON "tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "idx_tickets_type_status" ON "tickets"("type", "status");

-- CreateIndex
CREATE INDEX "idx_tickets_order_id" ON "tickets"("order_id");

-- CreateIndex
CREATE INDEX "idx_tickets_customer_id" ON "tickets"("customer_id");

-- CreateIndex
CREATE INDEX "idx_tickets_prod_wh" ON "tickets"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "idx_tickets_assigned_user" ON "tickets"("assigned_to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_notifications_dedup" ON "notifications"("dedup_key");

-- CreateIndex
CREATE INDEX "idx_notifications_user_unread" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_user_created" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_ticket_id_fkey" FOREIGN KEY ("parent_ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
