# StockFlow — Phase 1 Implementation Report: Security Hardening & Minimum Stock Thresholds

**Document Status:** Complete Implementation & Verification Report  
**Phase:** Phase 1 — Security Hardening & Minimum Stock Thresholds  
**Author:** DeepMind Advanced Agentic Systems  
**Date:** November 2026  
**Target Repository:** `StockFlow (Distributed Inventory & Order Fulfilment Platform)`

---

## Executive Summary

Following the recommendations established in `docs/BUSINESS_FIRST_ARCHITECTURE_AUDIT.md`, Phase 1 has been fully implemented, integrated, and verified across both backend and frontend codebases. 

The primary objectives of this phase were:
1. **Security Hardening**: Close critical authentication and authorization loopholes that previously allowed unauthenticated access and cross-warehouse information leakage across inventory and warehouse endpoints.
2. **Configurable Minimum Stock Thresholds**: Introduce a multi-tier threshold data model (`MinimumStockThreshold`) supporting both organization-wide defaults (`warehouseId = null`) and facility-specific overrides.
3. **Threshold Management API**: Deliver comprehensive, RBAC-protected REST endpoints for threshold lifecycle management and low-stock evaluation queries.
4. **Stock-Threshold Evaluation Engine**: Implement a reusable domain service evaluating available stock against active thresholds after every inventory mutation, correctly adhering to the formula:
   $$\text{availableStock} = \text{quantityOnHand} - \text{quantityReserved}$$
5. **Frontend Modernization**: Eliminate all hardcoded frontend threshold checks (e.g. `available <= 20`), connect dashboards to the dynamic low-stock evaluation API, and provide an administrative/managerial threshold configuration modal.

All changes strictly respect the boundaries of Phase 1: **No ticket subsystems, procurement modules, stock-transfer workflows, or warehouse fulfillment/dispatch mutations have been implemented.**

---

## 1. Files Created and Modified

### 1.1 Backend Files Created
| File Path | Description |
| :--- | :--- |
| `prisma/migrations/20261103193645_add_minimum_stock_threshold/migration.sql` | PostgreSQL DDL migration creating `minimum_stock_thresholds`, foreign keys, cascade rules, and partial unique index. |
| `src/modules/inventory/threshold.service.ts` | Business logic service for threshold CRUD, duplicate prevention, and RBAC facility boundary checks. |
| `src/modules/inventory/threshold-evaluation.service.ts` | Reusable evaluation engine resolving hierarchy (`WAREHOUSE_OVERRIDE` > `GLOBAL_DEFAULT`), computing deficits, and hooking into stock mutations. |
| `tests/thresholds-and-security.test.ts` | Comprehensive automated test suite containing 21 tests verifying security hardening, threshold CRUD, overrides, and evaluation accuracy. |

### 1.2 Backend Files Modified
| File Path | Description of Changes |
| :--- | :--- |
| `prisma/schema.prisma` | Added `MinimumStockThreshold` model, unique constraints, and relation fields on `Product` and `Warehouse`. |
| `src/modules/inventory/inventory.routes.ts` | Replaced `authenticateOptional` with mandatory `authenticate` and `authorize(...)`. Registered `/thresholds` and `/low-stock` routes before dynamic parameter routes (`/:warehouseId`). |
| `src/modules/inventory/inventory.controller.ts` | Added controller actions: `createThreshold`, `getThresholds`, `getThresholdById`, `updateThreshold`, `deleteThreshold`, and `getLowStock`. |
| `src/modules/inventory/inventory.schemas.ts` | Added Zod validation schemas: `createThresholdSchema`, `updateThresholdSchema`, `thresholdQuerySchema`, and `thresholdIdParamSchema`. |
| `src/modules/inventory/inventory.service.ts` | Added defense-in-depth authentication check in `getInventory` and `getInventoryByWarehouse`. Integrated post-restock threshold evaluation hook. |
| `src/modules/warehouses/warehouse.routes.ts` | Replaced `authenticateOptional` with mandatory `authenticate` and `authorize(...)` on warehouse listing and retrieval endpoints. |
| `src/modules/warehouses/warehouse.service.ts` | Added defense-in-depth authentication assertion in `listWarehouses` and `getWarehouseById`. |
| `src/modules/orders/order.service.ts` | Integrated post-mutation threshold evaluation hooks during order creation (reservations placed) and order cancellation (reservations released). |
| `src/modules/payments/payment.service.ts` | Integrated threshold evaluation hooks during payment confirmation (stock decremented) and payment failure (reservations released). |
| `src/modules/reservations/reservation.service.ts` | Integrated threshold evaluation hooks after background stale reservation expiry sweeps. |

