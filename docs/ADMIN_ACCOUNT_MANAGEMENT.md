# StockFlow — Administrator Account Management Guide

**Document Version:** 1.0  
**Target Systems:** StockFlow Backend CLI & RBAC Engine  
**Last Updated:** November 4, 2026  

---

## 1. Overview & Architectural Principles

StockFlow enforces strict Separation of Duties and Role-Based Access Control (RBAC). The application recognizes four primary user roles:
1. `ADMIN`: Organization-wide operational and configuration control.
2. `WAREHOUSE_MANAGER`: Facility-level management and inventory oversight for assigned warehouses.
3. `WAREHOUSE_STAFF`: Order fulfillment and floor-level operations for assigned warehouses.
4. `CUSTOMER`: Public catalog viewing, cart management, and order placement.

### Key Security Safeguards
* **Zero Public Admin Registration:** The public registration endpoint (`POST /api/v1/auth/register`) strictly ignores client-supplied `role` attributes and unconditionally registers accounts as `CUSTOMER`.
* **No Default Credentials:** The codebase contains zero hardcoded default administrator credentials or backdoor seed users.
* **Separation of Bootstrap and Ongoing Creation:**
  - `npm run admin:bootstrap`: Used exclusively to provision the **first** administrator when no administrators exist.
  - `npm run admin:create`: Used for ongoing administrator provisioning, requiring cryptographically verified authorization from an active administrator.
* **Credential Protection:** Both CLI utilities prioritize **interactive masked password entry**, preventing sensitive passwords from persisting in bash/zsh shell histories (`~/.zsh_history`), process tables (`ps aux`), or CI/CD logs.
* **Audit Logging:** Every administrative provisioning event is permanently recorded in the database via the `outbox_events` table (`ADMIN_ACCOUNT_BOOTSTRAPPED` and `ADMIN_ACCOUNT_PROVISIONED`).

---

## 2. Initial Administrator Bootstrap

### Command
```bash
npm run admin:bootstrap
```

### Purpose
Provisions the initial primary administrator account for a fresh installation or an environment where all administrator accounts have been removed.

### Execution Workflow

```
┌────────────────────────────────────────────────────────┐
│  npm run admin:bootstrap                                │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
       [ Does an ADMIN already exist? ]
        ├── YES ──► Abort with Safety Notice (Exit 0)
        └── NO
             │
             ▼
       [ Prompt for Name, Email, Password (masked) ]
             │
             ▼
       [ Validate Email Format & Password >= 8 chars ]
             │
             ▼
       [ Does Email belong to existing non-admin user? ]
        ├── YES ──► Abort without overwriting (Exit 0)
        └── NO
             │
             ▼
       [ Hash Password with bcrypt (10 rounds) ]
             │
             ▼
       [ Atomic Transaction: Create User (ADMIN) + Outbox Audit ]
             │
             ▼
       [ Output User Summary (Redacted) & Disconnect Prisma ]
```

### Interactive Usage (Recommended)
Simply execute the command in your terminal. You will be prompted interactively with hidden password input:
```text
$ npm run admin:bootstrap
====================================================
StockFlow — Initial Administrator Account Bootstrap
====================================================
Required credentials not supplied via environment variables. Entering secure interactive setup...

Enter Administrator Full Name: Alice Admin
Enter Administrator Email Address: alice@stockflow.dev
Enter Administrator Password (hidden): 
Confirm Administrator Password (hidden): 

✅ Initial administrator successfully created:
   User ID:   3811d803-f918-4aef-a652-59a24797cca7
   Full Name: Alice Admin
   Email:     alice@stockflow.dev
   Role:      ADMIN
   Created:   2026-11-04T15:25:14.376Z
   Security:  Password securely hashed with bcrypt (10 rounds). Plaintext credentials were not stored or logged.
   Audit:     Logged ADMIN_ACCOUNT_BOOTSTRAPPED event to outbox.
```

### Non-Interactive / CI Usage
For non-interactive container initialization or automation where stdin is not a TTY, credentials may be supplied via environment variables:
```bash
ADMIN_NAME="Alice Admin" \
ADMIN_EMAIL="alice@stockflow.dev" \
ADMIN_PASSWORD="SecurePassword123!" \
npm run admin:bootstrap
```

### Idempotency & Safety Guarantees
* If an administrator already exists in the database, running `npm run admin:bootstrap` exits safely without taking action:
  ```text
  ⚠️  [Safety Notice] An administrator account already exists (alice@stockflow.dev, ID: ...). For system security, initial bootstrap can only provision the primary administrator.
  To provision additional administrators, use: npm run admin:create
  ```
* If the specified email is already in use by a `CUSTOMER`, `WAREHOUSE_MANAGER`, or `WAREHOUSE_STAFF`, the script refuses to modify their role, password, or existing records.

---

## 3. Provisioning Additional Administrators

### Command
```bash
npm run admin:create
```

### Purpose
Provisions subsequent administrator accounts. To prevent unauthorized privilege escalation, the script mandates that an **existing, active administrator authorizes the creation** before the new user record is committed.

