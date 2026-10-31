# Software Requirements Specification (SRS)
## StockFlow — Distributed Inventory & Order Management System

---

## 1. Problem Statement

Modern e-commerce and retail businesses operate across distributed physical warehouses to optimize delivery times and shipping costs. However, managing distributed inventory introduces critical software engineering challenges:

1. **Overselling (Stockouts Under High Concurrency):** When multiple customers attempt to purchase the final units of a popular SKU simultaneously, uncoordinated read-modify-write database operations result in race conditions. Multiple orders succeed while physical inventory is insufficient, causing cancelled orders, reputational damage, and customer dissatisfaction.
2. **Multi-Warehouse Allocation Inefficiencies:** A product's inventory is fragmented across geographically dispersed warehouses. Without a centralized allocation strategy, systems fail to fulfill multi-item orders efficiently, leading to split shipments or false "out of stock" errors when a single warehouse lacks the full order volume.
3. **Double-Ordering and Duplicate Processing:** Network flakiness, client retries, and rapid repeated user clicks often trigger duplicate HTTP requests. In the absence of strict idempotency, customers are billed multiple times and inventory is reserved repeatedly for a single physical checkout.
4. **Inventory Inconsistencies and Stuck Reservations:** If an order enters checkout and holds stock, but payment fails or times out, the held stock can remain permanently locked or "orphaned" if the reservation lifecycle is not strictly bound by a time-to-live (TTL) and automated compensation mechanisms.
5. **Lack of Auditability and Reconciliation:** Adjustments, restocks, reservations, and sales often overwrite a single inventory counter without maintaining an immutable transaction ledger, making discrepancy tracking, shrinkage detection, and financial auditing impossible.

---

## 2. Proposed Solution

**StockFlow** is an enterprise-grade, distributed inventory and order management system built as a clean **Modular Monolith**. It provides strong data consistency, ACID guarantees, and deterministic order state transitions.

Key capabilities include:
- **Two-Phase Inventory Allocation:** Decoupling inventory into *Available*, *Reserved*, and *On-Hand* quantities. Stock is reserved atomically with an expiry TTL during checkout, and only deducted from physical on-hand stock upon verified payment.
- **Concurrency-Safe Stock Reservations:** Utilizing relational database row-level locking (`SELECT ... FOR UPDATE`) within isolated ACID transactions to eliminate race conditions and guarantee that overselling is mathematically impossible.
- **Strict Idempotency:** Enforcing idempotency keys across all mutating order and payment endpoints to guarantee that retried or duplicate network requests never result in multiple orders or double reservations.
- **Deterministic Order State Machine:** Modeling the entire order lifecycle with strictly defined valid transitions, automated compensation (stock release on payment failure or timeout), and unambiguous status progression.
- **Comprehensive Inventory Ledger:** Recording every stock delta as an immutable inventory movement event (restock, hold, release, fulfillment, adjustment) alongside running balance snapshots.

---

## 3. Target Users

| User Persona | Responsibilities & System Interactions |
| :--- | :--- |
| **System Administrator** | Manages system configuration, user roles, security policies, high-level reporting, and global warehouse topologies. |
| **Warehouse Manager** | Oversees physical inventory at designated warehouses, performs stock audits, receives shipments (restocking), processes order pick-and-pack, and manages shipments. |
| **Customer / Client Application** | Browses product availability across locations, places orders, submits payments, tracks order status, and initiates cancellations. |

---

## 4. Functional Requirements

### 4.1 Authentication and Access Control
- **FR-AUTH-01:** System must allow users to register with email, password, full name, and role (`CUSTOMER`, `WAREHOUSE_STAFF`, `ADMIN`).
- **FR-AUTH-02:** System must authenticate users via secure password hashing (Argon2 or bcrypt) and issue JSON Web Tokens (JWT) for stateless session verification.
- **FR-AUTH-03:** System must enforce Role-Based Access Control (RBAC) on all protected endpoints.