### 1.3 Frontend Files Created
| File Path | Description |
| :--- | :--- |
| `frontend/src/features/inventory/ThresholdManagementModal.tsx` | Interactive modal dialog for `ADMIN` and `WAREHOUSE_MANAGER` to view, create, edit, and delete stock thresholds. |

### 1.4 Frontend Files Modified
| File Path | Description of Changes |
| :--- | :--- |
| `frontend/src/types/inventory.ts` | Added TypeScript interfaces: `MinimumStockThreshold`, `LowStockEvaluationItem`, `LowStockResponse`, and threshold mutation payload types. |
| `frontend/src/api/inventory.ts` | Added API client helper functions: `fetchThresholds`, `fetchThresholdById`, `createThreshold`, `updateThreshold`, `deleteThreshold`, and `fetchLowStockEvaluations`. |
| `frontend/src/features/dashboard/LowStockList.tsx` | Replaced hardcoded `available <= 20` filtering with real-time consumption of `/api/v1/inventory/low-stock`. Added override source badges and deficit pills. |
| `frontend/src/features/dashboard/SelectedWarehouseOverview.tsx` | Wired dynamic low-stock counts and added "Stock Thresholds" action button opening the configuration modal. |
| `frontend/src/features/dashboard/MultiWarehouseOverview.tsx` | Replaced hardcoded stock health counters with dynamic evaluation counts from the low-stock service. |
| `frontend/src/pages/DashboardPage.tsx` | Integrated `ThresholdManagementModal` state and event handlers into the main operational dashboard. |

### 1.5 Existing Test Suites Updated (Authorization Alignment)
| File Path | Reason for Update |
| :--- | :--- |
| `tests/warehouses.test.ts` | Updated assertions to supply admin authorization headers for warehouse endpoints. |
| `tests/inventory.test.ts` | Updated assertions to supply authorization headers for inventory aggregation queries. |
| `tests/orders.test.ts` | Updated integration teardown and inventory helper calls to use authorized headers. |
| `tests/payments.test.ts` | Updated pre-checkout inventory seeding and inspection calls to use authorized headers. |
| `tests/idempotency.test.ts` | Updated inventory inspection assertions to use authorized headers. |
| `tests/expiry.test.ts` | Updated inventory ledger inspection calls to use authorized headers. |

---

## 2. Database Schema Changes

### 2.1 Schema Definition (`prisma/schema.prisma`)
The `MinimumStockThreshold` model represents both global defaults and facility overrides:

```prisma
model MinimumStockThreshold {
  id          String   @id @default(uuid())
  productId   String   @map("product_id")
  warehouseId String?  @map("warehouse_id")
  threshold   Int      @map("threshold")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  product   Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  warehouse Warehouse? @relation(fields: [warehouseId], references: [id], onDelete: Cascade)

  @@unique([productId, warehouseId], name: "uq_product_warehouse_threshold")
  @@index([productId], name: "idx_threshold_product_id")
  @@index([warehouseId], name: "idx_threshold_warehouse_id")
  @@map("minimum_stock_thresholds")
}
```

Reverse relations were added to existing models:
- In `Product`: `minimumStockThresholds MinimumStockThreshold[]`
- In `Warehouse`: `minimumStockThresholds MinimumStockThreshold[]`

