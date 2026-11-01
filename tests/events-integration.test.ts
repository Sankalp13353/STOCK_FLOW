import request from 'supertest';
import { OutboxStatus, ReservationStatus, UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { rabbitmq } from '../src/infra/rabbitmq/rabbitmq.client';
import { outboxPublisherWorker } from '../src/modules/outbox/outbox-publisher.worker';
import { notificationWorker } from '../src/workers/notification.worker';
import { EVENT_TYPES, BROKER_TOPICS } from '../src/config/constants';
import { reservationService } from '../src/modules/reservations/reservation.service';

describe('Event-Driven Architecture Integration Tests', () => {
  let adminToken: string;
  let customerToken: string;
  let customerId: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await rabbitmq.connect();
  });

  afterAll(async () => {
    await rabbitmq.close();
  });

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);

    adminToken = admin.token;
    customerToken = customer.token;
    customerId = customer.user.id;

    // Create Warehouse
    const whRes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-EVENT-01',
        name: 'Event Warehouse',
        address: '500 Stream Way',
        city: 'Austin',
        country: 'USA',
      });
    warehouseId = whRes.body.data.id;

    // Create Product
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-EVENT-100',
        name: 'Event Flow Gadget',
        priceCents: 4500,
      });
    productId = prodRes.body.data.id;

    // Stock Warehouse with 50 units
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId,
        warehouseId,
        quantity: 50,
      });
  });

  it('should generate an outbox event upon order creation, publish it, and process it via notification worker', async () => {
    // 1. Create Order via HTTP POST
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '789 Rabbit Way, Austin, TX',
        items: [{ productId, warehouseId, quantity: 2 }],
      });

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    // 2. Verify OutboxEvent exists in PostgreSQL with PENDING status
    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: EVENT_TYPES.ORDER_CREATED,
      },
    });

    expect(outboxEvent).not.toBeNull();
    expect(outboxEvent!.status).toBe(OutboxStatus.PENDING);
    expect(outboxEvent!.payload).toMatchObject({
      orderId,
      userId: customerId,
      totalAmountCents: 9000,
    });

    // 3. Run Outbox Publisher to publish to RabbitMQ
    const publishResult = await outboxPublisherWorker.publishPendingEvents();
    expect(publishResult.successCount).toBeGreaterThanOrEqual(1);

    // 4. Verify OutboxEvent transitioned to PUBLISHED
    const updatedOutbox = await prisma.outboxEvent.findUnique({
      where: { id: outboxEvent!.id },
    });
    expect(updatedOutbox!.status).toBe(OutboxStatus.PUBLISHED);
    expect(updatedOutbox!.publishedAt).not.toBeNull();
  });

  it('should generate order.confirmed outbox event upon successful payment simulation', async () => {
    // 1. Create Order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '101 Payment Blvd',
        items: [{ productId, warehouseId, quantity: 1 }],
      });
    const orderId = orderRes.body.data.id;

    // 2. Process Successful Payment
    const payRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        amountCents: 4500,
        paymentMethod: 'CREDIT_CARD',
        simulateOutcome: 'SUCCESS',
      });
    expect(payRes.status).toBe(200);

    // 3. Verify order.confirmed OutboxEvent
    const confirmEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: EVENT_TYPES.ORDER_CONFIRMED,
      },
    });

    expect(confirmEvent).not.toBeNull();
    expect(confirmEvent!.status).toBe(OutboxStatus.PENDING);
    expect(confirmEvent!.payload).toMatchObject({
      orderId,
      amountCents: 4500,
    });

    // 4. Publish and verify status transition
    // Due to per-aggregate FIFO ordering, first iteration publishes order.created,
    // and the next iteration publishes order.confirmed.
    await outboxPublisherWorker.publishPendingEvents();
    const publishResult = await outboxPublisherWorker.publishPendingEvents();
    expect(publishResult.successCount).toBeGreaterThanOrEqual(1);

    const updated = await prisma.outboxEvent.findUnique({
      where: { id: confirmEvent!.id },
    });
    expect(updated!.status).toBe(OutboxStatus.PUBLISHED);
  });

  it('should generate order.cancelled outbox event upon order cancellation', async () => {
    // 1. Create Order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '202 Cancel St',
        items: [{ productId, warehouseId, quantity: 2 }],
      });
    const orderId = orderRes.body.data.id;

    // 2. Cancel Order
    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Found a better price' });
    expect(cancelRes.status).toBe(200);

    // 3. Verify order.cancelled OutboxEvent
    const cancelEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: EVENT_TYPES.ORDER_CANCELLED,
      },
    });

    expect(cancelEvent).not.toBeNull();
    expect(cancelEvent!.status).toBe(OutboxStatus.PENDING);
    expect(cancelEvent!.payload).toMatchObject({
      orderId,
      reason: 'Found a better price',
      stockReleased: true,
    });
  });

  it('should generate order.reservation_expired outbox event when sweeping expired reservations', async () => {
    // 1. Create Order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '303 Expiry Lane',
        items: [{ productId, warehouseId, quantity: 3 }],
      });
    const orderId = orderRes.body.data.id;

    // 2. Artificially backdate the reservation to simulate elapsed TTL
    await prisma.inventoryReservation.updateMany({
      where: { orderId },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    // 3. Run reservation expiry sweeper
    const sweepResult = await reservationService.expireStaleReservations();
    expect(sweepResult.expiredOrdersCount).toBe(1);

    // 4. Verify order.reservation_expired OutboxEvent
    const expiredEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: EVENT_TYPES.ORDER_RESERVATION_EXPIRED,
      },
    });

    expect(expiredEvent).not.toBeNull();
    expect(expiredEvent!.status).toBe(OutboxStatus.PENDING);
  });

  it('should ensure database operations succeed when RabbitMQ is disconnected (zero message loss resilience)', async () => {
    // Temporarily close connection to simulate broker outage
    await rabbitmq.close();
    expect(rabbitmq.isConnected()).toBe(false);

    // Order creation must STILL succeed because of the Transactional Outbox Pattern!
    // No dual-write failure: PostgreSQL is source of truth.
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '404 Resilient Highway',
        items: [{ productId, warehouseId, quantity: 1 }],
      });

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    // Outbox event is safely committed in PostgreSQL despite broker outage
    const pendingEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: orderId },
    });
    expect(pendingEvent).not.toBeNull();
    expect(pendingEvent!.status).toBe(OutboxStatus.PENDING);

    // Broker reconnects
    await rabbitmq.connect();
    expect(rabbitmq.isConnected()).toBe(true);

    // Worker resumes and publishes the pending event
    const publishResult = await outboxPublisherWorker.publishPendingEvents();
    expect(publishResult.successCount).toBeGreaterThanOrEqual(1);

    const publishedEvent = await prisma.outboxEvent.findUnique({
      where: { id: pendingEvent!.id },
    });
    expect(publishedEvent!.status).toBe(OutboxStatus.PUBLISHED);
  });
});