### Authorization Requirement
The operator must provide the email and password of an existing account that has `role === UserRole.ADMIN`. The script cryptographically verifies this against the database using `bcrypt.compare`.

### Interactive Usage (Recommended)
```text
$ npm run admin:create
====================================================
StockFlow — Provision Additional Administrator Account
====================================================
Authorization required. Enter credentials of an active Administrator:

Authorizing Admin Email: alice@stockflow.dev
Authorizing Admin Password (hidden): 

🔒 Authorization verified: Alice Admin (alice@stockflow.dev)

Enter details for the new Administrator account:

New Admin Full Name: Bob Operator
New Admin Email Address: bob@stockflow.dev
New Admin Password (min 8 chars, hidden): 
Confirm New Admin Password (hidden): 

✅ Additional administrator successfully created:
   User ID:       c482a17f-1d84-4820-a612-4e892c9b21ea
   Full Name:     Bob Operator
   Email:         bob@stockflow.dev
   Role:          ADMIN
   Authorized By: Alice Admin (alice@stockflow.dev)
   Created:       2026-11-04T15:30:22.118Z
   Audit:         Logged ADMIN_ACCOUNT_PROVISIONED event to outbox.
```

### Non-Interactive / Automation Usage
```bash
AUTHORIZER_EMAIL="alice@stockflow.dev" \
AUTHORIZER_PASSWORD="AlicePassword123!" \
NEW_ADMIN_NAME="Bob Operator" \
NEW_ADMIN_EMAIL="bob@stockflow.dev" \
NEW_ADMIN_PASSWORD="BobSecurePassword123!" \
npm run admin:create
```

### Safety Rules & Validations
1. **Invalid Authorizer Credentials:** Fails immediately with `Authorization failed: Invalid administrator credentials.`
2. **Non-Admin Authorizer:** If an email belonging to a `CUSTOMER` or `WAREHOUSE_STAFF` is supplied, it is rejected with `User '...' does not have ADMIN privileges`.
3. **Target Email Collision:** Rejects if `NEW_ADMIN_EMAIL` already exists under any role. Existing customer or staff accounts cannot be silently elevated to administrator.
4. **Password Length:** Rejects passwords under 8 characters.

---

## 4. Audit Logging & Traceability

Both admin provisioning actions emit transactional outbox events to the `outbox_events` table within the same PostgreSQL transaction that creates the user:

### Event Types
1. **`ADMIN_ACCOUNT_BOOTSTRAPPED`**
   ```json
   {
     "adminId": "3811d803-f918-4aef-a652-59a24797cca7",
     "adminEmail": "alice@stockflow.dev",
     "adminFullName": "Alice Admin",
     "bootstrappedAt": "2026-11-04T15:25:14.376Z",
     "method": "CLI_BOOTSTRAP"
   }
   ```
2. **`ADMIN_ACCOUNT_PROVISIONED`**
   ```json
   {
     "newAdminId": "c482a17f-1d84-4820-a612-4e892c9b21ea",
     "newAdminEmail": "bob@stockflow.dev",
     "newAdminFullName": "Bob Operator",
     "authorizedByAdminId": "3811d803-f918-4aef-a652-59a24797cca7",
     "authorizedByAdminEmail": "alice@stockflow.dev",
     "provisionedAt": "2026-11-04T15:30:22.118Z",
     "method": "CLI_ADMIN_CREATE"
   }
   ```

---

## 5. Disaster Recovery: What If All Admin Accounts Are Lost?

If all administrators are locked out, have lost their passwords, or have been deleted:
1. Since `admin count === 0`, `npm run admin:bootstrap` automatically reactivates and becomes available again.
2. Run `npm run admin:bootstrap` in the terminal to provision a fresh initial administrator.
3. If an existing user account needs to be promoted to administrator in an emergency without resetting their record, an administrator must sign into the database directly with elevated permissions (e.g., Neon console or psql):
   ```sql
   UPDATE "users" SET "role" = 'ADMIN' WHERE "email" = 'chosen.user@company.com';
   ```
   *Never alter passwords directly via raw SQL without generating a valid bcrypt hash with 10 salt rounds.*

---

## 6. Database Schema & Migration Status (Neon Notice)

> [!WARNING]
> **Active Database Migration State Notice:**  
> The active Neon PostgreSQL database (`neondb`) currently contains the core schema up to migration `20261102082317_add_warehouse_manager_and_assignments`.  
> 
> The following two migrations exist in the repository but have **not yet been applied to Neon**:
> 1. `20261103193645_add_minimum_stock_threshold` (Creates `minimum_stock_thresholds` table)
> 2. `20261104123304_add_ticket_and_notification_models` (Creates `tickets` and `notifications` tables)
> 
> The administrator provisioning system (`npm run admin:bootstrap` and `npm run admin:create`) operates strictly on the `users` and `outbox_events` tables, which are fully present and active in Neon. Applying pending migrations should be performed as part of a dedicated, planned migration release (`npx prisma migrate deploy`).