### 2.2 Migration DDL (`20261103193645_add_minimum_stock_threshold`)
Because standard PostgreSQL treats `NULL != NULL` in standard unique constraints, a partial unique index was explicitly included in the migration SQL to strictly enforce that **only one global default (`warehouse_id IS NULL`) can exist per product**:

```sql
-- CreateTable
CREATE TABLE "minimum_stock_thresholds" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "threshold" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "minimum_stock_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "minimum_stock_thresholds_product_id_warehouse_id_key" ON "minimum_stock_thresholds"("product_id", "warehouse_id");
CREATE INDEX "idx_threshold_product_id" ON "minimum_stock_thresholds"("product_id");
CREATE INDEX "idx_threshold_warehouse_id" ON "minimum_stock_thresholds"("warehouse_id");

-- Enforce partial uniqueness for global defaults (where warehouse_id IS NULL)
CREATE UNIQUE INDEX "idx_threshold_product_global_unique" 
ON "minimum_stock_thresholds"("product_id") 
WHERE "warehouse_id" IS NULL;

-- AddForeignKey
ALTER TABLE "minimum_stock_thresholds" ADD CONSTRAINT "minimum_stock_thresholds_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "minimum_stock_thresholds" ADD CONSTRAINT "minimum_stock_thresholds_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 3. API Endpoints Implemented

All endpoints are mounted under `/api/v1/inventory`.

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/thresholds` | `ADMIN`, `WAREHOUSE_MANAGER` | Create a minimum stock threshold. `ADMIN` can create global or warehouse thresholds. `WAREHOUSE_MANAGER` can only create thresholds for assigned warehouses. |
| `GET` | `/thresholds` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | List configured thresholds. Filters by `productId`, `warehouseId`, or `globalOnly`. Scoped to assigned facilities for staff/managers. |
| `GET` | `/thresholds/:id` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | Retrieve a single threshold record by ID. |
| `PUT` | `/thresholds/:id` | `ADMIN`, `WAREHOUSE_MANAGER` | Update threshold quantity. Managers cannot alter thresholds for unassigned facilities or modify global defaults. |
| `DELETE` | `/thresholds/:id` | `ADMIN`, `WAREHOUSE_MANAGER` | Remove a threshold. Managers cannot delete thresholds for unassigned facilities or delete global defaults. |
| `GET` | `/low-stock` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | Query active low-stock evaluation across warehouses. Computes deficits against the resolved threshold hierarchy. |

### 3.1 Endpoint Request & Response Shapes

#### `POST /api/v1/inventory/thresholds`
- **Request Body**:
  ```json
  {
    "productId": "7b2cfca7-8f5c-4d3b-9e23-7fa523fbb001",
    "warehouseId": "91a27e08-e7c6-4d2b-a19e-df1a684b3910", // optional, null for global default
    "threshold": 30
  }
  ```
- **Response (HTTP 201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "c9281a8b-18a3-4a37-b64d-5c8e4414bc90",
      "productId": "7b2cfca7-8f5c-4d3b-9e23-7fa523fbb001",
      "warehouseId": "91a27e08-e7c6-4d2b-a19e-df1a684b3910",
      "threshold": 30,
      "createdAt": "2026-11-03T20:15:00.000Z",
      "updatedAt": "2026-11-03T20:15:00.000Z",
      "product": { "id": "...", "name": "Industrial Widget", "sku": "SKU-IND-01" },
      "warehouse": { "id": "...", "name": "Central Depot", "code": "WH-CENTRAL" }
    }
  }
  ```
- **Error Codes**: `400 Bad Request` (validation failed), `401 Unauthorized`, `403 Forbidden` (unassigned facility or manager creating global default), `404 Not Found` (product or warehouse does not exist), `409 Conflict` (threshold already exists for product/warehouse).

#### `GET /api/v1/inventory/low-stock`
- **Query Parameters**:
  - `warehouseId` (optional UUID): Filter evaluation to a specific warehouse.
  - `productId` (optional UUID): Filter evaluation to a specific product.
- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "productId": "7b2cfca7-8f5c-4d3b-9e23-7fa523fbb001",
        "productName": "Industrial Widget",
        "productSku": "SKU-IND-01",
        "warehouseId": "91a27e08-e7c6-4d2b-a19e-df1a684b3910",
        "warehouseName": "Central Depot",
        "warehouseCode": "WH-CENTRAL",
        "quantityOnHand": 25,
        "quantityReserved": 10,
        "availableStock": 15,
        "threshold": 30,
        "source": "WAREHOUSE_OVERRIDE",
        "deficit": 15,
        "isLowStock": true
      }
    ],
    "count": 1
  }
  ```

