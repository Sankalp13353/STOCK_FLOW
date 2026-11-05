# StockFlow — Phase 7B: Controlled Neon Migration Deployment Report

**Execution Date**: 2026-11-06  
**Target Environment**: Active Neon Cloud PostgreSQL Database (`neondb`)  
**Status**: COMPLETED SUCCESSFULLY (100% Verified)  

---

## 1. Explicit Approval Confirmation

The project owner explicitly approved the deployment of the four pending migrations to the active Neon PostgreSQL database:
1. `20261103193645_add_minimum_stock_threshold`
2. `20261104123304_add_ticket_and_notification_models`
3. `20261104223500_add_dispatch_movement_type`
4. `20261105230000_add_user_is_active`

This report documents the authorized live execution, pre-migration recovery point creation, deployment output, schema verification, data integrity audits, and application smoke tests.

---

## 2. Verified Neon Database Identity

Pre- and post-deployment independent verification confirmed the database identity:

| Attribute | Value | Verification Status |
| :--- | :--- | :---: |
| **Provider** | Neon Serverless PostgreSQL (`ap-southeast-1`) | Verified |
| **Project Name** | `STOCK_FLOW` | Verified |
| **Project ID** | `fragrant-meadow-38424797` | Verified |
| **Production Branch** | `production` (`br-ancient-sky-b3cm4mu6`) | Verified |
| **Database Engine** | PostgreSQL 18.6 (ac70818) aarch64 | Verified |
| **Database Name** | `neondb` | Verified |
| **Schema Name** | `public` | Verified |
| **Direct Host** | `ep-icy-mode-b3i7686r.c-4.ap-southeast-1.aws.neon.tech` | Verified |
| **Pooled Host** | `ep-icy-mode-b3i7686r-pooler.c-4.ap-southeast-1.aws.neon.tech` | Verified |

*(All connection credentials, passwords, and sensitive keys are strictly omitted in compliance with security guidelines.)*

---

## 3. Dedicated Recovery Point & Branch Verification

Prior to applying any migrations, two independent, fully verified recovery points were established:

### 3.1 Neon Cloud Dedicated Recovery Branch
Using the authenticated Neon CLI (`neonctl`), a dedicated recovery branch was created directly from the production branch at the exact pre-migration LSN:

| Property | Value |
| :--- | :--- |
| **Branch Name** | `stockflow-pre-phase-7b-migrations` |
| **Branch ID** | `br-long-feather-b3eauftz` |
| **Project ID** | `fragrant-meadow-38424797` |
| **Parent Branch** | `production` (`br-ancient-sky-b3cm4mu6`) |
| **Parent LSN** | `0/51388E8` |
| **Endpoint ID** | `ep-fancy-field-b3o36asj` |
| **Endpoint Host** | `ep-fancy-field-b3o36asj.c-4.ap-southeast-1.aws.neon.tech` |
| **Creation Timestamp** | `2026-11-05T19:26:03Z` |
| **Access Verification** | Connected and queried in read-only mode. Verified 5 applied migrations and identical pre-migration record counts. |

### 3.2 Offline Logical SQL Backup
In addition to the cloud branch, a complete logical SQL backup was exported and verified locally:
- **File Path**: `prisma/pre_migration_phase7b_backup.sql`
- **File Size**: `98,646 bytes`
- **Integrity**: Contains all 14 baseline tables, enums, constraints, and data rows.

---

## 4. Pre-Migration Baseline Record Counts

The pre-deployment snapshot recorded the exact row counts in the active production database:

| Table | Pre-Migration Count | Notes |
| :--- | :---: | :--- |
| `users` | 4 | 1 Admin, 3 Customers |
| `products` | 5 | Catalogue products |
| `warehouses` | 3 | Physical logistics depots |
| `inventory` | 4 | Multi-warehouse stock balances |
| `inventory_movements` | 8 | Immutable ledger records |
| `orders` | 2 | Completed/historical orders |
| `order_items` | 4 | Line items for existing orders |
| `payments` | 2 | Settled payments |
| `_prisma_migrations` | 5 | Applied migrations 1–5 |
| `user_warehouse_assignments` | 0 | Empty prior to operational staffing |
| `minimum_stock_thresholds` | *Table did not exist* | Target of Migration 6 |
| `tickets` | *Table did not exist* | Target of Migration 7 |
| `notifications` | *Table did not exist* | Target of Migration 7 |

