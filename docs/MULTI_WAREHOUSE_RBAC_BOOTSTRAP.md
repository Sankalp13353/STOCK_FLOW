# StockFlow — Initial Admin Bootstrap & Multi-Warehouse Role Management

## 1. Overview
This document specifies the secure initial administrator account creation mechanism and the relational multi-warehouse role-based access control (RBAC) architecture for StockFlow.

---

## 2. Target Role Hierarchy

StockFlow defines four distinct operational roles within the `UserRole` enum:

| Role | Scope | Permitted Capabilities | Prohibited Capabilities |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Organization-wide | • Create, list, and manage users.<br>• Assign/modify user roles.<br>• Assign and revoke warehouse facility access.<br>• Full access to all warehouses and global inventory.<br>• Full product catalog management. | None. Primary governance role. |
| **`WAREHOUSE_MANAGER`** | Multi-Warehouse Assigned Facilities | • Oversee multiple assigned warehouse facilities.<br>• Inspect inventory balances in assigned warehouses.<br>• Perform restock & stock operations in assigned warehouses.<br>• Trigger reservation expiry across operations.<br>• Oversee customer orders fulfilled by assigned warehouses. | • Cannot assign `ADMIN` or alter user roles.<br>• Cannot access or modify unassigned warehouses.<br>• Cannot mutate global product catalog definitions. |
| **`WAREHOUSE_STAFF`** | Single / Multi-Facility Operational | • Inspect inventory within assigned warehouses.<br>• Execute stock replenishment (`/restock`, `/stock`) in assigned facilities.<br>• Trigger reservation expiry sweeps. | • Cannot access unassigned warehouses.<br>• Cannot change user roles or assignments.<br>• Cannot manage global system settings. |
| **`CUSTOMER`** | Consumer / Self-Service | • Register via public registration (always defaults to `CUSTOMER`).<br>• Create checkout orders and simulate payments.<br>• View own orders (`/my-orders`). | • **Strictly forbidden** from accessing internal warehouse facilities.<br>• Cannot view or mutate warehouse inventories.<br>• Cannot assign roles. |

---

## 3. Relational Warehouse Assignment Model

### 3.1 Entity Relationship
A many-to-many relationship connects `User` and `Warehouse` via the `user_warehouse_assignments` join table:

```
┌──────────────────┐               ┌─────────────────────────────┐               ┌──────────────────┐
│      User        │ 1           * │  UserWarehouseAssignment    │ *           1 │    Warehouse     │
│──────────────────│───────────────│─────────────────────────────│───────────────│──────────────────│
│ id (UUID, PK)    │               │ id (UUID, PK)               │               │ id (UUID, PK)    │
│ email (Unique)   │               │ user_id (UUID, FK -> User)  │               │ code (Unique)    │
│ role (UserRole)  │               │ warehouse_id (UUID, FK)     │               │ name             │
│ full_name        │               │ role (UserRole, Optional)   │               │ is_active        │
│ password_hash    │               │ assigned_at (Timestamptz)   │               │ address, city... │
└──────────────────┘               └─────────────────────────────┘               └──────────────────┘
                                      ▲
                                      └── UNIQUE(user_id, warehouse_id)
```

### 3.2 Schema Definition
```prisma
model UserWarehouseAssignment {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  warehouseId String    @map("warehouse_id") @db.Uuid
  role        UserRole? // Optional role designation (e.g. WAREHOUSE_MANAGER, WAREHOUSE_STAFF)
  assignedAt  DateTime  @default(now()) @map("assigned_at") @db.Timestamptz

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  warehouse   Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)

  @@unique([userId, warehouseId], map: "uq_user_warehouse")
  @@index([userId], map: "idx_user_warehouse_user")
  @@index([warehouseId], map: "idx_user_warehouse_warehouse")
  @@map("user_warehouse_assignments")
}
```

- **Referential Integrity**: Cascading deletion cleans up assignments if a user or warehouse is removed.
- **Duplicate Prevention**: `UNIQUE(user_id, warehouse_id)` guarantees a user cannot be assigned to the same warehouse multiple times.
- **Immediate Revocation**: Deleting an assignment record instantly revokes access without needing token invalidation.

---

## 4. Backend Authorization Architecture

Authorization is enforced at the **service and database query layer** rather than relying solely on HTTP route guards or client UI logic:

### 4.1 Authorization Flow
```
Incoming HTTP Request
       │
       ▼
authenticate (JWT Verification)
       │
       ▼
authenticateOptional / authorize(Roles...)
       │
       ▼
WarehouseAccessService
       ├─ If role == ADMIN ───────────────► ALLOW (Organization-Wide)
       ├─ If role == CUSTOMER ────────────► DENY 403 Forbidden
       └─ If MANAGER / STAFF
             │
             ▼
       Query `user_warehouse_assignments`
             ├─ Exists ──────────────────► ALLOW
             └─ Not Found ───────────────► DENY 403 Forbidden
```

### 4.2 Protected Endpoints Matrix