---

## 4. Security Hardening Applied

### 4.1 Elimination of `authenticateOptional`
Previously, `inventory.routes.ts` and `warehouse.routes.ts` applied `authenticateOptional` to GET endpoints. When an unauthenticated client invoked `GET /api/v1/inventory` or `GET /api/v1/warehouses`, Express set `req.user = undefined`, allowing unauthenticated actors to harvest warehouse metadata and full stock breakdowns.

This has been rectified by enforcing mandatory authentication and role boundaries:

```typescript
// src/modules/inventory/inventory.routes.ts
router.get('/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  inventoryController.getInventory
);

// src/modules/warehouses/warehouse.routes.ts
router.get('/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  warehouseController.listWarehouses
);
```

### 4.2 Defense-in-Depth Layering
Even if route middleware is misconfigured or bypassed, domain service layers now enforce authentication:
- In `InventoryService.getInventory(user)` and `getInventoryByWarehouse(user, warehouseId)`:
  ```typescript
  if (!user) {
    throw new UnauthorizedError('Authentication is required to view inventory ledgers', 'AUTH_REQUIRED');
  }
  ```
- In `WarehouseService.listWarehouses(user)` and `getWarehouseById(user, id)`:
  ```typescript
  if (!user) {
    throw new UnauthorizedError('Authentication is required to view warehouses', 'AUTH_REQUIRED');
  }
  ```

### 4.3 Role-Based Access Control (RBAC) Matrix
| Actor | Storefront Product Catalog (`/products`) | Internal Warehouse Listing (`/warehouses`) | Internal Stock Ledgers (`/inventory`) | Manage Global Defaults | Manage Assigned Facility Thresholds | Manage Other Facility Thresholds |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Anonymous / Public** | Allowed | Denied (`401`) | Denied (`401`) | Denied (`401`) | Denied (`401`) | Denied (`401`) |
| **CUSTOMER** | Allowed | Denied (`403`) | Denied (`403`) | Denied (`403`) | Denied (`403`) | Denied (`403`) |
| **WAREHOUSE_STAFF** | Allowed | Scoped to Assigned Facilities | Scoped to Assigned Facilities | Denied (`403`) | Denied (`403`) | Denied (`403`) |
| **WAREHOUSE_MANAGER** | Allowed | Scoped to Assigned Facilities | Scoped to Assigned Facilities | Denied (`403`) | **Allowed** | Denied (`403`) |
| **ADMIN** | Allowed | Organisation-Wide (All) | Organisation-Wide (All) | **Allowed** | **Allowed** | **Allowed** |

---

## 5. Threshold Evaluation Logic

### 5.1 Stock Availability Formula
The evaluation strictly uses real-time available stock:
$$\text{availableStock} = \text{quantityOnHand} - \text{quantityReserved}$$

An item is classified as low stock if and only if:
$$\text{availableStock} < \text{minimumStockThreshold}$$

The deficit is calculated as:
$$\text{deficit} = \max(0, \text{minimumStockThreshold} - \text{availableStock})$$

If available stock is equal to or greater than the threshold, `isLowStock = false` and `deficit = 0`.

