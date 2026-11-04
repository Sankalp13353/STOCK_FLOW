import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Idempotency Control API', () => {
  let adminToken: string;
  let customerToken: string;
  let productId: string;
  let warehouseId: string;

  beforeEach(async () => {
    await clearDatabase();
    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);
    adminToken = admin.token;
    customerToken = customer.token;

    // Create warehouse & product
    const wh = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-IDEM-01',
        name: 'Idempotency Hub',
        address: '100 Deduplication Way',
        city: 'Boston',
        country: 'USA',
      });
    warehouseId = wh.body.data.id;

    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-IDEM-01',
        name: 'Idempotency Gadget',
        priceCents: 4500,
      });
    productId = prod.body.data.id;

    // Stock 10 units
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 10 });
  });

  it('should return identical cached response with Idempotent-Replay header for duplicate requests', async () => {
    const idempotencyKey = 'c9b4e18d-4cb2-4a0b-93e1-314f7b2c5890';
    const payload = {
      shippingAddress: '42 Wallaby Way, Sydney',
      items: [{ productId, warehouseId, quantity: 2 }],
    };

    // First request
    const firstRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(firstRes.status).toBe(201);
    const firstOrderId = firstRes.body.data.id;
    expect(firstOrderId).toBeDefined();

    // Second request with exact same key and payload
    const secondRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(secondRes.status).toBe(200);
    expect(secondRes.headers['idempotent-replay']).toBe('true');
    expect(secondRes.body.data.id).toBe(firstOrderId);

    // Verify stock was held only ONCE (2 units, not 4 units)
    const invRes = await request(app)
      .get(`/api/v1/inventory?productId=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(invRes.body.data.totalReserved).toBe(2);
    expect(invRes.body.data.totalAvailable).toBe(8);
  });

  it('should reject same idempotency key with different payload returning HTTP 409 Conflict', async () => {
    const idempotencyKey = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';

    const originalPayload = {
      shippingAddress: 'Original Destination 100',
      items: [{ productId, warehouseId, quantity: 1 }],
    };

    const conflictingPayload = {
      shippingAddress: 'Altered Destination 200', // Different payload!
      items: [{ productId, warehouseId, quantity: 2 }],
    };

    // First request
    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(originalPayload);

    // Conflicting request
    const conflictRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(conflictingPayload);

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.success).toBe(false);
    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('should handle simultaneous requests with the same idempotency key without duplicate creation', async () => {
    const idempotencyKey = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const payload = {
      shippingAddress: '77 Concurrent Blvd',
      items: [{ productId, warehouseId, quantity: 1 }],
    };

    // Fire 5 identical requests at the exact same instant
    const promises = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
    );

    const responses = await Promise.all(promises);

    // Verify all succeeded (either 201 Created or 200 Idempotent Replay)
    const successStatuses = responses.filter((r) => r.status === 201 || r.status === 200);
    expect(successStatuses.length).toBe(5);

    // Verify all return the exact same Order ID
    const orderIds = new Set(responses.map((r) => r.body.data.id));
    expect(orderIds.size).toBe(1);

    // Verify only 1 unit of stock reserved
    const invRes = await request(app)
      .get(`/api/v1/inventory?productId=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(invRes.body.data.totalReserved).toBe(1);
    expect(invRes.body.data.totalAvailable).toBe(9);
  });
});

