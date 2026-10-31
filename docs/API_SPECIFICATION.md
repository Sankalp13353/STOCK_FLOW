# REST API Specification
## StockFlow — Distributed Inventory & Order Management System

---

## 1. Global API Conventions

### 1.1 Base URL
All endpoints are versioned under the prefix:
```
/api/v1
```

### 1.2 Common Request Headers
- `Content-Type: application/json`
- `Authorization: Bearer <JWT_TOKEN>` (for authenticated endpoints)
- `Idempotency-Key: <UUIDv4>` (required for all mutating order and payment endpoints)

### 1.3 Standard Response Envelope
All API responses adhere to a consistent JSON envelope.

**Success Response Envelope (`HTTP 2xx`):**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-10-31T12:00:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalRecords": 100,
      "totalPages": 5
    }
  }
}
```

**Error Response Envelope (`HTTP 4xx / 5xx`):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Requested quantity exceeds available inventory for SKU: PROD-MACBOOK-16",
    "details": [
      {
        "field": "items[0].quantity",
        "issue": "Requested 5, available: 2"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-10-31T12:00:00.000Z"
  }
}
```

---

## 2. Authentication Endpoints

### 2.1 Register User
- **Method:** `POST`
- **URL:** `/api/v1/auth/register`
- **Purpose:** Registers a new user account with role assignment.
- **Access:** Public

**Request Body:**
```json
{
  "email": "sarah.admin@stockflow.internal",
  "password": "SecurePassword123!",
  "fullName": "Sarah Connor",
  "role": "ADMIN"
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "e9b25fcb-87d2-4ce0-9884-a15d742ebca3",
      "email": "sarah.admin@stockflow.internal",
      "fullName": "Sarah Connor",
      "role": "ADMIN",
      "createdAt": "2026-10-31T12:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `400 Bad Request`: Payload validation failed (e.g. invalid email format, weak password).
- `409 Conflict`: User with email already exists.

---

### 2.2 Login User
- **Method:** `POST`
- **URL:** `/api/v1/auth/login`
- **Purpose:** Authenticates user credentials and issues a signed JWT token.
- **Access:** Public

**Request Body:**
```json
{
  "email": "sarah.admin@stockflow.internal",
  "password": "SecurePassword123!"
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "e9b25fcb-87d2-4ce0-9884-a15d742ebca3",
      "email": "sarah.admin@stockflow.internal",
      "fullName": "Sarah Connor",
      "role": "ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid email or password.

---

### 2.3 Get Current User
- **Method:** `GET`
- **URL:** `/api/v1/auth/me`
- **Purpose:** Fetches the profile and permissions of the currently authenticated token bearer.
- **Access:** Authenticated (`CUSTOMER`, `WAREHOUSE_STAFF`, `ADMIN`)

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "e9b25fcb-87d2-4ce0-9884-a15d742ebca3",
    "email": "sarah.admin@stockflow.internal",
    "fullName": "Sarah Connor",
    "role": "ADMIN",
    "createdAt": "2026-10-31T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing, expired, or invalid JWT token.

---

## 3. Product Endpoints

### 3.1 Create Product
- **Method:** `POST`
- **URL:** `/api/v1/products`
- **Purpose:** Registers a new SKU in the product catalog.
- **Access:** Admin only (`ADMIN`)

**Request Body:**
```json
{
  "sku": "PROD-MBP16-M3",
  "name": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
  "description": "High performance workstation laptop",
  "priceCents": 349900,
  "isActive": true
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "id": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
    "sku": "PROD-MBP16-M3",
    "name": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
    "description": "High performance workstation laptop",
    "priceCents": 349900,
    "isActive": true,
    "createdAt": "2026-10-31T12:05:00.000Z",
    "updatedAt": "2026-10-31T12:05:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Validation failure (negative price, empty SKU).
- `409 Conflict`: Product SKU already exists.

---

### 3.2 List Products
- **Method:** `GET`
- **URL:** `/api/v1/products?page=1&limit=20&isActive=true&search=macbook`
- **Purpose:** Retrieves paginated list of catalog products with optional filtering.
- **Access:** Public / Authenticated

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
      "sku": "PROD-MBP16-M3",
      "name": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
      "priceCents": 349900,
      "isActive": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalRecords": 1,
    "totalPages": 1
  }
}
```

---

### 3.3 Get Product by ID
- **Method:** `GET`
- **URL:** `/api/v1/products/:id`
- **Purpose:** Fetches details of a single product SKU by UUID.
- **Access:** Public / Authenticated

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
    "sku": "PROD-MBP16-M3",
    "name": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
    "description": "High performance workstation laptop",
    "priceCents": 349900,
    "isActive": true,
    "createdAt": "2026-10-31T12:05:00.000Z"
  }
}
```

**Error Responses:**
- `404 Not Found`: Product ID does not exist.

---

### 3.4 Update Product
- **Method:** `PATCH`
- **URL:** `/api/v1/products/:id`
- **Purpose:** Updates product name, price, description, or active status.
- **Access:** Admin only (`ADMIN`)

**Request Body:**
```json
{
  "priceCents": 329900,
  "isActive": true
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
    "sku": "PROD-MBP16-M3",
    "name": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
    "priceCents": 329900,
    "isActive": true,
    "updatedAt": "2026-10-31T12:10:00.000Z"
  }
}
```

---

## 4. Warehouse Endpoints

### 4.1 Create Warehouse
- **Method:** `POST`
- **URL:** `/api/v1/warehouses`
- **Purpose:** Registers a physical distribution center.
- **Access:** Admin only (`ADMIN`)

**Request Body:**
```json
{
  "code": "WH-US-EAST-01",
  "name": "North Bergen Fulfillment Center",
  "address": "8300 Tonnelle Ave",
  "city": "North Bergen",
  "country": "USA",
  "isActive": true
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "id": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62",
    "code": "WH-US-EAST-01",
    "name": "North Bergen Fulfillment Center",
    "address": "8300 Tonnelle Ave",
    "city": "North Bergen",
    "country": "USA",
    "isActive": true,
    "createdAt": "2026-10-31T12:12:00.000Z"
  }
}
```

**Error Responses:**
- `409 Conflict`: Warehouse code already registered.

---

### 4.2 List Warehouses
- **Method:** `GET`
- **URL:** `/api/v1/warehouses`
- **Purpose:** Lists all active fulfillment centers.
- **Access:** Authenticated (`CUSTOMER`, `WAREHOUSE_STAFF`, `ADMIN`)

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62",
      "code": "WH-US-EAST-01",
      "name": "North Bergen Fulfillment Center",
      "city": "North Bergen",
      "country": "USA",
      "isActive": true
    }
  ]
}
```

