# StockFlow — Unexpected Admin Accounts Audit Report

**Audit Date:** November 4, 2026  
**Audit Scope:** Active Neon PostgreSQL Production/Development Database  
**Investigation Mode:** Strictly Read-Only  
**Status:** Complete  

---

## 1. Executive Summary

An audit was conducted to investigate the origin of two unexpected `ADMIN` accounts identified in the active Neon PostgreSQL database:
1. **Account 1:** `Test Operator` — `frontend_test_1793603989578@stockflow.dev` (UUID: `f7cca580-cd29-4c83-924e-0a0d2b4c9f7e`)
2. **Account 2:** `Sarah Connor` — `demo.operator@stockflow.dev` (UUID: `738cc580-091d-4e0e-b11d-008dddfa6706`)

### Primary Findings
* **Origin:** Neither account was created by manual user registration, malicious intrusion, or database seeding. Both originated from automated development and verification scripts executed locally during frontend integration and screenshot generation on **November 2, 2026**.
* **Creation Mechanism:** Both accounts were registered via standard HTTP `POST /api/v1/auth/register` API requests sent to `http://localhost:4000`. At the time of creation (prior to commit `7b5582c`), the registration endpoint accepted a client-provided `role: "ADMIN"` parameter.
* **Database Isolation:** Automated Jest test suites are properly isolated to a local PostgreSQL database (`stockflow_test_db`). However, the local development server (`src/server.ts` on port 4000) was configured via `.env` to connect to the remote Neon PostgreSQL instance. Consequently, scripts making HTTP calls against `localhost:4000` persisted records directly into Neon.
* **Integrity Impact:** Neither account has associated orders, warehouse assignments, inventory movements, or active session state. However, their presence triggers the safety check in [`scripts/bootstrap-admin.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/scripts/bootstrap-admin.ts), preventing new administrator bootstrapping.

---

## 2. Account 1 Profile: Test Operator

### Overview
| Attribute | Value |
| :--- | :--- |
| **Full Name** | `Test Operator` |
| **Email** | `frontend_test_1793603989578@stockflow.dev` |
| **User ID** | `f7cca580-cd29-4c83-924e-0a0d2b4c9f7e` |
| **Role** | `ADMIN` |
| **Created At** | `2026-11-02 07:19:50.054 UTC` (`12:49:50 +05:30`) |
| **Updated At** | `2026-11-02 07:19:50.054 UTC` (`12:49:50 +05:30`) |

### Codebase & Test Reference Search
* **Search Results:** A full repository search across `tests/`, `src/`, `prisma/`, and `scripts/` yielded no static occurrences of `frontend_test_` or `Test Operator`.
* **Transcript & History Correlation:** An inspection of the conversation trajectory logs identified the exact command executed at `2026-11-02T07:19:36Z` (Transcript step 2055):
  ```javascript
  // Temporary verification script executed to validate backend endpoints:
  const email = "frontend_test_" + Date.now() + "@stockflow.dev";
  const password = "TestPassword123!";
  const fullName = "Test Operator";
  
  await fetch("http://localhost:4000/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, fullName, role: "ADMIN" })
  });
  ```
* **Timestamp Verification:** The timestamp portion of the email `1793603989578` converts to exactly `Mon Nov 02 2026 07:19:49.578 UTC`, matching the database record `createdAt` (`07:19:50.054 UTC`) within 476 milliseconds.

### Associated Records
* **Orders Placed:** 0
* **Warehouse Assignments:** 0
* **Inventory Movements / Audit Logs:** 0
* **Tickets / Notifications:** 0

### Origin Assessment
Created by an inline Node.js end-to-end smoke test script intended to verify live auth endpoints (`/register`, `/me`, `/login`, and dashboard read endpoints) after building the frontend preview server.

---

## 3. Account 2 Profile: Sarah Connor

### Overview
| Attribute | Value |
| :--- | :--- |
| **Full Name** | `Sarah Connor` |
| **Email** | `demo.operator@stockflow.dev` |
| **User ID** | `738cc580-091d-4e0e-b11d-008dddfa6706` |
| **Role** | `ADMIN` |
| **Created At** | `2026-11-02 07:22:06.761 UTC` (`12:52:06 +05:30`) |
| **Updated At** | `2026-11-02 07:50:54.231 UTC` (`13:20:54 +05:30`) |

### Codebase & Test Reference Search
* **Search Results:** The email `demo.operator@stockflow.dev` and name `Sarah Connor` exist explicitly in two committed automation scripts:
  1. [`scripts/capture_screenshots.mjs`](file:///Users/sankalp/Desktop/SDE_PRO_1/scripts/capture_screenshots.mjs#L10-L22):
     ```javascript
     async function getAuthCredentials() {
       const email = 'demo.operator@stockflow.dev';
       const password = 'Password123!';
       const fullName = 'Sarah Connor';

       const regRes = await fetch('http://localhost:4000/api/v1/auth/register', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, password, fullName, role: 'ADMIN' }),
       });
       ...
     ```
  2. [`scripts/capture_phase2_screenshots.mjs`](file:///Users/sankalp/Desktop/SDE_PRO_1/scripts/capture_phase2_screenshots.mjs#L14-L27):
     ```javascript
     async function getAuthCredentials() {
       const email = 'demo.operator@stockflow.dev';
       const password = 'Password123!';

       const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, password }),
       });
       ...
     ```

### Timestamp Verification
* **Account Creation (`07:22:06.761 UTC`):** Matches the initial invocation of `node scripts/capture_screenshots.mjs` at `2026-11-02T07:22:00Z` (Transcript step 2085), which logged: `Acquired auth token for operator: demo.operator@stockflow.dev`.
* **Account Update (`07:50:54.231 UTC`):** Matches the execution of `scripts/capture_phase2_screenshots.mjs` at `2026-11-02T07:50:43Z` (Transcript step 2403), which authenticated against this user and refreshed the session.

### Associated Records
* **Orders Placed:** 0
* **Warehouse Assignments:** 0
* **Inventory Movements / Audit Logs:** 0
* **Tickets / Notifications:** 0

### Origin Assessment
Created by the automated UI screenshot capture utility used to generate documentation artifacts for the frontend dashboard, products list, and warehouse views.

---

## 4. Test Database Isolation Audit

A critical question is whether these accounts represent a leak from the automated test suite into the production/development database.

### Jest Test Suite Configuration
* **Config File:** [`jest.config.js`](file:///Users/sankalp/Desktop/SDE_PRO_1/jest.config.js) specifies:
  ```javascript
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
  ```
* **Test Environment Setup:** [`tests/setup.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/tests/setup.ts#L1-L22) enforces:
  ```typescript
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://sankalp@127.0.0.1:5432/stockflow_test_db?schema=public';
  ```
