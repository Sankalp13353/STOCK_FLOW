import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Product Management API', () => {
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    await clearDatabase();
    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);
    adminToken = admin.token;
    customerToken = customer.token;
  });

  describe('POST /api/v1/products', () => {
    it('should create product successfully when called by Admin', async () => {
      const payload = {
        sku: 'SKU-LAPTOP-01',
        name: 'Enterprise Laptop 16',
        description: '32GB RAM, 1TB SSD',
        priceCents: 199999,
        isActive: true,
      };

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sku).toBe('SKU-LAPTOP-01');
      expect(res.body.data.priceCents).toBe(199999);
      expect(res.body.data.id).toBeDefined();
    });

    it('should prevent duplicate SKU creation with HTTP 409 Conflict', async () => {
      const payload = {
        sku: 'SKU-DUP-01',
        name: 'Original Product',
        priceCents: 5000,
      };

      await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject invalid product data with HTTP 400 (negative price)', async () => {
      const invalidPayload = {
        sku: 'SKU-NEG',
        name: 'Invalid Price Product',
        priceCents: -500,
      };

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should forbid non-admin user from creating products with HTTP 403', async () => {
      const payload = {
        sku: 'SKU-FORBIDDEN',
        name: 'Forbidden Item',
        priceCents: 1000,
      };

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/products and GET /api/v1/products/:id', () => {
    let createdProductId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'SKU-SEARCHABLE',
          name: 'Wireless Keyboard',
          description: 'Mechanical switches',
          priceCents: 8900,
        });
      createdProductId = res.body.data.id;
    });

    it('should retrieve list of products with pagination', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('should retrieve existing product by ID with HTTP 200', async () => {
      const res = await request(app).get(`/api/v1/products/${createdProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdProductId);
      expect(res.body.data.sku).toBe('SKU-SEARCHABLE');
    });

    it('should return HTTP 404 when product ID is not found', async () => {
      const nonExistentUuid = 'a0000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/v1/products/${nonExistentUuid}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return HTTP 400 when product ID format is invalid', async () => {
      const res = await request(app).get('/api/v1/products/invalid-uuid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT & PATCH /api/v1/products/:id', () => {
    let productId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'SKU-ORIGINAL',
          name: 'Original Name',
          priceCents: 1000,
        });
      productId = res.body.data.id;
    });

    it('should update product details successfully via PUT', async () => {
      const res = await request(app)
        .put(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Name',
          priceCents: 1200,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.priceCents).toBe(1200);
    });

    it('should update product details successfully via PATCH', async () => {
      const res = await request(app)
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);
    });
  });
});