| Endpoint | Method | Allowed Roles | Warehouse Scoping / Enforcement |
| :--- | :--- | :--- | :--- |
| `/api/v1/warehouses` | `GET` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | • `ADMIN`: returns all facilities.<br>• `MANAGER` / `STAFF`: filtered to assigned facilities.<br>• `CUSTOMER`: 403 Forbidden. |
| `/api/v1/warehouses/:id` | `GET` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | • `ADMIN`: allowed.<br>• `MANAGER` / `STAFF`: verified via `ensureWarehouseAccess`. If unassigned: 403 Forbidden.<br>• `CUSTOMER`: 403 Forbidden. |
| `/api/v1/warehouses` | `POST` | `ADMIN` only | Provision new warehouse facility. |
| `/api/v1/inventory/warehouse/:id` | `GET` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | Requires assignment to `:id`. If unassigned: 403 Forbidden. |
| `/api/v1/inventory/restock` | `POST` | `ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | `warehouseId` in payload verified against caller's active assignments. |
| `/api/v1/orders/:id` | `GET` | `ADMIN`, `CUSTOMER` (owner), `WAREHOUSE_MANAGER` | • `MANAGER` can view orders fulfilling items from their assigned warehouses.<br>• `CUSTOMER` restricted to own orders. |
| `/api/v1/users/*` | `*` | `ADMIN` only | User management, role assignment, and facility access provisioning. |

---

## 5. Initial Administrator Bootstrap CLI

Public registration (`POST /api/v1/auth/register`) strictly assigns `CUSTOMER` and refuses privileged roles. The initial administrator must be created via the secure CLI bootstrap script.

### 5.1 Environment Variables
| Variable | Description | Constraints |
| :--- | :--- | :--- |
| `ADMIN_NAME` | Full name of the initial administrator | Required, min 2 chars |
| `ADMIN_EMAIL` | Unique email address | Required, valid email format |
| `ADMIN_PASSWORD` | Administrator initial password | Required, min 8 characters |

### 5.2 Safety & Security Guarantees
1. **One-Time Provisioning**: If an `ADMIN` account already exists in the database, the script aborts immediately with a safety notice and refuses to create another administrator.
2. **Safe Conflict Handling**: If the email already exists, the script fails safely without modifying the existing user's role or password.
3. **No Plaintext Storage**: Plaintext passwords are never logged, echoed, or stored. Passwords are salted and hashed using bcrypt (10 rounds).
4. **No Public Endpoint**: The bootstrap mechanism exists solely as a backend CLI utility.

### 5.3 Local Usage Instructions

Run the bootstrap command using inline environment variables:
```bash
ADMIN_NAME="System Administrator" \
ADMIN_EMAIL="admin@stockflow.dev" \
ADMIN_PASSWORD="SecureBootstrapPassword123!" \
npm run admin:bootstrap
```

Or configure variables in `.env` and execute:
```bash
npm run admin:bootstrap
```

**Expected Console Output:**
```
====================================================
StockFlow — Initial Administrator Account Bootstrap
====================================================
✅ Initial administrator successfully created:
   User ID:   42fc21e3-2039-4474-8ea0-7d3bc7f18c0f
   Full Name: System Administrator
   Email:     admin@stockflow.dev
   Role:      ADMIN
   Created:   2026-11-02T08:33:39.517Z
   Security:  Password securely hashed with bcrypt (10 rounds). Plaintext credentials were not stored or logged.
```

---

## 6. Administrative User Management APIs

All user management endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.

### 6.1 List Users
```http
GET /api/v1/users?page=1&limit=20&role=WAREHOUSE_MANAGER
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "738cc580-091d-4e0e-b11d-008dddfa6706",
      "email": "manager.chicago@stockflow.dev",
      "fullName": "Marcus Vance",
      "role": "WAREHOUSE_MANAGER",
      "warehouseAssignments": [
        {
          "id": "e817a329-3739-4ce4-82a9-08246f6630a9",
          "warehouseId": "74870db9-68b2-4b11-96f1-001a1f0a2839",
          "role": "WAREHOUSE_MANAGER",
          "warehouse": {
            "code": "WH-ORD-01",
            "name": "Chicago Central Fulfillment Hub",
            "city": "Chicago",
            "country": "United States"
          }
        }
      ]
    }
  ]
}
```

### 6.2 View User Details
```http
GET /api/v1/users/:id
```

### 6.3 Assign User Role
```http
PATCH /api/v1/users/:id/role
Content-Type: application/json

{
  "role": "WAREHOUSE_MANAGER"
}
```

### 6.4 Assign User to Warehouse
```http
POST /api/v1/users/:id/warehouses
Content-Type: application/json

{
  "warehouseId": "74870db9-68b2-4b11-96f1-001a1f0a2839",
  "role": "WAREHOUSE_MANAGER"
}
```
*Note: Returns 409 Conflict with code `DUPLICATE_WAREHOUSE_ASSIGNMENT` if already assigned.*

### 6.5 Remove Warehouse Assignment (Immediate Revocation)
```http
DELETE /api/v1/users/:id/warehouses/:warehouseId
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Warehouse assignment removed successfully"
  }
}
```

### 6.6 View User's Warehouse Assignments
```http
GET /api/v1/users/:id/warehouses
```
*Accessible by `ADMIN` or the user themselves.*

---

## 7. Migration Safety & Existing Accounts

- **Forward-Only Migration**: Applied via `20261102082317_add_warehouse_manager_and_assignments/migration.sql`.
- **Existing `WAREHOUSE_STAFF` Accounts**:
  - Existing staff accounts are preserved in the `users` table without modification.
  - To prevent unauthorized access across regional boundaries, existing staff accounts initially possess zero facility assignments.
  - Administrators provision appropriate facilities using `POST /api/v1/users/:id/warehouses`.

