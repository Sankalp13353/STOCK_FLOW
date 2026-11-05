# StockFlow — Phase 5: Operational Dashboard & Business Analytics Implementation Report

## Executive Summary

Phase 5 transforms the StockFlow dashboard from a static, client-side aggregate page into a high-performance **Operational Command Centre** for Admins, Warehouse Managers, and Warehouse Staff, while preserving the dedicated wholesale shopping and order-tracking portal for Customers.

The new dashboard replaces decorative charts and unaggregated frontend loops with real backend aggregations, providing actionable business intelligence:
- Real-time **10-Metric KPI Ribbon** reflecting verified stock accounting (preserving the invariant that reservations do not deduct physical stock).
- Actionable **Operational Alerts & Bottlenecks Feed** connecting directly to orders awaiting processing, orders awaiting dispatch, low-stock threshold deficits, and shortage tickets.
- **Physical Inventory Flow (Restock vs Dispatch)** time-series visualizing warehouse throughput over time.
- **Order Volume & Fulfillment Velocity** tracking order trends, pipeline status distribution, backlog, and cancellation rates.
- **Multi-Warehouse Facility Performance & Workload Comparison** enabling cross-facility oversight for Admins and operational workload tracking for Managers and Staff.
- **Priority Inventory Shortages & Stock Deficits** pinpointing high-deficit SKUs with direct restock links.
- **Temporal & Spatial Filters**: Practical date-range intervals (`today`, `7d`, `30d`, `90d`) and facility scope selectors (`All Assigned Facilities` or specific facility).

All analytics endpoints are strictly protected by backend RBAC (`CUSTOMER` role is returned HTTP 403 Forbidden), and all queries are scoped dynamically to the operator's authorized warehouse facilities.

---

## 1. Backend Architecture & Analytics APIs

A dedicated analytics backend module was created under `src/modules/analytics/` and mounted at `/api/v1/analytics` (with an alias at `/api/v1/dashboard`).

### 1.1 Endpoint Specifications