---

## 5. Migration Execution (`prisma migrate deploy`)

The deployment was executed non-interactively using Prisma's production command:
```bash
npx prisma migrate deploy
```

### Complete Execution Output:
```text
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-icy-mode-b3i7686r.c-4.ap-southeast-1.aws.neon.tech"

9 migrations found in prisma/migrations

Applying migration `20261103193645_add_minimum_stock_threshold`
Applying migration `20261104123304_add_ticket_and_notification_models`
Applying migration `20261104223500_add_dispatch_movement_type`
Applying migration `20261105230000_add_user_is_active`

The following migration(s) have been applied:

migrations/
  └─ 20261103193645_add_minimum_stock_threshold/
    └─ migration.sql
  └─ 20261104123304_add_ticket_and_notification_models/
    └─ migration.sql
  └─ 20261104223500_add_dispatch_movement_type/
    └─ migration.sql
  └─ 20261105230000_add_user_is_active/
    └─ migration.sql
      
All migrations have been successfully applied.
```

**Status**: Exit code `0`. All 4 approved migrations applied sequentially without warnings or errors.

---

## 6. Post-Migration Schema Verification

### 6.1 Prisma Migration Status
`npx prisma migrate status` was executed against Neon:
```text
9 migrations found in prisma/migrations
Database schema is up to date!
```
- **Total Applied Migrations**: Exactly 9.
- **Pending Migrations**: 0.
- **Failed / Rolled Back Migrations**: 0.

### 6.2 New Tables Verified
Inspection of `information_schema.tables` confirmed creation of all 3 required tables:
- `minimum_stock_thresholds` (Primary key: `id`, Foreign keys: `product_id`, `warehouse_id`)
- `tickets` (Primary key: `id`, Unique index: `idx_tickets_ticket_number`)
- `notifications` (Primary key: `id`, Unique index: `idx_notifications_dedup`)

### 6.3 New & Extended Enums Verified
Inspection of `pg_type` and `pg_enum` confirmed:
- `TicketType`: `['ORDER_SHORTAGE', 'CUSTOMER_DECISION', 'LOW_STOCK']`
- `TicketStatus`: `['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'CLOSED', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']`
- `TicketPriority`: `['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']`
- `CustomerDecision`: `['PENDING', 'ACCEPTED_PARTIAL', 'REJECTED', 'EXPIRED']`
- `ApprovalStatus`: `['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']`
- `NotificationType`: `['ORDER_SHORTAGE', 'CUSTOMER_DECISION_REQUIRED', 'LOW_STOCK_ALERT', 'TICKET_ASSIGNED', 'TICKET_RESOLVED', 'ORDER_APPROVED', 'ORDER_REJECTED']`
- `MovementType`: Confirmed to contain `'DISPATCH'` alongside original values.

### 6.4 `users.is_active` Column Verified
Inspection of `information_schema.columns` for `users`:
- **Column**: `is_active`
- **Data Type**: `boolean`
- **Default**: `'true'`
- **Nullable**: `NO` (`NOT NULL`)

---

## 7. Existing Data Integrity Verification

Post-migration counts were compared against the pre-migration baseline:

| Table | Pre-Migration Count | Post-Migration Count | Delta | Integrity Status |
| :--- | :---: | :---: | :---: | :---: |
| `users` | 4 | 4 | 0 | **100% INTACT** |
| `products` | 5 | 5 | 0 | **100% INTACT** |
| `warehouses` | 3 | 3 | 0 | **100% INTACT** |
| `inventory` | 4 | 4 | 0 | **100% INTACT** |
| `inventory_movements` | 8 | 8 | 0 | **100% INTACT** |
| `orders` | 2 | 2 | 0 | **100% INTACT** |
| `order_items` | 4 | 4 | 0 | **100% INTACT** |
| `payments` | 2 | 2 | 0 | **100% INTACT** |
| `minimum_stock_thresholds` | N/A | 0 | +0 | **READY (EMPTY)** |
| `tickets` | N/A | 0 | +0 | **READY (EMPTY)** |
| `notifications` | N/A | 0 | +0 | **READY (EMPTY)** |

