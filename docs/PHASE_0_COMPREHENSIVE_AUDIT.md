# StockFlow — Phase 0: Comprehensive Product & Engineering Audit Report

**Audit Mode:** Strictly Read-Only  
**Audit Date:** November 4, 2026  
**Audited Target:** StockFlow Enterprise Multi-Warehouse Inventory & Order Fulfilment Platform  
**Target Environments:** Neon PostgreSQL Cloud Database (`neondb`) & Isolated Local Test Database (`stockflow_test_db`)  

---

## 1. Executive Summary

StockFlow is transitioning from a traditional e-commerce CRUD structure into a **Business-First Multi-Warehouse Inventory, Warehouse Operations, and Order Fulfilment Platform**. 

This comprehensive audit evaluates the current frontend, backend, database schema, event bus, and test infrastructure against the intended real-world operational workflows.

### Key Audit Findings

1. **Premature Physical Stock Deduction (Critical Architectural Defect):**  
   In [`src/modules/payments/payment.service.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/payments/payment.service.ts#L99), physical stock on hand (`quantityOnHand`) is decremented immediately upon payment confirmation (`OrderStatus.CONFIRMED`). Physical inventory is thus deducted before any warehouse pick, pack, or dispatch action occurs. Furthermore, there are zero endpoints or workflows to transition orders from `CONFIRMED` to `PROCESSING`, `SHIPPED`, or `DELIVERED`.
2. **Missing Warehouse Order Management in Frontend (High):**  
   For administrative and operational roles (`ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF`), navigating to `/orders` displays a static placeholder card ([`PlaceholderPages.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/PlaceholderPages.tsx#L143-L163)). Facility managers cannot view, search, or fulfill customer orders from the web portal.
3. **Missing Standalone Inventory & Movement Ledger UI (High):**  
   While stock restock and threshold management exist as modals on the Dashboard, the dedicated `/inventory` route remains a placeholder card. There is no ledger viewer for `inventory_movements`, and no backend API exists to query historical stock ledger movements.
4. **Missing User & Staff Administration Interface (High):**  
   The backend possesses complete RBAC endpoints for user listing, role patching, and warehouse assignment ([`src/modules/users/user.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/users/user.routes.ts)), but the frontend has zero API clients and zero UI in `/settings` or `/warehouses` to assign staff to facilities.
5. **Database Migration Discrepancy (Neon Cloud vs. Local Test DB):**  
   The local test database (`stockflow_test_db`) contains all 7 migrations. The active Neon cloud database (`neondb`) has only applied migrations 1–5, missing `minimum_stock_thresholds`, `tickets`, and `notifications`.
6. **Frontend Test Coverage:**  
   Backend test coverage is mature with 24 suites and 230+ tests. Frontend automated test coverage is **0%** (no testing framework installed in `frontend/package.json`).

---

## 2. Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        StockFlow Architecture                          │
└────────────────────────────────────────────────────────────────────────┘

 [ React 18 + Vite Frontend ]
       │
       │ HTTP / REST (JWT in Authorization Bearer)
       ▼
 [ Express.js TypeScript Backend API (Port 4000) ]
       │
       ├── Auth & RBAC Middleware (ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF, CUSTOMER)
       ├── Domain Modules: Auth, Users, Products, Warehouses, Inventory, Orders, Payments, Tickets, Notifications
       │
       ├── PostgreSQL via Prisma ORM (Canonical row locking: SELECT ... FOR UPDATE)
       │     ├── Primary Cloud DB: Neon PostgreSQL (ep-icy-mode-...neon.tech)
       │     └── Local Test DB: stockflow_test_db (127.0.0.1:5432)
       │
       ├── Redis 7 (Rate Limiting, Cache, Distributed Idempotency Locks)
       │
       └── RabbitMQ + Transactional Outbox Pattern
             ├── Outbox Table (outbox_events) ──► Polling Worker (worker.ts)
             └── Topic Exchange (stockflow.events) ──► Queues + Dead Letter Queues (DLQ)
```

---

## 3. Frontend Module-by-Module Assessment

Each page was evaluated for data connectivity, error handling, role-based visibility, and workflow completion.

| Route / Page | Classification | Analysis & Status |
| :--- | :---: | :--- |
| **`/dashboard`**<br>([`DashboardPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/DashboardPage.tsx)) | **1. Fully Functional** | Dynamic multi-warehouse selector, live inventory aggregations, facility KPI cards, atomic Restock Modal, Threshold Configuration Modal, reservation expiration sweep, and 403 access revocation handling. Customers see a customized storefront portal. |
| **`/products`**<br>([`ProductsPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/ProductsPage.tsx)) | **1. Fully Functional** | Staff see paginated data table, debounce search, status filtering, and modal dialogues for Create, Edit, Delete, and SKU drill-down. Customers see the wholesale storefront catalog view. |
| **`/inventory`**<br>([`PlaceholderPages.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/PlaceholderPages.tsx#L103)) | **4. Placeholder** | Renders a static card displaying "Phase 2 Scope". No standalone data table, no multi-facility inventory ledger, and no stock movement audit view. |
| **`/warehouses`**<br>([`WarehousesPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/WarehousesPage.tsx)) | **2. Partially Functional** | Facility listing, location search, and warehouse detail modal with physical/reserved/available stock counts are functional. Admin creation modal is functional. **Missing:** Manager and staff assignment interfaces. |
| **`/orders` (Non-Customer)**<br>([`PlaceholderPages.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/PlaceholderPages.tsx#L143)) | **4. Placeholder** | For `ADMIN`, `WAREHOUSE_MANAGER`, and `WAREHOUSE_STAFF`, `/orders` renders a static placeholder card. Operational staff cannot view, filter, or process orders. |
| **`/orders` (Customer)**<br>([`MyOrdersPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/MyOrdersPage.tsx)) | **1. Fully Functional** | Customers see their personal orders, status badges (`PENDING`, `CONFIRMED`, `CANCELLED`), order item previews, and tracking navigation. |
| **`/orders/:id`**<br>([`OrderTrackingPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/OrderTrackingPage.tsx)) | **1. Fully Functional** | Itemized pricing, warehouse assignment display, cancellation trigger, payment simulation modal, and interactive Customer Partial Decision actions (`ACCEPT_PARTIAL` / `REJECT_PARTIAL`). |
| **`/tickets`**<br>([`TicketsPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/TicketsPage.tsx)) | **2. Partially Functional** | Filter tabs (`ORDER_SHORTAGE`, `LOW_STOCK`, `PENDING_APPROVAL`), priority filters, and modal dialogues for Manager Approval, Rejection, and Resolution notes. **Fails against Neon** because tickets table has not been migrated to Neon. |
| **`/settings`**<br>([`PlaceholderPages.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/PlaceholderPages.tsx#L165)) | **4. Placeholder** | Static placeholder card. No user management, role modification, or account configuration. |
| **`/cart` & `/checkout`**<br>([`CartPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/CartPage.tsx), [`CheckoutPage.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/pages/CheckoutPage.tsx)) | **1. Fully Functional** | Local cart persistence, multi-item validation, address formatting, and atomic order creation with client-generated idempotency keys. |
| **Header Notification Bell**<br>([`Header.tsx`](file:///Users/sankalp/Desktop/SDE_PRO_1/frontend/src/components/layout/Header.tsx)) | **2. Partially Functional** | Dropdown with unread badge count, mark-as-read, and mark-all-read. Fails against Neon due to missing notifications table. |

---

## 4. Backend Module-by-Module Assessment

### 4.1 Authentication & RBAC Engine
* **Routes:** [`src/modules/auth/auth.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/auth/auth.routes.ts)
* **Middlewares:** `authenticate`, `authorize(...roles)` in [`src/common/middlewares/auth.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/common/middlewares/auth.ts).
* **Evaluation:** Strong. Registration enforces `CUSTOMER` role. Privileged accounts are provisioned exclusively via CLI scripts (`npm run admin:bootstrap` and `npm run admin:create`). Password hashing uses bcrypt with 10 salt rounds.

### 4.2 User & Facility Assignment Management
* **Routes:** [`src/modules/users/user.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/users/user.routes.ts)
* **Service:** [`src/modules/users/user.service.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/users/user.service.ts)
* **Evaluation:** Complete on backend. Supports listing users by role, updating user roles (`PATCH /api/v1/users/:id/role`), assigning warehouses (`POST /api/v1/users/:id/warehouses`), and revoking assignments. Completely orphaned from the frontend.

### 4.3 Products Module
* **Routes:** [`src/modules/products/product.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/products/product.routes.ts)
* **Evaluation:** Full CRUD with SKU uniqueness enforcement, pagination, active/inactive toggling, and Redis caching with invalidation hooks.

### 4.4 Warehouses Module & Facility Access Service
* **Routes:** [`src/modules/warehouses/warehouse.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/warehouses/warehouse.routes.ts)
* **Service:** [`src/modules/warehouses/warehouse-access.service.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/warehouses/warehouse-access.service.ts)
* **Evaluation:** High quality. Implements `hasWarehouseAccess`, `ensureWarehouseAccess`, and `getAccessibleWarehouseIds`. Admins receive wildcard `'ALL'` access; managers and staff are strictly restricted to assigned facilities.

### 4.5 Inventory & Threshold Evaluation Module
* **Routes:** [`src/modules/inventory/inventory.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/inventory/inventory.routes.ts)
* **Services:** `inventory.service.ts`, `threshold.service.ts`, `threshold-evaluation.service.ts`.
* **Evaluation:**
  - Restocking uses canonical row locking (`SELECT id FROM inventory ... FOR UPDATE`) and creates `inventory_movements` records.
  - Threshold engine resolves warehouse override > global default > none. Automatically evaluates stock upon restock and reservation changes.
  - **Defect:** No endpoint exists to query `inventory_movements` (stock movement ledger).

### 4.6 Orders & Concurrency Protection
* **Routes:** [`src/modules/orders/order.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/orders/order.routes.ts)
* **Service:** [`src/modules/orders/order.service.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/orders/order.service.ts)
* **Evaluation:**
  - Row locking: `SELECT id FROM inventory WHERE id = ANY(...) ORDER BY id ASC FOR UPDATE` prevents deadlocks.
  - Two-phase stock reservation: Checks `quantityOnHand - quantityReserved >= requested`.
  - Shortage branching: Splits orders across warehouses or creates linked `ORDER_SHORTAGE` and `CUSTOMER_DECISION` tickets.
  - **Defect:** No fulfillment endpoints exist. Statuses `PROCESSING`, `SHIPPED`, and `DELIVERED` are never assigned.

### 4.7 Payments & Physical Stock Lifecycle Defect
* **Routes:** [`src/modules/payments/payment.routes.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/payments/payment.routes.ts)
* **Service:** [`src/modules/payments/payment.service.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/src/modules/payments/payment.service.ts)
* **CRITICAL DEFECT:** In `payment.service.ts` (lines 98–101):
  ```typescript
  await tx.inventory.update({
    where: { id: res.inventoryId },
    data: {
      quantityOnHand: { decrement: res.quantity },
      quantityReserved: { decrement: res.quantity },
    },
  });
  ```
  Physical stock on hand (`quantityOnHand`) is decremented when the payment succeeds. This confuses reservation commitment with physical dispatch. The stock should remain in `quantityOnHand` until warehouse staff physically dispatch the package.

### 4.8 Tickets & Notifications Engine
* **Routes:** `src/modules/tickets/ticket.routes.ts`, `src/modules/notifications/notification.routes.ts`
* **Services:** `ticket.service.ts`, `notification.service.ts`
* **Evaluation:** Complete domain logic with manager approval, customer decisions, and low-stock auto-resolution. However, database tables do not exist in Neon.

### 4.9 Infrastructure & Event Bus
* **Outbox Pattern:** Transactional outbox with `outbox-publisher.worker.ts` polling and publishing to RabbitMQ with publisher confirms.
* **RabbitMQ Topology:** Exchange `stockflow.events`, durable queues with Dead-Letter Exchanges (`stockflow.dlx`).
* **Redis:** Caching of product/warehouse reads; sliding window rate limiter in `rate-limiter.middleware.ts`.

---

## 5. Database & Migration Status

### Comparison Table

| Migration | Scope | Local Test DB (`stockflow_test_db`) | Live Neon DB (`neondb`) |
| :--- | :--- | :---: | :---: |
| `20261031135449_init_phase2_schema` | Core schema (users, products, warehouses, inventory) | Applied | Applied |
| `20261031163848_add_order_and_concurrency_models` | Orders, order items, reservations, payments | Applied | Applied |
| `20261101083829_add_outbox_and_processed_events` | Outbox pattern and idempotency records | Applied | Applied |
| `20261101095622_fix_consumer_recovery_and_event_ordering` | Consumer recovery indexing | Applied | Applied |
| `20261102082317_add_warehouse_manager_and_assignments` | User-warehouse assignments and RBAC roles | Applied | Applied |
| `20261103193645_add_minimum_stock_threshold` | Table `minimum_stock_thresholds` | Applied | ❌ **Pending** |
| `20261104123304_add_ticket_and_notification_models` | Tables `tickets` and `notifications` | Applied | ❌ **Pending** |

### Schema Verification
* **Local Test DB:** 17 public tables, 7 migrations applied. Matches [`prisma/schema.prisma`](file:///Users/sankalp/Desktop/SDE_PRO_1/prisma/schema.prisma) completely.
* **Neon DB:** 14 public tables, 5 migrations applied. Missing `minimum_stock_thresholds`, `tickets`, `notifications`.
* **Discrepancy Resolution:** Executing `npx prisma migrate deploy` against Neon will bring Neon to 100% parity safely (all pending operations are non-destructive additions).

---

## 6. Business Workflow Assessment

### Workflow A: Normal Order & Fulfilment
* **Workflow:** Customer places order $\rightarrow$ availability checked across warehouses $\rightarrow$ stock reserved atomically $\rightarrow$ payment processed $\rightarrow$ order confirmed $\rightarrow$ warehouse fulfills and dispatches $\rightarrow$ physical stock deducted.
* **Current State:** **Partially Broken.**
  - Available stock verification and atomic reservation work with canonical row locking.
  - Payment processing confirms order.
  - **Failure:** Physical stock is deducted at payment time rather than at dispatch time. There is no pick/pack/dispatch operation. Orders stall at `CONFIRMED`.

### Workflow B: Insufficient Stock & Shortage Governance
* **Workflow:** Order placed $\rightarrow$ insufficient stock detected $\rightarrow$ `ORDER_SHORTAGE` and `CUSTOMER_DECISION` tickets created $\rightarrow$ customer accepts/rejects partial fulfillment $\rightarrow$ manager approves $\rightarrow$ stock rechecked and reserved.
* **Current State:** **Fully Implemented in Code, Blocked in Neon.**
  - `order.service.ts` and `ticket.service.ts` implement the two-ticket linkage, canonical re-locking in `finalizeShortageOrderReservation`, and outbox event publishing.
  - Blocked in Neon because `tickets` and `notifications` tables have not been deployed.

### Workflow C: Minimum Stock & Replenishment
* **Workflow:** Stock changes $\rightarrow$ available quantity evaluated against threshold $\rightarrow$ low-stock ticket created $\rightarrow$ notifications sent $\rightarrow$ stock replenished $\rightarrow$ ticket auto-resolved.
* **Current State:** **Fully Implemented in Code, Blocked in Neon.**
  - `threshold-evaluation.service.ts` automatically evaluates stock after restock and reservation hold/release, and resolves tickets upon recovery.
  - Blocked in Neon due to pending migrations 6 and 7.

### Workflow D: Warehouse Operations & RBAC
* **Workflow:** Admin creates warehouses $\rightarrow$ assigns managers and staff $\rightarrow$ managers access assigned facilities $\rightarrow$ staff perform permitted tasks $\rightarrow$ Admin maintains org-wide visibility.
* **Current State:** **Partially Implemented.**
  - Backend RBAC rules and database assignments work cleanly.
  - Frontend lacks UI for assigning users to warehouses. Operational order management on `/orders` is a placeholder.

---

## 7. Security & Authorisation Assessment

* **Public Registration Hardening:** `POST /api/v1/auth/register` unconditionally assigns `CUSTOMER` role. Privileged `role` parameters are discarded.
* **Admin Bootstrap Security:** `npm run admin:bootstrap` permits creation only when 0 admins exist. Rejects overwriting existing accounts. Masked interactive password entry.
* **Additional Admin Creation:** `npm run admin:create` requires cryptographic authentication against an existing active administrator's password before creating new admin records.
* **Warehouse Access Boundaries:** Enforced via `warehouse-access.service.ts` on all inventory and warehouse endpoints. Managers cannot query unassigned facility inventory or approve tickets outside their facility scope.
* **Credential Hygiene:** Passwords are hashed with bcrypt (10 rounds). Passwords are never echoed to terminal stdout, shell history, or application logs.

---

## 8. Testing & Reliability Assessment

### Backend Test Coverage
24 test suites containing 231 automated tests targeting the isolated PostgreSQL test database (`stockflow_test_db`):

| Test Suite File | Coverage Focus | Test Count | Status |
| :--- | :--- | :---: | :---: |
| `tests/auth.test.ts` | Registration, login, JWT validation, privilege escalation refusal | 10 | PASS |
| `tests/admin-account-management.test.ts` | Bootstrap, additional admin creation, masked CLI, audit | 9 | PASS |
| `tests/roles-and-warehouse-access.test.ts` | RBAC facility boundaries, manager/staff assignments | 16 | PASS |
| `tests/concurrency.test.ts` | Row-level locking, race conditions, over-reservation | 5 | PASS |
| `tests/orders.test.ts` | Order creation, reservation TTL, cancellation | 8 | PASS |
| `tests/payments.test.ts` | Payment success/fail simulation, reservation commits | 7 | PASS |
| `tests/thresholds-and-security.test.ts` | Threshold CRUD, low-stock engine, warehouse override | 21 | PASS |
| `tests/ticket-management.test.ts` | Shortage tickets, customer decisions, manager approvals | 19 | PASS |
| `tests/customer-shopping-experience.test.ts` | Catalog browsing, cart, checkout, tracking | 14 | PASS |
| `tests/dynamic-multi-warehouse.test.ts` | Multi-facility allocation, split-order routing | 12 | PASS |
| `tests/expiry.test.ts` | 15-minute reservation TTL sweep worker | 4 | PASS |
| `tests/outbox.test.ts` | Transactional outbox polling, batching, and retry | 9 | PASS |
| `tests/rabbitmq.test.ts` | Broker connection, topology assertions, DLQs | 11 | PASS |
| `tests/security-audit-rbac.test.ts` | Comprehensive permission matrix penetration test | 25 | PASS |
| `tests/idempotency.test.ts` | Idempotency key deduplication and payload hashing | 5 | PASS |
| `tests/inventory.test.ts`, `warehouses.test.ts`, etc. | Core resource operations | 56 | PASS |

### Test Reliability & Isolation
* **Database Isolation:** `tests/setup.ts` overrides `DATABASE_URL` with `TEST_DATABASE_URL` or `127.0.0.1:5432/stockflow_test_db`. Zero automated tests run against Neon.
* **Cascade Cleanup:** `clearDatabase()` truncates all tables before each test.
* **Frontend Test Gap:** 0 tests exist for the React frontend application.

---

## 9. Bugs, Inconsistencies & Technical Debt

| ID | Issue Description | Severity | Relevant File(s) / Endpoint(s) | Existing State | Recommended Correction | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- |
| **BUG-01** | **Premature Physical Stock Deduction** | **Critical** | `src/modules/payments/payment.service.ts`<br>`POST /api/v1/payments/process` | Decrements `quantityOnHand` immediately upon payment confirmation. | Keep physical stock in `quantityOnHand` during payment; deduct only `quantityReserved`. Decrement `quantityOnHand` when order status transitions to `SHIPPED`. | Order fulfillment endpoints |
| **BUG-02** | **Missing Order Fulfilment Lifecycle** | **Critical** | `src/modules/orders/order.routes.ts`<br>`src/modules/orders/order.service.ts` | Orders stall permanently in `CONFIRMED`. No endpoints exist for `PROCESSING`, `SHIPPED`, or `DELIVERED`. | Implement `POST /api/v1/orders/:id/fulfill`, `POST /api/v1/orders/:id/dispatch`, and `POST /api/v1/orders/:id/deliver`. | BUG-01 |
| **BUG-03** | **Non-Customer `/orders` Route is a Placeholder** | **High** | `frontend/src/routes/AppRoutes.tsx`<br>`frontend/src/pages/PlaceholderPages.tsx` | Non-customer roles see a static card on `/orders`. | Implement a dedicated `OrdersManagementPage` with status tabs, warehouse filters, item inspection, and fulfillment dispatch buttons. | BUG-02 |
| **BUG-04** | **`/inventory` Route is a Placeholder** | **High** | `frontend/src/pages/PlaceholderPages.tsx` | Standalone inventory page renders static text. | Implement interactive `InventoryPage` with cross-warehouse stock table, available vs reserved balances, and low-stock filters. | None |
| **BUG-05** | **Missing Stock Movement Ledger API & UI** | **High** | `src/modules/inventory/inventory.routes.ts`<br>`src/modules/inventory/inventory.service.ts` | `inventory_movements` records are written to the database but cannot be queried via API. | Implement `GET /api/v1/inventory/movements` with filtering by product, warehouse, movement type, and date range. Add ledger viewer UI. | None |
| **BUG-06** | **Missing User & Staff Management UI** | **High** | `frontend/src/pages/SettingsPage.tsx`<br>`frontend/src/api/users.ts` | Backend has user & assignment APIs, but frontend has zero client or UI. | Create `frontend/src/api/users.ts` and build a User & Staff Management interface in `/settings` and `/warehouses`. | None |
| **BUG-07** | **Neon Missing Migrations 6 & 7** | **High** | `prisma/migrations/` | Neon database is missing `minimum_stock_thresholds`, `tickets`, `notifications`. | Execute `npx prisma migrate deploy` against Neon when deployment phase is approved. | Production Deployment Approval |
| **BUG-08** | **Zero Frontend Automated Tests** | **Medium** | `frontend/package.json` | No test runner configured for the React application. | Install Vitest + React Testing Library; add component unit and integration tests. | None |
| **BUG-09** | **Missing Inter-Warehouse Stock Transfer** | **Medium** | `src/modules/inventory/` | Cannot transfer stock between warehouses. | Implement `POST /api/v1/inventory/transfer` with atomic deduction at source and increment at destination. | None |

---

## 10. Missing Functionality Breakdown

### 1. Fulfilment Operations
* Order status progression: `CONFIRMED` $\rightarrow$ `PROCESSING` (picking/packing) $\rightarrow$ `SHIPPED` (dispatch) $\rightarrow$ `DELIVERED`.
* Warehouse staff dispatch interface with tracking number entry.
* Physical ledger movement on dispatch (`MovementType.DISPATCH`).

### 2. Inventory Administration
* Historical inventory movement ledger endpoint and UI table.
* Inter-warehouse stock transfer request, approval, and execution.
* Batch inventory import / CSV stock reconciliation.

### 3. User & Operational Management
* User administration table for Admins (promote/demote roles).
* Warehouse manager and staff assignment modal on `/warehouses`.
* Operational access revocation audit log.

### 4. Enterprise Analytics
* Historical order volume and fulfillment latency charts on Dashboard.
* Stock turnover rate and fulfillment bottleneck metrics.

---

## 11. Prioritised Implementation Roadmap

The remaining work is structured into five sequential phases to transition StockFlow into a fully operational platform:

### Phase 1: Fulfilment Lifecycle & Physical Stock Correction (Critical Priority)
1. Fix physical stock deduction in `payment.service.ts`: decouple payment confirmation from physical inventory deduction.
2. Implement fulfillment endpoints:
   - `POST /api/v1/orders/:id/start-processing` (transitions `CONFIRMED` $\rightarrow$ `PROCESSING`).
   - `POST /api/v1/orders/:id/dispatch` (transitions `PROCESSING` $\rightarrow$ `SHIPPED`; decrements `quantityOnHand` and commits reservation; records `DISPATCH` inventory movement).
   - `POST /api/v1/orders/:id/deliver` (transitions `SHIPPED` $\rightarrow$ `DELIVERED`).
3. Add backend integration and unit tests for the complete fulfillment lifecycle.

### Phase 2: Operations & Warehouse Order Management UI (High Priority)
1. Replace `OrdersPage` in `PlaceholderPages.tsx` with a fully featured `OrdersManagementPage`:
   - Status filtering (`ALL`, `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `CANCELLED`).
   - Warehouse assignment filtering for managers and staff.
   - Action triggers for starting processing, dispatching with tracking notes, and cancelling.
2. Enhance `OrderTrackingPage` to reflect real fulfillment status transitions.

### Phase 3: Standalone Inventory & Movement Ledger (High Priority)
1. Implement backend endpoint `GET /api/v1/inventory/movements` with pagination and filters.
2. Replace `InventoryPage` in `PlaceholderPages.tsx` with an interactive `InventoryPage`:
   - Cross-warehouse stock table with on-hand, reserved, available, and threshold status.
   - Tabbed Stock Movement Ledger viewing historical adjustments, holds, sweeps, and dispatches.
   - Direct stock adjustment / transfer modal.

### Phase 4: User, Role & Facility Assignment Administration (Medium Priority)
1. Create `frontend/src/api/users.ts`.
2. Build User & Role Management interface in `SettingsPage`:
   - List users with search, role filter, and role modification modal.
3. Build Staff Assignment interface on `WarehousesPage`:
   - View assigned managers and staff per facility.
   - Assign/unassign staff with instant permission updates.

### Phase 5: Neon Migration Deployment & Frontend Testing (Medium Priority)
1. Deploy pending migrations 6 and 7 to Neon cloud database (`npx prisma migrate deploy`).
2. Verify Tickets and Notifications live in the production web portal against Neon.
3. Install Vitest and React Testing Library in `frontend/`. Write component tests for critical user flows (checkout, ticket decisions, warehouse selector).