| Method | Endpoint | Description | Scope / RBAC |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/analytics/dashboard` | Consolidated overview payload (KPIs, inventory, orders, warehouses, alerts) | Admin / Manager / Staff (Scoped) |
| `GET` | `/api/v1/analytics/kpis` | 10 high-level operational KPI counters | Admin / Manager / Staff (Scoped) |
| `GET` | `/api/v1/analytics/inventory` | Stock distribution, low stock summary, movement trends, top shortages | Admin / Manager / Staff (Scoped) |
| `GET` | `/api/v1/analytics/orders` | Status breakdown, orders over time, processing/dispatch backlog, cancellations | Admin / Manager / Staff (Scoped) |
| `GET` | `/api/v1/analytics/warehouses` | Cross-facility performance & workload comparison table data | Admin / Manager / Staff (Scoped) |
| `GET` | `/api/v1/analytics/alerts` | Real actionable operational alerts linking to bottleneck items | Admin / Manager / Staff (Scoped) |

### 1.2 Access Control & Authorization (RBAC)

1. **Enterprise Admin (`ADMIN`)**:
   - Organization-wide access across all physical fulfillment facilities without restriction.
   - When no `warehouseId` is specified, aggregates data across all active warehouses (`scope = 'ALL'`).
   - When a specific `warehouseId` is requested, filters metrics to that facility.
2. **Facility Managers & Warehouse Staff (`WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF`)**:
   - Strictly restricted to facilities assigned to their account via `UserWarehouseAssignment`.
   - When no `warehouseId` is specified, aggregates data strictly across their assigned warehouses.
   - Requesting an unassigned warehouse immediately returns HTTP 403 `FORBIDDEN_WAREHOUSE_ACCESS`.
3. **Wholesale Customers (`CUSTOMER`)**:
   - Access to internal analytics endpoints is strictly forbidden, returning HTTP 403 `FORBIDDEN`.
   - The frontend renders the customer wholesale portal (catalog shortcuts, shopping cart items, personal order tracking).

---

## 2. Metric Definitions & Aggregation Strategy

### 2.1 Dashboard KPI Definitions

| Metric | Source / Formula | Meaning |
| :--- | :--- | :--- |
| **Active SKUs** | `prisma.product.count({ where: { isActive: true } })` | Total active products available in catalog. |
| **Physical Stock** | `SUM(inventory.quantityOnHand)` | Actual physical units present on warehouse shelves. |
| **Reserved Stock** | `SUM(inventory.quantityReserved)` | Units held for active or confirmed orders. |
| **Available Stock** | `totalPhysicalInventory - totalReservedInventory` | Unreserved stock available for new customer orders. |
| **Low-Stock Alerts** | Items where `available < effectiveThreshold` | Inventory records below configured minimum threshold. |
| **Pending Orders** | `orders.count({ status: 'PENDING' })` | Orders awaiting customer payment or shortage resolution. |
| **Awaiting Processing** | `orders.count({ status: 'CONFIRMED' })` | Paid orders ready for warehouse pick/pack acknowledgement. |
| **Ready to Dispatch** | `orders.count({ status: 'PROCESSING' })` | Picked/packed orders awaiting physical carrier handoff. |
| **Active Tickets** | `tickets.count({ status: OPEN / ASSIGNED / IN_PROGRESS / PENDING })` | Shortages, approvals, and decisions requiring attention. |
| **Active Warehouses** | `warehouses.count({ isActive: true })` | Total active fulfillment centers accessible to operator. |

> [!IMPORTANT]
> **Stock Non-Deduction Invariant Preserved**: Physical stock (`quantityOnHand`) is never decremented during checkout, reservation hold, or payment confirmation. It is decremented strictly upon physical warehouse dispatch (`POST /orders/:id/dispatch`), as verified in Phase 1.

### 2.2 Threshold Hierarchy
Threshold evaluation prioritizes warehouse-specific overrides over global default thresholds:
$$\text{Effective Threshold} = \begin{cases} \text{Warehouse Override Min}, & \text{if configured} \\ \text{Global Default Min}, & \text{if configured} \\ \text{None}, & \text{otherwise} \end{cases}$$

An item is flagged as low stock if:
$$\text{quantityAvailable} < \text{Effective Threshold}$$

---

## 3. Inventory & Order Analytics Engine

### 3.1 Inventory Flow (Restock vs Dispatch Trends)
Aggregates `InventoryMovement` records over the selected time range into daily intervals:
- **Restocks**: Counts movements where `movementType === RESTOCK`, summing `quantityDelta`.
- **Dispatches**: Counts movements where `movementType IN [DISPATCH, FULFILLMENT_DEDUCTION]`, summing `|quantityDelta|`.
- **Adjustments**: Counts audit adjustments.
- **Continuous Timeline**: Daily buckets are seeded across the entire date window to prevent gaps on days with zero activity.

### 3.2 Order Velocity & Backlog
- **Status Distribution**: Native SQL `GROUP BY status` queries return counts and percentages for each `OrderStatus` enum.
- **Order Pipeline Backlog**:
  - `awaitingProcessingCount`: Snapshot count of orders in `CONFIRMED`.
  - `awaitingDispatchCount`: Snapshot count of orders in `PROCESSING`.
  - `totalBacklog`: Sum of processing and dispatch backlogs.
- **Cancellation Rate**: Percentage of orders in the period that were cancelled (`cancelledCount / totalOrders * 100`).

### 3.3 Warehouse Performance Comparison
For each accessible warehouse, computes:
- Physical stock on hand, reserved, and available.
- Count of unique orders fulfilled during the period.
- Physical units dispatched during the period.
- Low-stock SKU count.
- Active tickets count.

---

## 4. Operational Actionable Alerts

The alert engine continuously aggregates active operational bottlenecks without creating redundant database records:
1. **Orders Awaiting Processing (`AWAITING_PROCESSING`)**:
   - Paid orders in `CONFIRMED` status.
   - Priority: `HIGH`.
   - Direct link: `/orders/:id`.
2. **Orders Ready for Dispatch (`AWAITING_DISPATCH`)**:
   - Orders in `PROCESSING` status ready for shipping carrier handoff.
   - Priority: `HIGH`.
   - Direct link: `/orders/:id`.
3. **Low-Stock Warnings (`LOW_STOCK`)**:
   - Inventory items where `available < effectiveThreshold`.
   - Priority: `CRITICAL` if `available <= 0`, else `HIGH`.
   - Direct link: `/inventory?warehouseId=...`.
4. **Shortage Tickets (`SHORTAGE_TICKET`)**:
   - Active tickets of type `ORDER_SHORTAGE`.
   - Priority: `CRITICAL` or `HIGH`.
   - Direct link: `/tickets`.
5. **Pending Customer Decisions (`CUSTOMER_DECISION`)**:
   - Partial fulfillment offers awaiting customer response.
   - Priority: `MEDIUM`.
   - Direct link: `/tickets`.
6. **Pending Manager Approvals (`MANAGER_APPROVAL`)**:
   - Shortage order approvals awaiting manager review.
   - Priority: `HIGH`.
   - Direct link: `/tickets`.

---

## 5. Time Filters & Temporal Scoping

Supported time intervals:
- **Today (`today`)**: UTC midnight (`00:00:00.000`) of current day to current time.
- **Last 7 Days (`7d`)**: Current timestamp minus 7 days ($7 \times 86400\text{s}$) to current time.
- **Last 30 Days (`30d`)**: Current timestamp minus 30 days to current time.
- **Last 90 Days (`90d`)**: Current timestamp minus 90 days to current time.
- **Custom (`custom`)**: User-supplied `startDate` and `endDate` ISO strings.

All temporal queries use UTC timestamp boundaries to ensure consistent cross-timezone evaluation.

---

## 6. Frontend UI Implementation

### 6.1 Dashboard Page (`frontend/src/pages/DashboardPage.tsx`)
- **Dual Mode Architecture**:
  - `CUSTOMER`: Renders wholesale portal with cart summary, quick catalog navigation, and personal order tracking.
  - `ADMIN` / `WAREHOUSE_MANAGER` / `WAREHOUSE_STAFF`: Renders the Operational Command Centre.
- **Control Bar**:
  - Time Range button group (`Today`, `7 Days`, `30 Days`, `90 Days`).
  - Warehouse Filter dropdown (`All Assigned Facilities` + individual facility options).
  - Refresh button with loading spinner.
- **Responsive Layout**:
  - Top: 10-Metric KPI Ribbon.
  - Middle: Operational Action Items Feed.
  - Center: Restock vs Dispatch Bar Chart & Order Timeline Area Chart.
  - Bottom: Multi-Warehouse Performance Table & Priority Shortages Table.

### 6.2 New Dashboard Components
- **`DashboardKpiRibbon.tsx`**: 10 color-coded KPI cards displaying active SKUs, physical stock, reserved, available, low-stock, pending orders, awaiting processing, ready to dispatch, active tickets, and active facilities.
- **`OperationalAlertsSection.tsx`**: Real-time actionable alert feed with priority badges, timestamps, and direct operational links.
- **`MovementTrendsChart.tsx`**: Interactive bar chart comparing physical units restocked versus dispatched over time.
- **`OrderAnalyticsCharts.tsx`**: Interactive area chart showing orders placed over time alongside a status distribution breakdown and backlog summary.
- **`WarehousePerformanceTable.tsx`**: Comparative multi-facility table displaying inventory levels, throughput, orders fulfilled, low-stock items, and facility filter buttons.
- **`TopShortagesTable.tsx`**: Priority list of products with the highest stock deficits and shortage tickets, with direct links to restock.

---

## 7. Automated Testing & Verification

### 7.1 Dedicated Test Suite (`tests/dashboard-analytics.test.ts`)
The 14 comprehensive test scenarios cover all functional, temporal, and RBAC requirements:

| # | Test Scenario | Status | Result |
| :- | :--- | :---: | :--- |
| 1 | Admin accesses organization-wide analytics | `PASS` | All facilities and products included in metrics |
| 2 | Manager accesses assigned warehouse analytics | `PASS` | Metrics scoped strictly to assigned facility |
| 3 | Staff accesses assigned warehouse analytics | `PASS` | Operational workload scoped strictly to assigned facility |
| 4 | Customer forbidden from internal analytics | `PASS` | HTTP 403 Forbidden returned |
| 5 | Unauthenticated request rejected | `PASS` | HTTP 401 Unauthorized returned |
| 6 | Manager cannot access unassigned warehouse | `PASS` | HTTP 403 Forbidden returned on unauthorized facility filter |
| 7 | Physical inventory preserves non-deduction invariant | `PASS` | Reservations do not decrement `quantityOnHand` |
| 8 | Low-stock evaluation prioritizes warehouse overrides | `PASS` | Warehouse override overrides global default threshold |
| 9 | Tracks order status counts, backlog, cancellations | `PASS` | Confirmed (processing backlog) and Processing (dispatch backlog) tracked |
| 10 | Aggregates restock and physical dispatch movements | `PASS` | RESTOCK (+delta) vs DISPATCH (-delta) aggregated over time |
| 11 | Generates actionable operational alerts | `PASS` | Alerts created for awaiting processing, awaiting dispatch, and shortages |
| 12 | Compares multi-facility throughput and inventory | `PASS` | Multi-facility performance table accurately returns per-facility stats |
| 13 | Empty datasets return valid zero-value metrics | `PASS` | Zero assigned warehouses returns clean zeroes without runtime error |
| 14 | Warehouse filter scopes all dashboard metrics | `PASS` | `warehouseId` query param isolates metrics to specified facility |

### 7.2 Full Regression Test Suite Execution
All test suites across the platform were executed against the isolated test database (`stockflow_test_db`):

```bash
PASS tests/dashboard-analytics.test.ts (14 passed)
PASS tests/user-administration.test.ts (17 passed)
PASS tests/inventory-management.test.ts (18 passed)
PASS tests/fulfilment-lifecycle.test.ts (14 passed)
PASS tests/warehouse-operations.test.ts (8 passed)
PASS tests/thresholds-and-security.test.ts (18 passed)
PASS tests/ticket-management.test.ts (15 passed)
PASS tests/orders.test.ts (12 passed)
PASS tests/payments.test.ts (3 passed)
PASS tests/inventory.test.ts (14 passed)
PASS tests/admin-account-management.test.ts (9 passed)
PASS tests/roles-and-warehouse-access.test.ts (11 passed)
PASS tests/security-audit-rbac.test.ts (15 passed)
```

**Total Tests Verified: 168 passing, 0 failing.**

### 7.3 Compilation & Build Verification
- **Backend TypeScript**: `npx tsc --noEmit` passed with 0 errors.
- **Frontend Vite & TypeScript**: `npm --prefix frontend run build` passed with 0 errors in 3.65s.

---

## 8. Files Created & Modified

### New Backend Files
- `src/modules/analytics/analytics.schemas.ts`: Validation schemas for time range and warehouse filters.
- `src/modules/analytics/analytics.service.ts`: Core analytics business logic, SQL/Prisma aggregations, and RBAC scoping.
- `src/modules/analytics/analytics.controller.ts`: Controller handlers for dashboard, KPIs, inventory, orders, warehouses, alerts.
- `src/modules/analytics/analytics.routes.ts`: Protected routes enforcing authentication and operator roles.
- `tests/dashboard-analytics.test.ts`: Automated test suite (14 tests).

### Modified Backend Files
- `src/routes.ts`: Registered `analyticsRouter` under `/analytics` and `/dashboard`.

### New Frontend Files
- `frontend/src/types/analytics.ts`: Complete TypeScript interfaces for dashboard metrics and analytics results.
- `frontend/src/api/analytics.ts`: API client functions for fetching dashboard analytics.
- `frontend/src/features/dashboard/DashboardKpiRibbon.tsx`: 10-metric operational KPI ribbon.
- `frontend/src/features/dashboard/OperationalAlertsSection.tsx`: Actionable operational alerts feed.
- `frontend/src/features/dashboard/MovementTrendsChart.tsx`: Recharts-based restock vs dispatch trends.
- `frontend/src/features/dashboard/OrderAnalyticsCharts.tsx`: Recharts-based order velocity and status distribution.
- `frontend/src/features/dashboard/WarehousePerformanceTable.tsx`: Multi-facility performance comparison table.
- `frontend/src/features/dashboard/TopShortagesTable.tsx`: Priority stock deficits table.

### Modified Frontend Files
- `frontend/src/types/index.ts`: Re-exported analytics types.
- `frontend/src/pages/DashboardPage.tsx`: Integrated the full Operational Command Centre while preserving the Customer Portal.

---

## 9. Performance & Invariant Guarantees

1. **No N+1 Queries**: All KPI and analytics queries use native Prisma aggregations (`count`, `groupBy`, `findMany` with in-memory hash index maps).
2. **Zero Hardcoded Metrics**: Every chart, percentage, and counter is computed directly from live database records.
3. **Empty Dataset Resilience**: Zero assigned warehouses or unpopulated facilities return valid zero-value metrics (`0`, empty arrays) without throwing errors.
4. **Neon Production Database Untouched**: No migrations were executed on the active Neon database; all testing was executed against the local test database (`stockflow_test_db`).

---

## 10. Conclusion & Sign-Off

Phase 5 has successfully transformed the StockFlow dashboard into a production-grade operational command centre. All 11 requirements—including real KPI cards, inventory analytics, order analytics, warehouse performance comparisons, actionable operational alerts, temporal filters, and strict RBAC boundaries—are fully implemented, verified, and passing tests with zero regressions.

Phase 5 is complete. Awaiting user approval before proceeding to subsequent work.

