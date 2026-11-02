# StockFlow: Render Deployment Guide & Operational Runbook

This document details the configuration, deployment, security model, and operational management of StockFlow on [Render](https://render.com).

---

## 1. Architecture Overview

StockFlow on Render is deployed as an Infrastructure-as-Code Blueprint (`render.yaml`) located in Singapore (`region: singapore`), connecting to an external serverless PostgreSQL database hosted on Neon.

```
                       [ Incoming HTTPS Traffic ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │        stockflow-api          │
                   │     (Render Web Service)      │
                   │   Health: /health (Port $PORT)│
                   │   PreDeploy: prisma migrate   │
                   └──────┬────────┬────────┬──────┘
                          │        │        │
         ┌────────────────┘        │        └────────────────┐
         │ (Internal TCP)          │ (Internal AMQP)         │ (Direct / Pooled)
         ▼                         ▼                         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ stockflow-redis  │     │stockflow-rabbitmq│     │   Neon Postgres  │
│ (Render KeyVal)  │     │(Render Priv Serv)│     │(External Pooled) │
│  Valkey / Redis  │     │+ Persistent Disk │     │  DATABASE_URL    │
│  redis://:6379   │     │  /var/lib/rabbitmq│    │  DIRECT_URL      │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
         ▲                         ▲                         ▲
         │ (Internal TCP)          │ (Internal AMQP)         │ (Direct / Pooled)
         │                         │                         │
         └────────────────┐        │        ┌────────────────┘
                          │        │        │
                   ┌──────┴────────┴────────┴──────┐
                   │       stockflow-worker        │
                   │  (Render Background Worker)   │
                   │   CMD: node dist/worker.js    │
                   └───────────────────────────────┘
```

### Deployed Services

| Service Name | Render Type | Runtime / Image | Plan | Disk Storage | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`stockflow-api`** | Web Service (`web`) | Docker (`./Dockerfile`) | Starter | Ephemeral | Express REST API, rate limiter, JWT auth, `/health` endpoint. |
| **`stockflow-worker`** | Background Worker (`worker`) | Docker (`./Dockerfile`) | Starter | Ephemeral | Headless outbox publisher, event consumer, and sweeper. |
| **`stockflow-rabbitmq`** | Private Service (`pserv`) | Image (`rabbitmq:3.13-management-alpine`) | Starter | 10 GB Persistent (`/var/lib/rabbitmq`) | AMQP message broker with durable exchanges, queues, and DLQ. |
| **`stockflow-redis`** | Key Value (`keyvalue`) | Managed Valkey / Redis | Starter | 256 MB Persistent | Caching and idempotency layer. |
| **Neon PostgreSQL** | External Database | Managed PostgreSQL (v16) | External | Managed by Neon | Distributed transactional storage with dual-pool architecture. |

---

## 2. Setup Instructions

### Initial Deployment via Render Blueprint

1. **Prerequisites**:
   * A Render account with an active payment method (required for Starter compute, private services, and persistent disks).
   * Active Neon PostgreSQL project with both pooled (`DATABASE_URL`) and direct unpooled (`DIRECT_URL`) connection strings.
2. **Link Repository**:
   * Log into the [Render Dashboard](https://dashboard.render.com).
   * Click **New +** -> **Blueprint**.
   * Connect your GitHub repository (`SDE_PRO_1`).
   * Select the repository branch containing `render.yaml`.
3. **Configure Environment Secrets**:
   Render Blueprints do not support `sync: false` inside shared environment groups. Secrets are defined directly on each service with `sync: false`. During initial Blueprint creation, Render will prompt for the following values:
   * **`stockflow-api`**:
     * `DATABASE_URL`: Neon pooled connection string (PgBouncer, e.g., `postgresql://user:pass@ep-pooler.region.neon.tech/stockflow?sslmode=require`).
     * `DIRECT_URL`: Neon direct connection string (unpooled, e.g., `postgresql://user:pass@ep-direct.region.neon.tech/stockflow?sslmode=require`).
     * `RABBITMQ_URL`: Internal connection string with chosen password:
       `amqp://stockflow:<CHOSEN_PASSWORD>@stockflow-rabbitmq:5672`
   * **`stockflow-worker`**:
     * `DATABASE_URL`: Set to the identical Neon pooled connection string as above.
     * `RABBITMQ_URL`: Set to the identical `amqp://stockflow:<CHOSEN_PASSWORD>@stockflow-rabbitmq:5672` string as above.
   * **`stockflow-rabbitmq`**:
     * `RABBITMQ_DEFAULT_PASS`: Set to the same `<CHOSEN_PASSWORD>` embedded in `RABBITMQ_URL`.
4. **Deploy**:
   * Click **Apply**.
   * Render will automatically provision the Key Value store, RabbitMQ with its persistent disk, run database migrations via the API's `preDeployCommand`, and boot the API and worker.

---

## 3. Environment Variables Matrix

| Variable | Target Service(s) | Source in `render.yaml` | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `stockflow-api`, `stockflow-worker` | Static (`production`) | Configures runtime production optimizations. |
| `PORT` | `stockflow-api` | Injected by Render | Render automatically injects `$PORT` (typically 10000). Express binds to `0.0.0.0:$PORT`. |
| `DATABASE_URL` | `stockflow-api`, `stockflow-worker` | Service env (`sync: false`) | Pooled database connection string for application runtime queries. |
| `DIRECT_URL` | `stockflow-api` | Service env (`sync: false`) | Direct non-pooled database connection string used by `preDeployCommand: npx prisma migrate deploy`. |
| `JWT_SECRET` | `stockflow-api` | Auto-generated (`generateValue: true`) | Cryptographically secure 256-bit secret used for signing and verifying user JWT tokens. |
| `REDIS_URL` | `stockflow-api`, `stockflow-worker` | `fromService` (`stockflow-redis`) | Internal low-latency Redis URI (`redis://red-xxxx:6379`). |
| `RABBITMQ_URL` | `stockflow-api`, `stockflow-worker` | Service env (`sync: false`) | Internal AMQP connection URI (`amqp://stockflow:***@stockflow-rabbitmq:5672`). |
| `RABBITMQ_DEFAULT_USER` | `stockflow-rabbitmq` | Static (`stockflow`) | Default administrative user created when the persistent volume is initialized. |
| `RABBITMQ_DEFAULT_PASS` | `stockflow-rabbitmq` | Service env (`sync: false`) | Password for the default user, matching the password in `RABBITMQ_URL`. |
| `OUTBOX_POLL_INTERVAL_MS`| `stockflow-worker` | Static (`1000`) | Polling frequency for the transactional outbox worker. |
| `RESERVATION_EXPIRY_SWEEPER_INTERVAL_MS` | `stockflow-worker` | Static (`30000`) | Frequency of the expired inventory reservation sweeper. |

---

## 4. RabbitMQ Stability & Credential Management

### Persistent Volume Lifecycle
* The persistent disk `rabbitmq-data` is mounted to `/var/lib/rabbitmq`.
* RabbitMQ creates the default user (`RABBITMQ_DEFAULT_USER`) and its password (`RABBITMQ_DEFAULT_PASS`) **only once**, during the initial boot when `/var/lib/rabbitmq` is empty.
* On subsequent container redeployments or restarts, RabbitMQ loads the existing Mnesia database from the persistent disk and skips user initialization.

### Preventing Authentication Failures
* `sync: false` ensures the password remains static across all future code deployments.
* **Password Rotation Procedure**:
  If the RabbitMQ password must be changed:
  1. Open the Render Shell for `stockflow-rabbitmq`.
  2. Execute:
     ```bash
     rabbitmqctl change_password stockflow <new_password>
     ```
  3. Update `RABBITMQ_DEFAULT_PASS` in the Render Dashboard for `stockflow-rabbitmq`.
  4. Update `RABBITMQ_URL` on both `stockflow-api` and `stockflow-worker` to reflect the new password.
  5. Trigger redeployment of `stockflow-api` and `stockflow-worker`.

### Credential Normalization & Log Safety
* StockFlow's `RabbitMQClient` automatically parses `RABBITMQ_URL` with `normalizeUrl()`. Any special characters in passwords (`@`, `:`, `#`, `%`, `!`, `&`, `/`) are safely percent-encoded without double-encoding existing escapes.
* Before logging connection attempts, `maskUrl()` redacts credentials (e.g., `amqp://stockflow:***@stockflow-rabbitmq:5672`). Raw credentials are never printed to Render logs.

---

## 5. Deployment Order & Pre-Deploy Database Migrations

### Execution Flow
1. **Infrastructure Provisioning**:
   Render ensures `stockflow-redis` and `stockflow-rabbitmq` are active.
2. **Pre-Deploy Migrations**:
   * Before launching the new API container, Render runs `preDeployCommand: npx prisma migrate deploy` in a temporary container built from the new Docker image.
   * Prisma connects to Neon using `DIRECT_URL` to acquire transactional migration locks.
   * **Failure Safety**: If a migration fails or encounters lock timeouts, the pre-deploy command exits non-zero. Render immediately aborts the deployment without routing traffic to the new image. The previous version remains fully active and healthy.
3. **Container Rollout**:
   * `stockflow-api` boots and must pass the `/health` HTTP probe (`200 OK`).
   * `stockflow-worker` boots and connects to PostgreSQL, Redis, and RabbitMQ topology.

---

## 6. GitHub Actions CI/CD via Render REST API

The deployment workflow [`.github/workflows/deploy.yml`](file:///.github/workflows/deploy.yml) utilizes Render's REST API to enforce strict sequential releases with terminal status polling.

### GitHub Production Environment Secrets
Under GitHub Repository **Settings** -> **Environments** -> `production`, configure:
1. `RENDER_API_KEY`: Render Personal Access Token (Account Settings -> API Keys).
2. `RENDER_API_SERVICE_ID`: Service ID for `stockflow-api` (e.g., `srv-c...` from the service URL).
3. `RENDER_WORKER_SERVICE_ID`: Service ID for `stockflow-worker` (e.g., `srv-c...` from the service URL).

### API-First Deployment Sequence & Polling Behavior
1. **Trigger API Deployment**:
   ```text
   POST https://api.render.com/v1/services/{RENDER_API_SERVICE_ID}/deploys
   ```
   Captures the unique deployment ID (`id`).
2. **Poll API Deployment Status**:
   Every 15 seconds, queries:
   ```text
   GET https://api.render.com/v1/services/{RENDER_API_SERVICE_ID}/deploys/{deployId}
   ```
   * **Success (`status == "live"`)**: Confirms the container built, `preDeployCommand` (Prisma migrations) succeeded, and the HTTP `/health` check passed. Proceed to Step 3.
   * **Terminal Failure (`build_failed`, `pre_deploy_failed`, `update_failed`, `canceled`)**: Halts execution immediately (`exit 1`). The worker is **never** deployed, protecting production from running against mismatched schemas.
   * **Rate Limit Handling**: HTTP 429 responses back off for 15s without failing the workflow.
   * **Timeout**: Aborts if `live` status is not reached within 10 minutes (40 attempts).
3. **Trigger Worker Deployment**:
   Only after the API reaches `live`, triggers:
   ```text
   POST https://api.render.com/v1/services/{RENDER_WORKER_SERVICE_ID}/deploys
   ```
4. **Poll Worker Status**:
   Monitors the worker deployment until it reaches `live`.

---

## 7. Security & Private Networking

1. **Zero Public Exposure for Data Stores**:
   * `stockflow-rabbitmq` is a Private Service (`pserv`). It has no public URL and can only be reached by other services within the same Render Singapore private network.
   * `stockflow-redis` has `ipAllowList: []`, preventing any inbound traffic from outside Render.
2. **Internal Redis Communication (No TLS Overhead)**:
   * Services in the same region communicate with Key Value over Render's private network using `redis://` (unencrypted internal TCP), eliminating TLS handshake latency and certificate verification issues.
3. **Reverse Proxy Trust**:
   * Express is configured with `app.set('trust proxy', 1)`, allowing accurate client IP resolution for rate limiting behind Render's load balancers.

---

## 8. Cost Breakdown (Singapore Region)

| Component | Type / Plan | Monthly Cost | Notes |
| :--- | :--- | :--- | :--- |
| `stockflow-api` | Web Service (Starter) | **$7.00** | Required for zero cold starts and 24/7 uptime. |
| `stockflow-worker` | Background Worker (Starter) | **$7.00** | Background Workers have no free tier on Render. |
| `stockflow-rabbitmq` | Private Service (Starter) | **$7.00** | Private Services have no free tier on Render. |
| `rabbitmq-data` | Persistent Disk (10 GB) | **$2.50** | $0.25 per GB / month ($2.50 for 10 GB). |
| `stockflow-redis` | Key Value (Starter) | **$10.00** | 256 MB RAM with persistent storage. |
| **Total Render Monthly Cost** | | **$33.50 / month** | Full production-ready setup with disk persistence. |

---

## 9. Rollback Safety & Guidance

> [!CAUTION]
> **Rollback Does NOT Reverse Database Migrations**:
> Reverting a deployment in the Render Dashboard rolls back application container images, but **it does not roll back database schema changes**.

### Backward-Compatible Migration Rules
To ensure rollbacks are safe:
1. **Never make breaking schema changes in a single release**:
   * When adding columns, provide default values or mark them nullable.
   * When renaming columns, add the new column first, deploy code that writes to both, backfill data, and only drop the old column in a subsequent release.
2. **Performing an Application Rollback**:
   * If a newly deployed version exhibits application errors, navigate to the Render Dashboard -> `stockflow-api` -> **Deploys** -> Select the previous successful deploy -> Click **Rollback to this deploy**.
   * Repeat for `stockflow-worker`.
   * Because existing migrations were written backward-compatibly, the previous code version will continue running without schema conflicts.