### 4.2 Product and Catalog Management
- **FR-PROD-01:** System must maintain unique Stock Keeping Units (SKUs) across the entire catalog.
- **FR-PROD-02:** System must support creating, reading, updating, and deactivating products.
- **FR-PROD-03:** Product prices must be stored as integers representing the smallest currency unit (e.g., cents in USD, paise in INR) or high-precision fixed decimals to eliminate floating-point arithmetic errors.

### 4.3 Warehouse Management
- **FR-WH-01:** System must support multi-warehouse registration with unique warehouse codes, physical addresses, and operational statuses (`ACTIVE`, `INACTIVE`).
- **FR-WH-02:** System must track inventory independently per warehouse for every product SKU.

### 4.4 Inventory Management and Stock Reservation
- **FR-INV-01:** System must calculate available stock using the formula:  
  $$\text{Available Stock} = \text{Quantity On Hand} - \text{Quantity Reserved}$$
- **FR-INV-02:** System must enforce that $\text{Quantity Reserved} \le \text{Quantity On Hand}$ at all times via database constraints and transaction-level validations.
- **FR-INV-03:** When an order is placed, system must atomically create an `InventoryReservation` record with a defined TTL (default: 15 minutes) and increment `Quantity Reserved`.
- **FR-INV-04:** If payment succeeds, the system must commit the reservation: decrease `Quantity On Hand` by reserved quantity, decrease `Quantity Reserved` by reserved quantity, and mark reservation as `COMMITTED`.
- **FR-INV-05:** If payment fails, order is cancelled, or TTL expires, system must release the reservation: decrease `Quantity Reserved` by reserved quantity and mark reservation as `RELEASED` or `EXPIRED`.
- **FR-INV-06:** System must log every inventory change into an immutable `InventoryMovement` ledger.

### 4.5 Order Management
- **FR-ORD-01:** Customers can create an order specifying one or more items (product ID, quantity) and shipping details.
- **FR-ORD-02:** System must require a unique client-generated `Idempotency-Key` header for order placement.
- **FR-ORD-03:** System must atomically evaluate stock availability across warehouses.
- **FR-ORD-04:** System must track order states: `PENDING`, `RESERVED`, `PAYMENT_PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `PAYMENT_FAILED`, `RESERVATION_EXPIRED`.
- **FR-ORD-05:** Customers can cancel orders only if the order is in `PENDING`, `RESERVED`, or `CONFIRMED` state prior to fulfillment dispatch (`PROCESSING`).

### 4.6 Payment Simulation
- **FR-PAY-01:** System must support simulated payment processing with deterministic success and failure hooks.
- **FR-PAY-02:** System must record payment attempts with unique transaction references, status, amount, and timestamp.
- **FR-PAY-03:** Successful payment must trigger order confirmation and stock commitment. Failed payment must trigger order cancellation and stock release.

---

## 5. Non-Functional Requirements

### 5.1 Performance
- **NFR-PERF-01:** 95% of stock availability reads (`GET /inventory`) must complete within under 50 ms under a baseline load of 500 requests per second.
- **NFR-PERF-02:** 99% of order creation and reservation transactions must complete in under 200 ms.
- **NFR-PERF-03:** Database row locks during reservation must be held for the absolute minimum duration (sub-10ms lock hold time inside transactions).

### 5.2 Data Consistency and Integrity
- **NFR-DATA-01 (Zero Overselling):** Under no circumstance shall the system allocate or sell more items than physically available on hand ($\text{Available} \ge 0$).
- **NFR-DATA-02 (ACID Compliance):** All operations touching both `Orders` and `Inventory` must execute within strict PostgreSQL database transactions.
- **NFR-DATA-03 (Auditability):** Stock changes must be fully reconcilable by summing all historical records in the `InventoryMovement` ledger.

### 5.3 Availability and Fault Tolerance
- **NFR-AVAIL-01:** The system must achieve 99.9% uptime during operational windows.
- **NFR-AVAIL-02:** Unhandled exceptions in background workers (e.g., reservation sweeper) must not degrade synchronous HTTP API availability.

### 5.4 Security
- **NFR-SEC-01:** All communication must be conducted over HTTPS/TLS in production.
- **NFR-SEC-02:** Passwords must be hashed using a modern adaptive cryptographic function (Argon2id or bcrypt with cost factor 12).
- **NFR-SEC-03:** Input validation must be strictly enforced at API boundaries using schema validation (Zod) to prevent injection attacks and payload tampering.

---

## 6. System Constraints

1. **Architecture Model:** Must be built as a clean **Modular Monolith** for Phase 1 through initial deployment. No premature microservices.
2. **Database:** PostgreSQL is the single source of truth; all relational constraints, foreign keys, and indexes must be strictly enforced at the database layer.
3. **Language & Runtime:** Backend services must run on Node.js using TypeScript with strict type checking enabled (`strict: true`).
4. **Single-Currency Scope:** For initial phases, the system handles transactions in a single primary currency (USD/cents) to avoid currency conversion complexity.

---

## 7. Assumptions

1. **Warehouse Assignment Strategy:** Orders are initially fulfilled from a single warehouse that has complete stock for an item. Complex split-shipment optimization algorithms across multiple warehouses will be handled incrementally in subsequent phases.
2. **Payment Processing:** Payment is processed synchronously in Phase 1 via a mock payment gateway service, simulating external webhook callbacks or synchronous gateway responses.
3. **Clock Synchronization:** All servers and database instances run with time synchronized via Network Time Protocol (NTP) in UTC.

---

## 8. Out-of-Scope Features for Phase 1

- Complex shipping carrier integrations (FedEx, UPS, DHL APIs).
- Dynamic tax calculation engines (Avalara, TaxJar).
- Customer refund processing and reverse logistics (returns).
- Multi-currency conversions and localized exchange rates.
- AI-driven inventory demand forecasting.
- Microservice orchestration and Kubernetes deployment manifests.

---

## 9. Critical Business Requirements Deep Dive

### 9.1 Preventing Overselling Under High Concurrency
When a high-demand item goes on sale, hundreds of clients may attempt to checkout within the same second. If two requests read `quantity_available = 1` concurrently, both might conclude sufficient stock exists and proceed to decrement the balance, yielding `-1` on hand (an oversell).
**StockFlow Guarantee:** StockFlow utilizes PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE`) sorted deterministically by primary key or SKU. The second transaction blocks until the first completes. When the lock releases, the second transaction reads the updated available quantity, encounters 0, and cleanly fails with an HTTP 409 Conflict ("Insufficient stock").

