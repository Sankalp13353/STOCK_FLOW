# StockFlow: Render Free Deployment Guide & Operational Runbook
## Target: Render Free Web Service (API Only) — ₹0 Monthly Cloud Budget

This document details the configuration, deployment, security model, and operational management of the **StockFlow API** on [Render](https://render.com) under a **strict ₹0 ($0/month)** deployment budget, backed by serverless PostgreSQL on [Neon](https://neon.tech).

---

## 1. Cloud vs. Local Architecture Comparison

To maintain a ₹0 cloud budget, only the stateless Express REST API is deployed to Render's Free Web Service tier. The full distributed event-driven architecture (including the Background Worker, RabbitMQ broker, and Redis cache) is preserved and fully functional in the local Docker Compose environment.

### 1.1 Cloud Architecture (Render Free — ₹0/mo)

```
                       [ Incoming HTTPS Traffic ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │        stockflow-api          │
                   │   (Render Free Web Service)   │
                   │   Plan: free (0.1 CPU, 512MB) │
                   │   Port: $PORT (0.0.0.0)       │
                   │   Health: /health             │
                   └───────────────┬───────────────┘
                                   │
                                   │ (Direct / Pooled SSL)
                                   ▼
                   ┌───────────────────────────────┐
                   │        Neon PostgreSQL        │
                   │       (Free / Launch Tier)    │
                   │   - DATABASE_URL (Pooled)     │
                   │   - DIRECT_URL (Unpooled)     │
                   │   - Outbox Events Table       │
                   └───────────────────────────────┘
```

* **Express REST API**: Serves all HTTP endpoints (Authentication, Products, Warehouses, Inventory, Orders, Payments, Health).
* **Neon PostgreSQL**: Authoritative transactional data store with ACID row-level locking for inventory reservations.
* **Transactional Outbox in Cloud**: When orders or payments are processed, domain events are safely recorded in the `outbox_events` PostgreSQL table inside the same atomic database transaction. Because RabbitMQ and the worker are not running in the cloud, these outbox records remain safely queued in PostgreSQL.
* **Fail-Open Redis Cache**: The API initializes `ioredis` with fail-open resilience. Because Redis is omitted in the cloud, the API detects connection unavailability at boot, logs a warning, and transparently routes all product queries directly to PostgreSQL without crashing.

### 1.2 Local Architecture (Full Docker Compose Suite)

When running locally via `docker compose up`, all 4 services run simultaneously:
1. `api`: Express HTTP API server (`node dist/server.js`) on port `4000`.
2. `worker`: Autonomous background worker (`node dist/worker.js`) running Outbox publisher, event consumers, and reservation sweeper.
3. `redis`: Redis 7 Alpine in-memory cache and distributed rate limiter on port `6379`.
4. `rabbitmq`: RabbitMQ 3.13 Management Alpine message broker on port `5672` (management UI on `15672`).

---

## 2. Render Free Web Service Setup

### 2.1 Initial Blueprint Setup

1. **Prerequisites**:
   * A free [Render account](https://render.com).
   * A free [Neon PostgreSQL account](https://neon.tech) with active project credentials:
     * **Pooled URL (`DATABASE_URL`)**: For runtime queries (PgBouncer mode, port 5432).
     * **Direct URL (`DIRECT_URL`)**: For migrations (direct compute mode, port 5432).
2. **Deploy via Render Blueprint**:
   * Go to [Render Dashboard](https://dashboard.render.com) -> **Blueprints** -> **New Blueprint Instance**.
   * Connect your GitHub repository (`SDE_PRO_1`) and select the `main` branch.
   * Render detects `render.yaml` and configures `stockflow-api` under `plan: free`.
3. **Configure Environment Secrets**:
   When prompted during Blueprint setup:
   * `DATABASE_URL`: Paste your Neon pooled connection string:
     `postgresql://<user>:<password>@<ep-pooler-id>.ap-southeast-1.aws.neon.tech/stockflow_db?sslmode=require`
   * `JWT_SECRET`: Leave as auto-generated (Render generates a secure 256-bit secret) or supply your own.
4. **Click Apply**:
   Render builds the multi-stage `Dockerfile` and deploys the free container.

---

## 3. Environment Variables Matrix

| Variable | Scope | Source / Prompt | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Service | Static (`production`) | Enables production optimizations and disables debug traces. |
| `PORT` | Service | Injected by Render | Render dynamically injects `$PORT` (typically 10000). Express automatically binds to `0.0.0.0:$PORT`. |
| `DATABASE_URL` | Service | Prompted (`sync: false`) | Neon pooled PostgreSQL connection string for API runtime queries. |
| `JWT_SECRET` | Service | Auto-generated (`generateValue: true`) | Cryptographically secure secret key for signing and verifying JWT tokens. |
| `CORS_ORIGIN` | Service | Static (`*`) | Permitted CORS origin for browser clients (can be updated to specific frontend domain). |

---

## 4. Database Migrations Execution Strategy

> [!IMPORTANT]
> **Pre-Deploy Commands on Free Tier**:
> Render's `preDeployCommand` is a paid-tier feature and is **not available on Render Free**. Do not declare `preDeployCommand` in `render.yaml` for free services.

### Safe Migration Procedures

Database migrations against Neon PostgreSQL should always be applied before or during code release:

#### Method A: Automated via GitHub Actions (Recommended)
Configure `DIRECT_URL` and `DATABASE_URL` as GitHub Environment secrets under **Settings** -> **Environments** -> `production`.
When `.github/workflows/deploy.yml` is triggered, the runner automatically executes:
```bash
npx prisma migrate deploy
```
If migrations succeed, GitHub Actions proceeds to deploy the Render service. If migrations fail, the deployment is aborted immediately.

#### Method B: Manual CLI Execution from Local Machine
Before triggering a cloud deployment, execute pending migrations directly against your Neon database from your local terminal:
```bash
DIRECT_URL="postgresql://user:pass@ep-direct.region.neon.tech/stockflow_db?sslmode=require" \
DATABASE_URL="postgresql://user:pass@ep-pooler.region.neon.tech/stockflow_db?sslmode=require" \
npx prisma migrate deploy
```

* **Non-Destructive Guarantee**: `prisma migrate deploy` strictly applies pending migration SQL files. It never drops tables, resets data, or alters un-migrated records.
* **Never Run**: Do **not** run `prisma migrate reset` or `prisma db push` against production.

---

## 5. GitHub Actions CI/CD Deployment

The automated workflow [`.github/workflows/deploy.yml`](file:///.github/workflows/deploy.yml) performs controlled manual releases:

### Required GitHub Secrets (Environment: `production`)
* `RENDER_API_KEY`: Render Personal Access Token (from Account Settings -> API Keys).
* `RENDER_API_SERVICE_ID`: Service ID for `stockflow-api` (e.g., `srv-c...` from the service URL in the Render dashboard).
* `DIRECT_URL`: Neon direct unpooled connection string (for automated Prisma migrations).
* `DATABASE_URL`: Neon pooled connection string.

### Deployment Flow
1. **Migration Execution**: Applies pending Prisma migrations to Neon using `DIRECT_URL`.
2. **Deploy Trigger**: Sends `POST https://api.render.com/v1/services/{serviceId}/deploys`.
3. **Status Polling**: Queries `GET https://api.render.com/v1/services/{serviceId}/deploys/{deployId}` every 15s.
4. **Terminal Status**: Exits cleanly when status reaches `live`. Aborts if status is `build_failed`, `update_failed`, or `canceled`.

---

## 6. Testing the Deployed Cloud API

Once deployed, your service is available at `https://stockflow-api.onrender.com` (or your assigned onrender URL):

### 6.1 Health & Uptime Probe
```bash
curl -i https://stockflow-api.onrender.com/health
```
**Expected Response**:
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "service": "stockflow-backend",
    "timestamp": "2026-11-02T11:00:00.000Z",
    "uptimeSeconds": 42
  }
}
```

### 6.2 Authentication Smoke Test
```bash
# 1. Register a test user
curl -i -X POST https://stockflow-api.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@stockflow.dev","password":"Password123!","name":"Cloud Tester"}'

# 2. Login to receive JWT
curl -i -X POST https://stockflow-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@stockflow.dev","password":"Password123!"}'
```

### 6.3 Product Catalog Query
```bash
curl -i https://stockflow-api.onrender.com/api/v1/products
```
Because Redis is omitted on the free tier, the request automatically falls back to PostgreSQL and serves all active products.

---

## 7. Operational Limitations of Render Free Tier

| Dimension | Render Free Behavior | Mitigation / Local Alternative |
| :--- | :--- | :--- |
| **Monthly Cost** | **₹0 ($0.00 / month)** | Complies strictly with zero-cost deployment requirements. |
| **Instance Inactivity Sleep** | Service spins down after **15 minutes** of zero HTTP traffic. | First request after sleep experiences a **~50 second cold start** while container boots. Subsequent requests are instant. |
| **Compute Resources** | 0.1 vCPU, 512 MB RAM | Suitable for REST API demonstration, portfolio reviews, and smoke testing. |
| **Monthly Free Hours** | 750 free instance hours / month per workspace | A single free web service uses ~720–744 hours per month, remaining entirely within the free quota. |
| **Background Processing** | Asynchronous events remain in PostgreSQL `outbox_events` table. | Run `docker compose up` locally to spin up RabbitMQ and the worker to process outbox events and consumer queues. |
| **In-Memory Caching** | Redis is offline; caching operations transparently fall back to PostgreSQL. | Fully functional in local Docker Compose or if a Key Value store is attached later. |