### 5.2 Resolution Hierarchy
When evaluating a product at a specific warehouse:
1. **Tier 1 (Warehouse Override):** Look for a `MinimumStockThreshold` record where `productId = P` and `warehouseId = W`. If present, this threshold takes absolute precedence (`source = 'WAREHOUSE_OVERRIDE'`).
2. **Tier 2 (Global Default):** If no warehouse-specific record exists, look for a `MinimumStockThreshold` where `productId = P` and `warehouseId IS NULL`. If present, this applies (`source = 'GLOBAL_DEFAULT'`).
3. **Fallback:** If neither exists, no threshold is configured. Stock is not flagged as low (`isLowStock = false`).

### 5.3 Inventory Mutation Hooks
`ThresholdEvaluationService.evaluateStockAfterChange(productId, warehouseId)` was integrated non-intrusively across the platform's mutation points:
1. **Restock (`InventoryService.restockInventory`)**: Evaluated immediately after physical restock commits.
2. **Order Placement (`OrderService.createOrder`)**: Evaluated for every line item warehouse after order reservations are committed.
3. **Order Cancellation (`OrderService.cancelOrder`)**: Evaluated after reservations are released.
4. **Reservation Expiry (`ReservationService.expireStaleReservations`)**: Evaluated after expired reservations are returned to available inventory.
5. **Payment Confirmation (`PaymentService.confirmPayment`)**: Evaluated after reservations are converted into permanent deductions from physical stock.
6. **Payment Decline (`PaymentService.handleFailedPayment`)**: Evaluated after reservations are safely unreserved.

*Safe Logging Guarantee:* In accordance with Phase 1 constraints, `evaluateStockAfterChange` logs warnings and returns structured evaluation results. It **does not** generate tickets, dispatch emails, or call external notification services.

---

## 6. Frontend Changes

### 6.1 Elimination of Hardcoded Thresholds
Previously, the frontend applied an arbitrary heuristic:
```typescript
// Legacy: frontend/src/features/dashboard/LowStockList.tsx
const lowStock = inventory.filter(item => (item.quantity - item.reserved) <= 20);
```

This heuristic has been removed from all frontend components:
- `LowStockList.tsx`: Replaced with `fetchLowStockEvaluations()`. Shows exact configured thresholds, deficit count, and source (`Warehouse Override` vs `Global Default`).
- `SelectedWarehouseOverview.tsx`: Stock alerts card now reflects real-time low-stock counts from the server rather than hardcoded heuristics.
- `MultiWarehouseOverview.tsx`: Inventory health statistics reflect configured thresholds.

### 6.2 Threshold Management Modal (`ThresholdManagementModal.tsx`)
A new modal component was created and integrated into the primary dashboard:
- **Role-Gated Actions:** `ADMIN` users can toggle between configuring Organization-wide Global Defaults or Warehouse-specific overrides. `WAREHOUSE_MANAGER` users are scoped directly to configuring overrides for their assigned facility.
- **Form Controls:** Product dropdown, threshold input (positive integer validation), and clear source labels.
- **Table of Active Thresholds:** Displays product SKU, product name, target facility, threshold quantity, and direct edit/delete actions.

---

## 7. Automated Test Execution & Verification

### 7.1 New Test Suite (`tests/thresholds-and-security.test.ts`)
A dedicated suite covering 21 integration tests was executed against a live test database:
- **Security Hardening (6 tests):**
  - Rejects unauthenticated queries on `/api/v1/inventory` with HTTP 401.
  - Rejects unauthenticated queries on `/api/v1/warehouses` with HTTP 401.
  - Denies `CUSTOMER` role from internal inventory and warehouse endpoints with HTTP 403.
  - Permits `WAREHOUSE_MANAGER` to access assigned facilities while denying unassigned facilities with HTTP 403.
  - Grants `ADMIN` complete access across all facilities and inventory.
  - Preserves public access to `/api/v1/products` for customers while protecting inventory ledgers.