### User Records Verification:
- **Admin Account**: `af3a4347-40e8-48d2-b46b-c9c7d8d934f7` remains role `ADMIN`, `is_active = true`.
- **Customer Accounts (3)**:
  - `9966f1fa-9f32-4ab3-b772-d1e0993f7daf` (CUSTOMER, `is_active = true`)
  - `63c23a69-97e1-492b-8e71-2954ced9fa05` (CUSTOMER, `is_active = true`)
  - `0cf366dc-5c35-4abc-9d90-cfe6d954505a` (CUSTOMER, `is_active = true`)
- **No data loss, no unexpected mutations, and zero orphaned records**.

---

## 8. Application Smoke Tests (Read-Only)

Live smoke tests were executed against the application backend connecting directly to the updated Neon database. All operations were strictly read-only:

| # | Endpoint & Method | Auth Context | HTTP Status | Result / Output |
| :---: | :--- | :--- | :---: | :--- |
| **1** | `GET /health` | Unauthenticated | **200 OK** | Database reported `UP` (latency: 1034ms). |
| **2** | `GET /api/v1/products` | Public | **200 OK** | Returned active product catalog. |
| **3** | `GET /api/v1/warehouses` | Admin JWT | **200 OK** | Returned 3 active facilities. |
| **4** | `GET /api/v1/inventory/metrics` | Admin JWT | **200 OK** | Handled metrics query cleanly without `is_active` errors. |
| **5** | `GET /api/v1/inventory/thresholds` | Admin JWT | **200 OK** | Successfully queried newly migrated `minimum_stock_thresholds`. |
| **6** | `GET /api/v1/tickets` | Admin JWT | **200 OK** | Successfully queried newly migrated `tickets` table. |
| **7** | `GET /api/v1/orders` | Admin JWT | **200 OK** | Returned existing orders cleanly. |
| **8** | `GET /api/v1/orders/my-orders` | Customer JWT | **200 OK** | Returned customer orders. |
| **9** | `GET /api/v1/inventory/metrics` | Customer JWT | **403 Forbidden** | RBAC security barrier functioning correctly. |

**Key Resolution**: Authenticated API requests no longer crash with `column "is_active" of relation "users" does not exist`. The compatibility gap identified in Phase 7A has been completely resolved.

---

## 9. Rollback & Recovery Procedure (If Ever Needed)

The recovery branch `stockflow-pre-phase-7b-migrations` (`br-long-feather-b3eauftz`) is preserved in Neon and remains unaltered.

If a future rollback is required:
1. **Instant Revert via Neon Console**:
   The production endpoint can be pointed to `stockflow-pre-phase-7b-migrations` or the branch can be restored using:
   ```bash
   neon branches restore production stockflow-pre-phase-7b-migrations
   ```
2. **Deterministic SQL Down-Migration**:
   ```sql
   ALTER TABLE "users" DROP COLUMN IF EXISTS "is_active";
   DROP TABLE IF EXISTS "notifications";
   DROP TABLE IF EXISTS "tickets";
   DROP TYPE IF EXISTS "NotificationType";
   DROP TYPE IF EXISTS "ApprovalStatus";
   DROP TYPE IF EXISTS "CustomerDecision";
   DROP TYPE IF EXISTS "TicketPriority";
   DROP TYPE IF EXISTS "TicketStatus";
   DROP TYPE IF EXISTS "TicketType";
   DROP TABLE IF EXISTS "minimum_stock_thresholds";
   ```
3. **Offline Logical Restore**:
   `prisma/pre_migration_phase7b_backup.sql` can be restored via `psql "$DIRECT_URL" < prisma/pre_migration_phase7b_backup.sql`.

---

## 10. Conclusion

Phase 7B has successfully deployed all pending migrations to the active Neon production database.
- **Schema Parity**: Production Neon schema is now in **100% parity** with `prisma/schema.prisma`.
- **Zero Disruptions**: All existing accounts, facilities, products, inventory balances, and movements remain intact.
- **Application Health**: Backend APIs, authentication middlewares, and operational query engines are operating nominally.

In accordance with project restrictions, Phase 7B execution is halted. **Awaiting explicit approval before proceeding to Phase 7C or any subsequent tasks.**

