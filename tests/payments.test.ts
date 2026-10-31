import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Payment Simulation & Stock Settlement API', () => {
  let adminToken: string;
  let customerToken: string;
  let productId: string;
  let warehouseId: string;
  let orderId: string;
  const orderPriceCents = 12000;

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
        code: 'WH-PAY-01',
        name: 'Payment Test Warehouse',
        address: '500 Settlement Way',
        city: 'Charlotte',
        country: 'USA',
      });
    warehouseId = wh.body.data.id;

    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-PAY-ITEM',
        name: 'Smart Watch',
        priceCents: 6000,
      });
    productId = prod.body.data.id;

    // Stock 10 units (on_hand = 10, reserved = 0)
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 10 });

    // Place an order for 2 units (total = 12000 cents)
    const ordRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '100 Bank Street, New York, NY',
        items: [{ productId, warehouseId, quantity: 2 }],
      });
    orderId = ordRes.body.data.id;
  });

  it('should process payment SUCCESS, transition order to CONFIRMED, and permanently commit stock', async () => {
    // Before payment: on_hand = 10, reserved = 2, available = 8
    let inv = await request(app).get(`/api/v1/inventory?productId=${productId}`);
    expect(inv.body.data.totalOnHand).toBe(10);
    expect(inv.body.data.totalReserved).toBe(2);
    expect(inv.body.data.totalAvailable).toBe(8);

    // Process payment success
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        amountCents: orderPriceCents,
        paymentMethod: 'VISA_TEST',
        simulateOutcome: 'SUCCESS',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderStatus).toBe('CONFIRMED');
    expect(res.body.data.payment.status).toBe('SUCCESS');

    // After payment committed: on_hand = 8, reserved = 0, available = 8
    inv = await request(app).get(`/api/v1/inventory?productId=${productId}`);
    expect(inv.body.data.totalOnHand).toBe(8);
    expect(inv.body.data.totalReserved).toBe(0);
    expect(inv.body.data.totalAvailable).toBe(8);

    // Verify order status
    const orderRes = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(orderRes.body.data.status).toBe('CONFIRMED');
    expect(orderRes.body.data.inventoryReservations[0].status).toBe('COMMITTED');
  });

  it('should process payment FAIL, transition order to PAYMENT_FAILED, and release reserved stock', async () => {
    // Process payment failure simulation
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        amountCents: orderPriceCents,
        paymentMethod: 'DECLINED_CARD',
        simulateOutcome: 'FAIL',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.orderStatus).toBe('PAYMENT_FAILED');
    expect(res.body.data.payment.status).toBe('FAILED');

    // Stock after release: on_hand = 10, reserved = 0, available = 10
    const inv = await request(app).get(`/api/v1/inventory?productId=${productId}`);
    expect(inv.body.data.totalOnHand).toBe(10);
    expect(inv.body.data.totalReserved).toBe(0);
    expect(inv.body.data.totalAvailable).toBe(10);

    const orderRes = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(orderRes.body.data.status).toBe('PAYMENT_FAILED');
    expect(orderRes.body.data.inventoryReservations[0].status).toBe('RELEASED');
  });

  it('should reject payment with incorrect amount returning HTTP 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        amountCents: 5000, // Expected 12000
        simulateOutcome: 'SUCCESS',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