### 9.2 Managing Inventory Across Multiple Warehouses
A product SKU can be stored across Warehouse A, Warehouse B, and Warehouse C. StockFlow isolates inventory records by composite key `(product_id, warehouse_id)`. The reservation engine checks specific warehouse availability and binds each reservation line item to a concrete warehouse, ensuring physical pickers know exactly where items are sourced.

### 9.3 Handling Simultaneous Order Requests & Concurrency
Simultaneous requests for the same SKU across different orders are serialized at the database row level. By enforcing an order in which multiple SKUs are locked within a single transaction (e.g., sorting product IDs ascending before locking), StockFlow prevents database deadlocks.

### 9.4 Preventing Duplicate Orders via Idempotency
Clients generate a UUIDv4 `Idempotency-Key` and pass it in the request header. StockFlow persists the key along with the order record or an idempotency cache table inside the same transaction. If an identical request arrives while processing or after completion, the server immediately returns the cached response without re-executing business logic or reserving additional stock.

### 9.5 Maintaining Inventory Consistency
Inventory is modeled as a double-entry state:
- `quantity_on_hand`: Physical items residing in the warehouse.
- `quantity_reserved`: Items committed to active checkouts awaiting payment confirmation.
Available stock is always dynamically computed ($\text{quantity\_on\_hand} - \text{quantity\_reserved}$), guaranteeing that even if reservations fluctuate, physical stock is never modified until payment succeeds. Every change creates an immutable ledger row.

### 9.6 Recovering from Failed Order Processing
If a customer abandons checkout, payment gets declined, or network communication cuts out, the reserved stock is not permanently tied up. A dedicated Reservation Expiration Worker periodically scans for active reservations where $\text{expires\_at} < \text{NOW()}$. It atomically expires the reservation and decrements `quantity_reserved`, restoring availability to the open market.