---

## 5. Inventory Endpoints

### 5.1 Restock Inventory
- **Method:** `POST`
- **URL:** `/api/v1/inventory/restock`
- **Purpose:** Adds stock to a specific warehouse for a product. Atomically creates an `inventory_movements` record.
- **Access:** Warehouse Staff or Admin (`WAREHOUSE_STAFF`, `ADMIN`)

**Request Body:**
```json
{
  "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
  "warehouseId": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62",
  "quantity": 100,
  "notes": "PO-2026-9921 Initial shipment received"
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "inventoryId": "912b7a0d-d9b8-4796-a886-f6cbb7bf394a",
    "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
    "warehouseId": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62",
    "quantityOnHand": 100,
    "quantityReserved": 0,
    "quantityAvailable": 100,
    "movementId": "6c46a6f6-419b-449e-baef-c288d6eb10f4"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Quantity must be an integer greater than zero.
- `404 Not Found`: Product ID or Warehouse ID does not exist.

---

### 5.2 Get Global Inventory Overview
- **Method:** `GET`
- **URL:** `/api/v1/inventory?productId=7b8db047-9dc0-459f-9ec3-7f2873dc2ab2`
- **Purpose:** Fetches stock levels across all warehouses for catalog browsing.
- **Access:** Authenticated

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
    "totalOnHand": 150,
    "totalReserved": 20,
    "totalAvailable": 130,
    "breakdown": [
      {
        "warehouseId": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62",
        "warehouseCode": "WH-US-EAST-01",
        "quantityOnHand": 100,
        "quantityReserved": 15,
        "quantityAvailable": 85
      },
      {
        "warehouseId": "cf1424ad-88e9-4e0c-99d8-c7ea86d93617",
        "warehouseCode": "WH-US-WEST-01",
        "quantityOnHand": 50,
        "quantityReserved": 5,
        "quantityAvailable": 45
      }
    ]
  }
}
```

---

### 5.3 Get Inventory by Warehouse
- **Method:** `GET`
- **URL:** `/api/v1/inventory/warehouse/:warehouseId`
- **Purpose:** Lists all product stock allocations at a single warehouse facility.
- **Access:** Warehouse Staff or Admin (`WAREHOUSE_STAFF`, `ADMIN`)

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "inventoryId": "912b7a0d-d9b8-4796-a886-f6cbb7bf394a",
      "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
      "sku": "PROD-MBP16-M3",
      "productName": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
      "quantityOnHand": 100,
      "quantityReserved": 15,
      "quantityAvailable": 85
    }
  ]
}
```

---

## 6. Order Endpoints

### 6.1 Create Order (Place Checkout)
- **Method:** `POST`
- **URL:** `/api/v1/orders`
- **Purpose:** Atomically verifies available stock, creates order record, places pessimistic row locks, and holds stock with a 15-minute reservation TTL.
- **Access:** Authenticated (`CUSTOMER`, `ADMIN`)
- **Headers:** `Idempotency-Key: <UUID>` (Required)

**Request Body:**
```json
{
  "shippingAddress": "742 Evergreen Terrace, Springfield, OR 97477",
  "items": [
    {
      "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
      "warehouseId": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62",
      "quantity": 2
    }
  ]
}
```

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "e81d113e-f633-4f98-b808-3df08cb727e0",
      "orderNumber": "ORD-20261031-7721",
      "status": "RESERVED",
      "totalAmountCents": 699800,
      "shippingAddress": "742 Evergreen Terrace, Springfield, OR 97477",
      "createdAt": "2026-10-31T12:20:00.000Z",
      "items": [
        {
          "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
          "quantity": 2,
          "unitPriceCents": 349900,
          "subtotalCents": 699800,
          "warehouseId": "55c4d184-e9be-4e3e-bf6e-6c0b3493db62"
        }
      ],
      "reservation": {
        "status": "ACTIVE",
        "expiresAt": "2026-10-31T12:35:00.000Z",
        "ttlMinutes": 15
      }
    }
  }
}
```

