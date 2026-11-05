import request from 'supertest';
import { MovementType, OrderStatus, UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
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

  describe('DELETE /api/v1/products/:id', () => {
    let unreferencedProductId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'SKU-DELETE-ME',
          name: 'Temporary Product',
          priceCents: 5000,
        });
      unreferencedProductId = res.body.data.id;
    });

    it('should delete unreferenced product successfully when called by Admin', async () => {
      const res = await request(app)
        .delete(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(unreferencedProductId);

      // Verify it is gone
      const verifyRes = await request(app)
        .get(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(verifyRes.status).toBe(404);
    });

    it('should prevent non-admin from deleting products with HTTP 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject deleting non-existent product with HTTP 404 Not Found', async () => {
      const nonExistentUuid = 'a0000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/api/v1/products/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject deleting product with active warehouse inventory stock with HTTP 409 Conflict', async () => {
      const warehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-TEST-DEL-1',
          name: 'Test Warehouse 1',
          address: '123 Warehouse Lane',
          city: 'London',
          country: 'UK',
          isActive: true,
        },
      });

      await prisma.inventory.create({
        data: {
          productId: unreferencedProductId,
          warehouseId: warehouse.id,
          quantityOnHand: 50,
          quantityReserved: 0,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('active inventory stock');
    });

    it('should reject deleting product with historical inventory ledger movements with HTTP 409 Conflict', async () => {
      const warehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-TEST-DEL-2',
          name: 'Test Warehouse 2',
          address: '456 Warehouse Lane',
          city: 'London',
          country: 'UK',
          isActive: true,
        },
      });

      await prisma.inventoryMovement.create({
        data: {
          productId: unreferencedProductId,
          warehouseId: warehouse.id,
          movementType: MovementType.RESTOCK,
          quantityDelta: 10,
          notes: 'Test Restock',
        },
      });

      const res = await request(app)
        .delete(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('recorded inventory ledger movements');
    });

    it('should reject deleting product referenced in customer order with HTTP 409 Conflict', async () => {
      const warehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-TEST-DEL-ORD',
          name: 'Order Warehouse',
          address: '789 Warehouse Way',
          city: 'London',
          country: 'UK',
          isActive: true,
        },
      });

      const customer = await prisma.user.findFirst({ where: { role: UserRole.CUSTOMER } });
      const order = await prisma.order.create({
        data: {
          orderNumber: 'ORD-TEST-DEL-1',
          userId: customer!.id,
          status: OrderStatus.CONFIRMED,
          totalAmountCents: 5000,
          shippingAddress: '123 Street',
          idempotencyKey: 'IDEMP-TEST-DEL-1',
        },
      });

      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: unreferencedProductId,
          warehouseId: warehouse.id,
          quantity: 1,
          unitPriceCents: 5000,
          subtotalCents: 5000,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('customer order(s)');
    });

    it('should safely delete a product that has zero-stock inventory records and no movements or orders', async () => {
      const warehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-TEST-DEL-3',
          name: 'Test Warehouse 3',
          address: '789 Warehouse Lane',
          city: 'London',
          country: 'UK',
          isActive: true,
        },
      });

      await prisma.inventory.create({
        data: {
          productId: unreferencedProductId,
          warehouseId: warehouse.id,
          quantityOnHand: 0,
          quantityReserved: 0,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/products/${unreferencedProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(unreferencedProductId);

      // Verify product and inventory rows are gone
      const invCheck = await prisma.inventory.findFirst({
        where: { productId: unreferencedProductId },
      });
      expect(invCheck).toBeNull();
    });
  });
});

