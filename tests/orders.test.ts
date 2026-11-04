import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Order Management & Reservation API', () => {
  let adminToken: string;
  let customerToken: string;
  let otherCustomerToken: string;
  let productIdA: string;
  let productIdB: string;
  let warehouseId: string;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);
    const otherCustomer = await createTestUser(UserRole.CUSTOMER);

    adminToken = admin.token;
    customerToken = customer.token;
    otherCustomerToken = otherCustomer.token;

    // Create Warehouse
    const whRes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-ORD-01',
        name: 'Order Test Warehouse',
        address: '100 Distribution Lane',
        city: 'Seattle',
        country: 'USA',
      });
    warehouseId = whRes.body.data.id;

    // Create Product A
    const prodARes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-ITEM-A',
        name: 'Item A Premium',
        priceCents: 5000,
      });
    productIdA = prodARes.body.data.id;

    // Create Product B
    const prodBRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-ITEM-B',
        name: 'Item B Standard',
        priceCents: 2500,
      });
    productIdB = prodBRes.body.data.id;

    // Restock Warehouse: 10 units of A, 5 units of B
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productIdA, warehouseId, quantity: 10 });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productIdB, warehouseId, quantity: 5 });
  });

  describe('POST /api/v1/orders', () => {
    it('should create an order and hold stock with HTTP 201', async () => {
      const payload = {
        shippingAddress: '123 Market St, San Francisco, CA',
        items: [
          { productId: productIdA, warehouseId, quantity: 2 },
          { productId: productIdB, warehouseId, quantity: 1 },
        ],
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('RESERVED');
      expect(res.body.data.totalAmountCents).toBe(2 * 5000 + 1 * 2500);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.reservations.length).toBe(2);
      expect(res.body.data.reservations[0].status).toBe('ACTIVE');

      // Verify inventory quantity_reserved incremented
      const invRes = await request(app)
        .get(`/api/v1/inventory?productId=${productIdA}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(invRes.body.data.totalReserved).toBe(2);
      expect(invRes.body.data.totalAvailable).toBe(8);
    });

    it('should automatically select warehouse when warehouseId is omitted (deterministic allocation)', async () => {
      const payload = {
        shippingAddress: '456 Auto St, Seattle, WA',
        items: [{ productId: productIdA, quantity: 3 }],
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.items[0].warehouseId).toBe(warehouseId);
      expect(res.body.data.items[0].quantity).toBe(3);
    });

    it('should reject order when product does not exist with HTTP 404', async () => {
      const payload = {
        shippingAddress: '789 Ghost Way, Denver, CO',
        items: [{ productId: 'c0000000-0000-0000-0000-000000000000', quantity: 1 }],
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject order with non-positive quantity with HTTP 400', async () => {
      const payload = {
        shippingAddress: '101 Bad Qty Ave',
        items: [{ productId: productIdA, quantity: 0 }],
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject order when requested quantity exceeds available stock with HTTP 409 Conflict', async () => {
      const payload = {
        shippingAddress: '202 Exceed St, Chicago, IL',
        items: [{ productId: productIdA, warehouseId, quantity: 100 }], // Only 10 available
        allowPartial: false,
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject order without authentication token with HTTP 401', async () => {
      const payload = {
        shippingAddress: '303 Secret Rd',
        items: [{ productId: productIdA, quantity: 1 }],
      };

      const res = await request(app).post('/api/v1/orders').send(payload);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/orders and /my-orders', () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '404 Listing Blvd',
          items: [{ productId: productIdA, warehouseId, quantity: 1 }],
        });
      orderId = res.body.data.id;
    });

    it('should retrieve order by ID when requested by owner with HTTP 200', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.orderItems.length).toBe(1);
    });

    it('should allow admin to retrieve any customer order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
    });

    it('should forbid other customer from viewing another customer order with HTTP 403', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return list of orders for customer via /my-orders', async () => {
      const res = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(orderId);
    });
  });

  describe('POST /api/v1/orders/:id/cancel', () => {
    let orderId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '505 Cancel Lane',
          items: [{ productId: productIdA, warehouseId, quantity: 4 }],
        });
      orderId = res.body.data.id;
    });

    it('should cancel reserved order and release held stock with HTTP 200', async () => {
      // Stock should have 4 reserved
      let inv = await request(app)
        .get(`/api/v1/inventory?productId=${productIdA}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(inv.body.data.totalReserved).toBe(4);
      expect(inv.body.data.totalAvailable).toBe(6);

      // Cancel order
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Found a better price' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.compensation.stockReleased).toBe(true);

      // Stock reservation should be decremented back to 0
      inv = await request(app)
        .get(`/api/v1/inventory?productId=${productIdA}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(inv.body.data.totalReserved).toBe(0);
      expect(inv.body.data.totalAvailable).toBe(10);
    });

    it('should be idempotent: repeated cancellation does not error or double-release stock', async () => {
      await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      // Second cancellation
      const secondRes = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.status).toBe('CANCELLED');
      expect(secondRes.body.data.compensation.stockReleased).toBe(false);

      const inv = await request(app)
        .get(`/api/v1/inventory?productId=${productIdA}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(inv.body.data.totalReserved).toBe(0);
      expect(inv.body.data.totalAvailable).toBe(10);
    });
  });
});

