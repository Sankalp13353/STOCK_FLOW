# StockFlow — Distributed Inventory & Order Management System

[![Architecture: Modular Monolith](https://img.shields.io/badge/Architecture-Modular%20Monolith-blue.svg)](#)
[![Database: PostgreSQL + Prisma](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Prisma-indigo.svg)](#)
[![Backend: Node.js + TypeScript](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20TypeScript-green.svg)](#)
[![Testing: Jest + Supertest](https://img.shields.io/badge/Tests-118%20Passing-brightgreen.svg)](#)
[![Deployment: Render Free + Neon](https://img.shields.io/badge/Deployment-Render%20Free%20%7C%20Neon-00C7B7.svg)](#)

---

## 1. Project Overview

**StockFlow** is an enterprise-grade, distributed inventory and order management system engineered to solve mission-critical fulfillment challenges in high-concurrency e-commerce environments:

* **Zero Overselling Guarantee**: Prevents race conditions and negative inventory under extreme flash-sale spikes using row-level pessimistic database locking (`SELECT ... FOR UPDATE`) within strict ACID transaction boundaries.
* **Two-Phase Inventory Allocation**: Holds stock temporarily during checkout with a TTL-bound reservation engine and commits physical stock deduction only upon verified payment confirmation.
* **Deterministic Order State Machine**: Governs the complete order lifecycle with automated compensation workflows (releasing reserved stock on payment failure, client cancellation, or expiration).
* **Strict Idempotency Layer**: Guarantees that duplicate requests from network retries or client double-clicks produce identical cached results without double-billing or creating duplicate orders.
* **Transactional Outbox Engine**: Avoids the classic distributed dual-write bug by writing domain events to an atomic `outbox_events` PostgreSQL table inside the same transaction as business data mutations.
* **Decoupled Asynchronous Processing**: Autonomous background worker publishes outbox events to RabbitMQ topic exchanges with publisher confirms, driving dead-letter queues (DLQ), consumer retries, and notification dispatchers.
* **Resilient Cache-Aside Layer**: High-performance in-memory caching via Redis with deterministic pattern-based cache invalidation and transparent fail-open fallback to PostgreSQL if Redis is offline.

---

## 2. System Architecture

StockFlow employs a **Modular Monolith** architecture with strict separation of concerns between HTTP request serving and background asynchronous task execution:

```
                            [ Client Applications ]
                                       │
                                       ▼ (HTTPS / REST)
                   ┌───────────────────────────────────────┐
                   │             Express API               │
                   │        (src/server.ts, Port 4000)     │
                   │  - JWT Authentication & RBAC          │
                   │  - Idempotency & Rate Limiting        │
                   │  - Row-Level Locking Inventory Engine │
                   │  - Fail-Open Cache Middleware         │
                   └───────┬───────────────────────┬───────┘
                           │                       │
           (Read Cache /   │                       │ (ACID Transactions /
            Fail-Open)     │                       │  Outbox Event Logging)
                           ▼                       ▼
                  ┌─────────────────┐     ┌─────────────────┐
                  │      Redis      │     │  Neon Postgres  │
                  │  (Cache & Rate) │     │  - Products     │
                  └─────────────────┘     │  - Orders       │
                                          │  - Inventory    │
                                          │  - Outbox Table │
                                          └────────┬────────┘
                                                   │
                                (Polling via       │
                                 FOR UPDATE        │
                                 SKIP LOCKED)      │
                                                   ▼
                                          ┌─────────────────┐
                                          │ Background      │
                                          │ Worker Process  │
                                          │ (src/worker.ts) │
                                          └────────┬────────┘
                                                   │
                                (Publish Confirms  │
                                 & Event Consumer) │
                                                   ▼
                                          ┌─────────────────┐
                                          │    RabbitMQ     │
                                          │ Topic Exchanges │
                                          │ Queues & DLQ    │
                                          └─────────────────┘
```

---

## 3. Cloud vs. Local Environment Matrix

StockFlow is designed to run in two operational configurations:

| Capability | Cloud Deployment (Render Free + Neon) | Local Development (Docker Compose) |
| :--- | :--- | :--- |
| **Monthly Cost** | **₹0 ($0.00 / month)** | Free (Local workstation) |
| **HTTP REST API** | Active on Render Free Web Service (`stockflow-api`) | Active on `http://localhost:4000` |
| **PostgreSQL Database** | Serverless PostgreSQL on Neon (`DATABASE_URL`) | PostgreSQL container or Neon cloud DB |
| **Order & Inventory Concurrency** | Fully active (ACID row locks in PostgreSQL) | Fully active (ACID row locks in PostgreSQL) |
| **Transactional Outbox** | Writes events atomically to `outbox_events` table | Writes events to `outbox_events` table |
| **Outbox Event Publishing** | Offline (events remain queued in PostgreSQL) | Active (`outboxPublisherWorker` polls outbox) |
| **RabbitMQ Broker & DLQ** | Offline (omitted to maintain ₹0 cloud budget) | Active (`rabbitmq:3.13-management-alpine`) |
| **Asynchronous Consumers** | Offline (omitted to maintain ₹0 cloud budget) | Active (Notification & Inventory workers) |
| **Redis Caching & Rate Limiting**| Offline (operates in graceful fail-open mode) | Active (`redis:7-alpine`) |

---

## 4. Local Development Instructions

### 4.1 Prerequisites
* **Node.js**: `>= 20.x LTS`
* **npm**: `>= 10.x`
* **Docker & Docker Compose**: (for running container dependencies)

### 4.2 Installation & Setup
1. **Clone repository and install dependencies**:
   ```bash
   git clone https://github.com/your-username/stockflow.git
   cd stockflow
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to supply your Neon PostgreSQL credentials or local PostgreSQL database connection strings.

3. **Validate Prisma schema and compile TypeScript**:
   ```bash
   npx prisma validate
   npm run build
   ```

4. **Run the complete test suite**:
   ```bash
   npm test
   ```
   Runs 118 unit, integration, and high-concurrency race condition tests across 17 test suites with zero failures.

5. **Start individual services in development mode**:
   ```bash
   # Start HTTP API server with live reload (Port 4000)
   npm run dev:api

   # Start Background Worker process with live reload
   npm run dev:worker
   ```

---

## 5. Running the Complete Architecture via Docker Compose

To run the entire distributed architecture locally—including the API, background worker, Redis cache, and RabbitMQ message broker:

```bash
docker compose up --build
```

### Services Started:
* **API Service (`api`)**: Express backend listening on `http://localhost:4000`.
* **Worker Service (`worker`)**: Autonomous background process executing transactional outbox publishing, event consumer loops, and reservation expiration sweeping.
* **Redis (`redis`)**: In-memory data store on `localhost:6379`.
* **RabbitMQ (`rabbitmq`)**: AMQP broker on `localhost:5672` with Management Web UI at `http://localhost:15672` (default credentials: `guest` / `guest`).

### Verification:
```bash
# Verify API health
curl -s http://localhost:4000/health | jq .

# Verify RabbitMQ management UI in browser
open http://localhost:15672
```

---

## 6. Configuring Neon PostgreSQL

StockFlow uses Neon's dual-connection architecture to support high-throughput serverless connection pooling while enabling safe DDL migration locks:

1. **Create Neon Project**:
   * Sign up at [neon.tech](https://neon.tech) and create a PostgreSQL 16 database.
2. **Retrieve Connection Strings**:
   * **Pooled Connection (`DATABASE_URL`)**: Select **Connection pooling** mode (PgBouncer, port 5432). Used by the API server and worker at runtime.
   * **Direct Connection (`DIRECT_URL`)**: Select **Direct connection** mode (unpooled, port 5432). Required by Prisma CLI to execute schema migrations.
3. **Execute Migrations Safely**:
   ```bash
   DIRECT_URL="postgresql://user:pass@ep-direct.region.neon.tech/stockflow_db?sslmode=require" \
   DATABASE_URL="postgresql://user:pass@ep-pooler.region.neon.tech/stockflow_db?sslmode=require" \
   npx prisma migrate deploy
   ```
   * *Safety Note*: `prisma migrate deploy` strictly applies pending migration SQL files. It never drops data or modifies existing records.

---

## 7. Deploying the API on Render Free (₹0 Cloud Budget)

The backend API is pre-configured for automated deployment on Render's Free Web Service tier using the repository's [`render.yaml`](file:///Users/sankalp/Desktop/SDE_PRO_1/render.yaml) blueprint:

### 7.1 Deploy via Render Blueprint
1. Log in to the [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository (`SDE_PRO_1`) and select the `main` branch.
4. Render automatically identifies `render.yaml` and configures `stockflow-api` under `plan: free`.
5. When prompted for environment variables, supply your Neon credentials:
   * **`DATABASE_URL`**: Your Neon pooled connection string.
   * **`JWT_SECRET`**: Auto-generated 256-bit secure secret.
6. Click **Apply**. Render builds the multi-stage Dockerfile and deploys the free container.

### 7.2 Required Render Environment Variables

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations. |
| `PORT` | *(Injected by Render)* | Render dynamically provides `$PORT` (typically 10000). Express binds to `0.0.0.0:$PORT`. |
| `DATABASE_URL` | `postgresql://...neon.tech/stockflow_db?sslmode=require` | Pooled connection string to Neon PostgreSQL. |
| `JWT_SECRET` | *(Auto-generated or custom)* | Secret for signing user authentication tokens. |
| `CORS_ORIGIN` | `*` | Allowed origins (can be restricted to frontend domain). |

---

## 8. Testing the Deployed Cloud API

Once deployed, your service is accessible at `https://stockflow-api.onrender.com`:

### 8.1 Health & Uptime Probe
```bash
curl -i https://stockflow-api.onrender.com/health
```
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "service": "stockflow-backend",
    "timestamp": "2026-11-02T11:00:00.000Z",
    "uptimeSeconds": 15
  }
}
```

### 8.2 Authentication
```bash
# Register Admin Account
curl -X POST https://stockflow-api.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stockflow.dev","password":"AdminPassword123!","name":"Admin User","role":"ADMIN"}'

# Login to retrieve JWT
curl -X POST https://stockflow-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stockflow.dev","password":"AdminPassword123!"}'
```

### 8.3 Concurrency & Order Lifecycle
```bash
# Create Product SKU (Bearer token from login required)
curl -X POST https://stockflow-api.onrender.com/api/v1/products \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-LAPTOP-01","name":"Pro Laptop 15","price":1200}'

# Place Order with Row-Level Lock & Stock Hold
curl -X POST https://stockflow-api.onrender.com/api/v1/orders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: c9d023a1-7e8e-4a6c-9c7b-1234567890ab" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"<PRODUCT_UUID>","quantity":1}]}'
```

---

## 9. Limitations of the API-Only Cloud Deployment

To maintain a strict **₹0 monthly deployment budget**, be aware of the following operational tradeoffs:

1. **Inactivity Sleep & Cold Starts**:
   Render's Free Web Service automatically spins down after **15 minutes of zero inbound HTTP traffic**. The first request received after inactivity initiates a container boot, resulting in a **~50 second cold start delay**. Subsequent requests respond instantly.
2. **Compute Resources**:
   The Free tier provides **0.1 vCPU and 512 MB of RAM**, ideal for demonstration, staging, API contract evaluation, and portfolio verification.
3. **Monthly Free Instance Hours**:
   Render provides **750 free instance hours per month** per workspace. A single web service running continuously consumes ~720–744 hours, fitting comfortably within the free tier.
4. **Deferred Background Processing**:
   Because RabbitMQ and the background worker are not hosted on the free cloud tier, domain events written to PostgreSQL `outbox_events` remain stored in the database. Run the background worker locally via `docker compose up` to process cloud outbox events asynchronously.
5. **Fail-Open In-Memory Caching**:
   Without a dedicated cloud Redis instance, the API detects connection absence and transparently serves queries directly from Neon PostgreSQL without throwing errors or dropping traffic.