* **Destructive Cascade Truncation:** `tests/setup.ts` defines `clearDatabase()`, which runs `TRUNCATE TABLE ... CASCADE` on all public tables before and after test suites.
  > **Proof of Isolation:** If Jest test runs had targeted Neon, the tables in Neon would have been completely truncated. All customer records, products, and historic inventory in Neon remain fully intact.
* **Test User Factory Convention:** In [`tests/helpers.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/tests/helpers.ts#L8-L19), the test helper `createTestUser()` generates accounts with:
  - Domain: `@stockflow.internal` (not `@stockflow.dev`)
  - Full Name: `Test ${role}` (e.g. `Test ADMIN`)
  - Direct database insertion via Prisma Client, not via HTTP registration.

### Conclusion on Test Isolation
**Automated Jest tests did NOT create these accounts and did NOT leak into the Neon database.** Test isolation between `stockflow_test_db` (local Postgres) and Neon (cloud Postgres) functioned as designed.

---

## 5. Root Cause Analysis: How Records Reached Neon

The accounts were created in Neon due to the intersection of two factors:

```
┌────────────────────────────────────────────────────────┐
│  Developer Machine                                     │
│                                                        │
│  [ npm run dev / tsx src/server.ts ]                   │
│         │                                              │
│         ▼ (reads .env: DATABASE_URL=neon...)           │
│  [ Connected to Neon PostgreSQL ]                      │
│         ▲                                              │
│         │ (HTTP POST /api/v1/auth/register)            │
│  [ scripts/capture_screenshots.mjs ]                   │
│  [ inline node verification command ]                  │
└────────────────────────────────────────────────────────┘
```

1. **Environment Binding of the Local Dev Server:**
   The backend server was running locally on port 4000 (`tsx src/server.ts`), but its `.env` configuration specified the remote Neon connection string (`DATABASE_URL=ep-icy-mode-...neon.tech/neondb`).
2. **HTTP API Target:**
   The verification script and screenshot generator did not interact directly with Prisma or Jest; they made HTTP network requests to `http://localhost:4000/api/v1/auth/register`.
3. **Pre-Hardening Registration Permissions:**
   On November 2, 2026, the `auth.controller.ts` implementation allowed clients to pass `role: "ADMIN"` during registration. The server accepted this role and committed the user to Neon.

*(Note: Commit `7b5582c` on Nov 2, 2026, and Phase 1 security hardening subsequently resolved this vulnerability by restricting `/register` strictly to `CUSTOMER` role).*

---

## 6. Impact on System & Admin Bootstrap

The presence of these two accounts directly impacts administrative provisioning via [`scripts/bootstrap-admin.ts`](file:///Users/sankalp/Desktop/SDE_PRO_1/scripts/bootstrap-admin.ts):

```typescript
// scripts/bootstrap-admin.ts lines 48-58:
const existingAdmin = await prisma.user.findFirst({
  where: { role: UserRole.ADMIN },
  select: { id: true, email: true, createdAt: true },
});

if (existingAdmin) {
  const warnMsg = `An administrator account already exists (${existingAdmin.email}, ID: ${existingAdmin.id}). For system security, initial bootstrap can only provision the primary administrator.`;
  console.warn(`⚠️  [Safety Notice] ${warnMsg}`);
  return { success: false, message: warnMsg };
}
```

Because `existingAdmin` evaluates to `true`, the bootstrap script safely refuses to provision a new administrator.

---

## 7. Recommended Safe Next Steps

Neither account has any business records, transactions, or foreign key dependencies attached. To enable administrative access for your personal account, choose one of the following safe paths:

### Path A: Use the Known Demo Operator Account to Provision Your Admin
Because the password for `demo.operator@stockflow.dev` was set in [`scripts/capture_screenshots.mjs`](file:///Users/sankalp/Desktop/SDE_PRO_1/scripts/capture_screenshots.mjs#L11), you can immediately access the system:
1. Start the frontend and backend servers.
2. Sign in via the frontend (`http://localhost:3000/login`) or API using:
   - **Email:** `demo.operator@stockflow.dev`
   - **Password:** `Password123!`
3. Navigate to the Admin/Users panel to invite or update your personal account to `ADMIN`.
4. Once your personal account is confirmed, delete or deactivate the two development accounts.

### Path B: Remove the Two Dev Accounts and Run Bootstrap
If you prefer to keep the database completely clean and provision your official admin via `npm run admin:bootstrap`:
1. Execute a targeted deletion script for only these two specific UUIDs:
   - `f7cca580-cd29-4c83-924e-0a0d2b4c9f7e` (`frontend_test_1793603989578@stockflow.dev`)
   - `738cc580-091d-4e0e-b11d-008dddfa6706` (`demo.operator@stockflow.dev`)
2. Run the initial administrator bootstrap command:
   ```bash
   ADMIN_NAME="Your Name" ADMIN_EMAIL="your.email@company.com" ADMIN_PASSWORD="YourSecurePassword123!" npm run admin:bootstrap
   ```

### Path C: In-Place Update of Demo Operator to Your Personal Admin
If you prefer not to delete rows:
1. Update the record `738cc580-091d-4e0e-b11d-008dddfa6706` with your chosen name, email, and newly hashed password.
2. Delete the unused `frontend_test_1793603989578@stockflow.dev` row.

---

## 8. Summary Table of Verified Evidence

| Check | Result | Evidence Reference |
| :--- | :--- | :--- |
| Account 1 in codebase / tests | **Found in audit transcript** | Step 2055 (Nov 2, 2026, 07:19:36 UTC) |
| Account 2 in codebase / tests | **Found in scripts** | `scripts/capture_screenshots.mjs`, `scripts/capture_phase2_screenshots.mjs` |
| Creation mechanism | **HTTP API Register** | `POST http://localhost:4000/api/v1/auth/register` with `{ role: "ADMIN" }` |
| Associated orders / stock data | **None (0 records)** | Direct Prisma count query: 0 orders, 0 warehouse assignments |
| Test suite isolation failure | **Negative (No failure)** | `tests/setup.ts` targets `stockflow_test_db`; `clearDatabase()` did not affect Neon |
| Password hashes / secrets exposed | **None** | Hashes redacted; only known dev script input strings referenced |
| Database modifications made | **None (Strictly Read-Only)** | No writes, deletes, or role alterations executed during audit |

