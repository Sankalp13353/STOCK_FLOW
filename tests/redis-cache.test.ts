import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { redis } from '../src/infra/redis/redis.client';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { UserRole } from '@prisma/client';

describe('Redis Caching & Invalidation Layer', () => {
  let adminToken: string;
  let productId: string;

  beforeAll(async () => {
    await redis.connect();
  });

  beforeEach(async () => {
    await clearDatabase();
    // Flush test redis DB so tests start clean
    if (redis.isConnected()) {
      await redis.getClient()?.flushall();
    }

    const admin = await createTestUser(UserRole.ADMIN);
    adminToken = admin.token;

    // Create an initial product
    const product = await prisma.product.create({
      data: {
        sku: 'CACHE-SKU-001',
        name: 'Caching Test Product',
        description: 'Original description for caching test',
        priceCents: 4999,
        isActive: true,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (redis.isConnected()) {
      await redis.getClient()?.flushall();
    }
  });

  describe('Product Detail Caching (GET /api/v1/products/:id)', () => {
    it('should return X-Cache: MISS on first request, and X-Cache: HIT on subsequent request', async () => {
      // 1. First request - Cache Miss
      const res1 = await request(app).get(`/api/v1/products/${productId}`);
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');
      expect(res1.body.data.name).toBe('Caching Test Product');

      // Verify key exists in Redis
      const cached = await redis.get<any>(`cache:products:detail:${productId}`);
      expect(cached).not.toBeNull();
      expect(cached.name).toBe('Caching Test Product');

      // 2. Second request - Cache Hit
      const res2 = await request(app).get(`/api/v1/products/${productId}`);
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body.data.id).toBe(productId);
      expect(res2.body.data.name).toBe('Caching Test Product');
    });
  });

  describe('Product Listing Caching (GET /api/v1/products)', () => {
    it('should return X-Cache: MISS on first query, and X-Cache: HIT on subsequent identical query', async () => {
      // 1. First query - Cache Miss
      const res1 = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');
      expect(res1.body.data.length).toBe(1);

      // 2. Second query - Cache Hit
      const res2 = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body.data.length).toBe(1);
    });
  });

  describe('Cache Invalidation on Mutation', () => {
    it('should invalidate product detail and listing caches after product update', async () => {
      // Warm the cache
      await request(app).get(`/api/v1/products/${productId}`);
      await request(app).get('/api/v1/products?page=1&limit=10');

      // Verify caches are HIT
      const check1 = await request(app).get(`/api/v1/products/${productId}`);
      const check2 = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(check1.headers['x-cache']).toBe('HIT');
      expect(check2.headers['x-cache']).toBe('HIT');

      // Update product via admin endpoint
      const updateRes = await request(app)
        .put(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Cached Product Name',
          priceCents: 5999,
        });
      expect(updateRes.status).toBe(200);

      // Subsequent requests MUST be MISS and reflect updated database data (No Stale Reads)
      const afterDetail = await request(app).get(`/api/v1/products/${productId}`);
      expect(afterDetail.status).toBe(200);
      expect(afterDetail.headers['x-cache']).toBe('MISS');
      expect(afterDetail.body.data.name).toBe('Updated Cached Product Name');
      expect(afterDetail.body.data.priceCents).toBe(5999);

      const afterList = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(afterList.status).toBe(200);
      expect(afterList.headers['x-cache']).toBe('MISS');
      expect(afterList.body.data[0].name).toBe('Updated Cached Product Name');
    });

    it('should invalidate product listing cache after product creation', async () => {
      // Warm listing cache
      const initial = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(initial.headers['x-cache']).toBe('MISS');
      expect(initial.body.data.length).toBe(1);

      const hit = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(hit.headers['x-cache']).toBe('HIT');

      // Create new product
      const createRes = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'CACHE-SKU-002',
          name: 'Brand New Product',
          priceCents: 1500,
        });
      expect(createRes.status).toBe(201);

      // Listing cache should be invalidated (MISS) and include 2 products
      const refreshed = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(refreshed.status).toBe(200);
      expect(refreshed.headers['x-cache']).toBe('MISS');
      expect(refreshed.body.data.length).toBe(2);
    });

    it('should invalidate cache and return 404 on subsequent requests after product deletion', async () => {
      // Warm detail cache
      await request(app).get(`/api/v1/products/${productId}`);
      const hit = await request(app).get(`/api/v1/products/${productId}`);
      expect(hit.headers['x-cache']).toBe('HIT');

      // Delete product
      const delRes = await request(app)
        .delete(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);

      // Detail cache must be purged; subsequent GET returns 404
      const afterDelete = await request(app).get(`/api/v1/products/${productId}`);
      expect(afterDelete.status).toBe(404);
    });
  });

  describe('Redis Unavailable Resilience (Fail-Open)', () => {
    it('should transparently fall back to PostgreSQL without crashing API if Redis is disconnected', async () => {
      // Temporarily disconnect Redis to simulate an outage
      await redis.disconnect();
      expect(redis.isConnected()).toBe(false);

      // Request must still succeed via PostgreSQL (fail-open)
      const res = await request(app).get(`/api/v1/products/${productId}`);
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body.data.id).toBe(productId);

      // Listing must also succeed
      const listRes = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(listRes.status).toBe(200);
      expect(listRes.headers['x-cache']).toBe('MISS');
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Reconnect Redis for subsequent tests
      await redis.connect();
      expect(redis.isConnected()).toBe(true);
    });
  });
});