**Idempotent Cached Response (`200 OK`):**
If the same request is submitted with an already processed `Idempotency-Key`, the exact same response is returned with an `Idempotent-Replay: true` header without creating a new order or locking additional stock.

**Error Responses:**
- `400 Bad Request`: Missing `Idempotency-Key` header or malformed line items.
- `409 Conflict`: Insufficient stock available at specified warehouse (`INSUFFICIENT_STOCK`).
- `422 Unprocessable Entity`: Product inactive or pricing mismatch.

---

### 6.2 Get Order by ID
- **Method:** `GET`
- **URL:** `/api/v1/orders/:id`
- **Purpose:** Fetches full order details including line items, reservation status, and payment logs.
- **Access:** Authenticated (Owner of order or `ADMIN`)

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "e81d113e-f633-4f98-b808-3df08cb727e0",
    "orderNumber": "ORD-20261031-7721",
    "status": "CONFIRMED",
    "totalAmountCents": 699800,
    "shippingAddress": "742 Evergreen Terrace, Springfield, OR 97477",
    "createdAt": "2026-10-31T12:20:00.000Z",
    "updatedAt": "2026-10-31T12:22:15.000Z",
    "items": [
      {
        "id": "21381389-9a71-460d-83ff-a764d08b3db9",
        "productId": "7b8db047-9dc0-459f-9ec3-7f2873dc2ab2",
        "sku": "PROD-MBP16-M3",
        "productName": "Apple MacBook Pro 16\" (M3 Max, 36GB, 1TB)",
        "quantity": 2,
        "unitPriceCents": 349900,
        "subtotalCents": 699800
      }
    ]
  }
}
```

**Error Responses:**
- `403 Forbidden`: User does not own this order.
- `404 Not Found`: Order ID not found.

---

### 6.3 List Customer Orders
- **Method:** `GET`
- **URL:** `/api/v1/orders?page=1&limit=10&status=CONFIRMED`
- **Purpose:** Fetches customer order history (or all orders if caller is `ADMIN`).
- **Access:** Authenticated

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "e81d113e-f633-4f98-b808-3df08cb727e0",
      "orderNumber": "ORD-20261031-7721",
      "status": "CONFIRMED",
      "totalAmountCents": 699800,
      "itemCount": 2,
      "createdAt": "2026-10-31T12:20:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "totalRecords": 1,
    "totalPages": 1
  }
}
```

---

### 6.4 Cancel Order
- **Method:** `POST`
- **URL:** `/api/v1/orders/:id/cancel`
- **Purpose:** Cancels an order before fulfillment dispatch. Automatically releases held reservations or triggers restock and refund.
- **Access:** Authenticated (Order owner or `ADMIN`)

**Request Body:**
```json
{
  "reason": "Customer requested cancellation prior to dispatch"
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "orderId": "e81d113e-f633-4f98-b808-3df08cb727e0",
    "orderNumber": "ORD-20261031-7721",
    "status": "CANCELLED",
    "cancelledAt": "2026-10-31T12:25:00.000Z",
    "compensation": {
      "stockReleased": true,
      "refundInitiated": false
    }
  }
}
```

**Error Responses:**
- `422 Unprocessable Entity`: Order has already been shipped (`SHIPPED`) or delivered (`DELIVERED`) and cannot be cancelled.

---

## 7. Payment Simulation Endpoints

### 7.1 Process Payment Simulation
- **Method:** `POST`
- **URL:** `/api/v1/payments/process`
- **Purpose:** Simulates payment authorization and capture. On success: commits stock and marks order `CONFIRMED`. On failure: releases stock and marks order `PAYMENT_FAILED`.
- **Access:** Authenticated
- **Headers:** `Idempotency-Key: <UUID>`

**Request Body:**
```json
{
  "orderId": "e81d113e-f633-4f98-b808-3df08cb727e0",
  "amountCents": 699800,
  "paymentMethod": "MOCK_CREDIT_CARD",
  "simulateOutcome": "SUCCESS"
}
```
*(Note: `simulateOutcome` accepts `"SUCCESS"` or `"FAIL"` for automated integration testing)*

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "paymentId": "481a5472-ee6e-44ef-a6bc-e214d0fef310",
    "orderId": "e81d113e-f633-4f98-b808-3df08cb727e0",
    "status": "SUCCESS",
    "transactionReference": "TXN-20261031-99812",
    "orderStatus": "CONFIRMED"
  }
}
```

**Declined Response (`200 OK` with Failure Status):**
```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_DECLINED",
    "message": "Card authorization failed: Insufficient funds",
    "details": {
      "orderStatus": "PAYMENT_FAILED",
      "stockReleased": true
    }
  }
}
```