- **Threshold CRUD & RBAC (9 tests):**
  - Allows `ADMIN` to create global defaults (`warehouseId = null`).
  - Forbids `WAREHOUSE_MANAGER` from creating global defaults with HTTP 403.
  - Allows `WAREHOUSE_MANAGER` to create warehouse-specific overrides for assigned facilities.
  - Denies `WAREHOUSE_MANAGER` from creating thresholds for unassigned facilities with HTTP 403.
  - Forbids `WAREHOUSE_STAFF` from creating or modifying thresholds with HTTP 403.
  - Rejects duplicate thresholds for the same product and warehouse with HTTP 409 Conflict.
  - Rejects duplicate global defaults for the same product with HTTP 409 Conflict.
  - Validates positive integers and valid product UUIDs (returns HTTP 400/404 on invalid input).
  - Verifies full threshold lifecycle: list, get by ID, update, and delete.
- **Threshold Evaluation Engine (6 tests):**
  - Prioritizes warehouse override over global default.
  - Confirms stock above threshold is healthy (`isLowStock = false`).
  - Confirms stock equal to threshold is healthy (`isLowStock = false`).
  - Confirms stock below threshold is low stock with correct deficit (`isLowStock = true`).
  - Confirms reservation release restores availability and clears low-stock condition.
  - Handles multi-warehouse independent evaluations via `GET /api/v1/inventory/low-stock`.

### 7.2 Full Regression Test Suite Results
The entire test suite across all 22 test files was executed via Jest:

```
Test Suites: 22 passed, 22 total
Tests:       199 passed, 199 total
Snapshots:   0 total
Time:        44.72 s
```

### 7.3 Frontend Production Build Verification
The frontend TypeScript build was compiled and verified:
```bash
npm --prefix frontend run build
```
- **Output:** Built cleanly with zero TypeScript errors or ESLint warnings (`dist/` generated).

---

## 8. Database Migration Status

1. **Local Environment**:
   - Migration `20261103193645_add_minimum_stock_threshold` applied successfully.
   - Database schema is synchronized with `schema.prisma`.
   - Prisma Client generated cleanly.
2. **Production Deployment**:
   - To apply this migration to production environments (e.g. Neon PostgreSQL), execute:
     ```bash
     npx prisma migrate deploy
     ```
   - *Safety Note:* This migration is strictly additive. It creates the `minimum_stock_thresholds` table and partial unique indexes. No existing tables, columns, or data are dropped or altered.

---

## 9. Known Limitations & Deferred Work

In strict accordance with the Phase 1 scope instructions:
1. **Ticket System (Deferred to Phase 2):**
   - When a stock threshold is breached, the system currently logs a structured warning and flags the item in `GET /api/v1/inventory/low-stock`.
   - Automatic generation of replenishment tickets, ticket assignment, and ticket resolution workflows will be implemented in Phase 2.
2. **Order Shortage Decision Workflow (Deferred to Phase 2):**
   - When an order cannot be completely filled by a single warehouse, orders currently continue to follow the existing policy (`INSUFFICIENT_STOCK`).
   - Partial allocation, shortage ticket creation, and customer decision workflows (split shipment, wait, or cancel) belong to Phase 2.
3. **Physical Stock Deduction Timing (Deferred to Phase 3/4):**
   - Stock deduction currently occurs upon payment confirmation (`quantityOnHand` decremented in `payment.service.ts`).
   - Aligning physical deduction with warehouse floor dispatch (`SHIPPED`) will be addressed alongside the warehouse fulfillment dispatch workflow.

---

## 10. Explicit Confirmation of Scope Boundaries

We explicitly confirm that during this Phase 1 implementation:
- **NO** ticket or issue tracking subsystem was created.
- **NO** procurement or purchase order (PO) workflow was created.
- **NO** inter-warehouse stock transfer system was created.
- **NO** changes were made to warehouse packing, fulfillment, or shipping dispatch lifecycles.

Phase 1 has established a hardened security perimeter, a multi-tier threshold data model, and an accurate, test-verified stock threshold evaluation engine.

