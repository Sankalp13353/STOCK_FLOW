import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Inventory Management API', () => {
  let adminToken: string;
  let staffToken: string;
  let customerToken: string;
  let testProductId: string;
  let testWarehouseId: string;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
    const customer = await createTestUser(UserRole.CUSTOMER);

    adminToken = admin.token;
    staffToken = staff.token;
    customerToken = customer.token;

    // Create a product
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-PHONE-15',
        name: 'Smartphone 15 Pro',
        priceCents: 99900,
      });
    testProductId = prodRes.body.data.id;

    // Create a warehouse
    const whRes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-MAIN-01',
        name: 'Main Distribution Hub',
        address: '100 Gateway Blvd',
        city: 'Atlanta',
        country: 'USA',
      });
    testWarehouseId = whRes.body.data.id;

    // Assign warehouse staff to testWarehouseId
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: staff.user.id,
        warehouseId: testWarehouseId,
        role: UserRole.WAREHOUSE_STAFF,
      },
    });
  });

  describe('POST /api/v1/inventory/restock (and /stock)', () => {
    it('should add stock successfully when called by Warehouse Staff', async () => {
      const payload = {
        productId: testProductId,
        warehouseId: testWarehouseId,
        quantity: 50,
        notes: 'Initial stocking',
      };

      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quantityOnHand).toBe(50);
      expect(res.body.data.quantityReserved).toBe(0);
      expect(res.body.data.quantityAvailable).toBe(50);
      expect(res.body.data.movementId).toBeDefined();
    });

    it('should support /stock alias endpoint identically', async () => {
      const payload = {
        productId: testProductId,
        warehouseId: testWarehouseId,
        quantity: 25,
      };

      const res = await request(app)
        .post('/api/v1/inventory/stock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quantityOnHand).toBe(25);
    });

    it('should accumulate quantity on multiple restocks without duplicating inventory records', async () => {
      // First restock: 50
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: testProductId,
          warehouseId: testWarehouseId,
          quantity: 50,
        });

      // Second restock: 30
      const secondRes = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: testProductId,
          warehouseId: testWarehouseId,
          quantity: 30,
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.quantityOnHand).toBe(80);
      expect(secondRes.body.data.quantityAvailable).toBe(80);

      // Verify only 1 inventory record exists
      const listRes = await request(app).get(`/api/v1/inventory/warehouse/${testWarehouseId}`);
      expect(listRes.body.data.length).toBe(1);
    });

    it('should return HTTP 404 when product does not exist', async () => {
      const nonExistentProductId = 'c0000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: nonExistentProductId,
          warehouseId: testWarehouseId,
          quantity: 10,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return HTTP 404 when warehouse does not exist', async () => {
      const nonExistentWarehouseId = 'd0000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: testProductId,
          warehouseId: nonExistentWarehouseId,
          quantity: 10,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject non-positive or invalid quantity with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: testProductId,
          warehouseId: testWarehouseId,
          quantity: -10,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should forbid customer role from adding stock with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: testProductId,
          warehouseId: testWarehouseId,
          quantity: 10,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/inventory queries', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          warehouseId: testWarehouseId,
          quantity: 100,
        });
    });

    it('should retrieve inventory list with product and warehouse info', async () => {
      const res = await request(app).get('/api/v1/inventory');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].quantityOnHand).toBe(100);
      expect(res.body.data[0].product.sku).toBe('SKU-PHONE-15');
      expect(res.body.data[0].warehouse.code).toBe('WH-MAIN-01');
    });

    it('should retrieve product breakdown overview across warehouses', async () => {
      const res = await request(app).get(`/api/v1/inventory?productId=${testProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.productId).toBe(testProductId);
      expect(res.body.data.totalOnHand).toBe(100);
      expect(res.body.data.totalAvailable).toBe(100);
      expect(res.body.data.breakdown.length).toBe(1);
    });

    it('should retrieve inventory for a specific warehouse', async () => {
      const res = await request(app).get(`/api/v1/inventory/warehouse/${testWarehouseId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].quantityOnHand).toBe(100);
    });

    it('should retrieve inventory for a specific warehouse via /:warehouseId alias', async () => {
      const res = await request(app).get(`/api/v1/inventory/${testWarehouseId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].quantityOnHand).toBe(100);
    });
  });
});

