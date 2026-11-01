import { OutboxStatus } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { outboxService } from '../src/modules/outbox/outbox.service';
import { outboxPublisherWorker } from '../src/modules/outbox/outbox-publisher.worker';
import { rabbitmq } from '../src/infra/rabbitmq/rabbitmq.client';
import { BROKER_TOPICS, EVENT_TYPES } from '../src/config/constants';

describe('Transactional Outbox Pattern, Ordering & Resilient Retries', () => {
  beforeAll(async () => {
    try {
      await rabbitmq.connect();
    } catch {
      // Connects if RabbitMQ is available locally
    }
  });

  afterAll(async () => {
    await rabbitmq.close();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Outbox Transactional Integrity & Leases', () => {
    it('should atomically persist an outbox event within a successful database transaction', async () => {
      const dummyOrderId = 'a0000000-0000-0000-0000-000000000001';

      await prisma.$transaction(async (tx) => {
        await outboxService.recordEvent(tx, {
          aggregateType: 'Order',
          aggregateId: dummyOrderId,
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { orderId: dummyOrderId, amount: 5000 },
        });
      });

      const events = await prisma.outboxEvent.findMany({
        where: { aggregateId: dummyOrderId },
      });

      expect(events).toHaveLength(1);
      expect(events[0].status).toBe(OutboxStatus.PENDING);
      expect(events[0].eventType).toBe(EVENT_TYPES.ORDER_CREATED);
      expect(events[0].retryCount).toBe(0);
      expect(events[0].publishedAt).toBeNull();
    });

    it('should roll back outbox event when the surrounding business transaction fails', async () => {
      const dummyOrderId = 'a0000000-0000-0000-0000-000000000002';

      await expect(
        prisma.$transaction(async (tx) => {
          await outboxService.recordEvent(tx, {
            aggregateType: 'Order',
            aggregateId: dummyOrderId,
            eventType: EVENT_TYPES.ORDER_CREATED,
            payload: { orderId: dummyOrderId },
          });

          throw new Error('Simulated business transaction failure');
        })
      ).rejects.toThrow('Simulated business transaction failure');

      const count = await prisma.outboxEvent.count({
        where: { aggregateId: dummyOrderId },
      });
      expect(count).toBe(0);
    });

    it('should safely claim a batch using FOR UPDATE SKIP LOCKED without duplicate assignments', async () => {
      // Seed 5 pending outbox events for DIFFERENT aggregates
      for (let i = 1; i <= 5; i++) {
        await prisma.outboxEvent.create({
          data: {
            aggregateType: 'Order',
            aggregateId: `b0000000-0000-0000-0000-00000000000${i}`,
            eventType: EVENT_TYPES.ORDER_CREATED,
            payload: { testIndex: i },
            status: OutboxStatus.PENDING,
          },
        });
      }

      const batch1 = await outboxPublisherWorker.claimBatch(3);
      expect(batch1).toHaveLength(3);

      for (const row of batch1) {
        expect(row.status).toBe(OutboxStatus.PROCESSING);
      }

      const batch2 = await outboxPublisherWorker.claimBatch(3);
      expect(batch2).toHaveLength(2);

      const batch1Ids = new Set(batch1.map((r) => r.id));
      for (const row of batch2) {
        expect(batch1Ids.has(row.id)).toBe(false);
      }

      const batch3 = await outboxPublisherWorker.claimBatch(3);
      expect(batch3).toHaveLength(0);
    });

    it('should reclaim processing events whose lease has expired (crashed worker recovery)', async () => {
      const oldLockedAt = new Date(Date.now() - 120 * 1000);
      const stuckEvent = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: 'c0000000-0000-0000-0000-000000000001',
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { recovered: true },
          status: OutboxStatus.PROCESSING,
          lockedAt: oldLockedAt,
        },
      });

      const reclaimed = await outboxPublisherWorker.claimBatch(10, 5, 60);
      expect(reclaimed.some((r) => r.id === stuckEvent.id)).toBe(true);
    });
  });

  describe('Per-Aggregate Event Ordering Guarantees', () => {
    it('should strictly preserve publication order for events belonging to the same order', async () => {
      if (!rabbitmq.isConnected()) {
        await rabbitmq.connect();
      }

      const orderId = 'd1000000-0000-0000-0000-000000000001';

      // 1. Create Event 1 (order.created) at T0
      const event1 = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderId,
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { step: 1 },
          status: OutboxStatus.PENDING,
          createdAt: new Date(Date.now() - 5000),
        },
      });

      // 2. Create Event 2 (order.confirmed) at T0 + 1s for the SAME order
      const event2 = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderId,
          eventType: EVENT_TYPES.ORDER_CONFIRMED,
          payload: { step: 2 },
          status: OutboxStatus.PENDING,
          createdAt: new Date(Date.now() - 4000),
        },
      });

      // 3. Batch claim: ONLY Event 1 should be claimed. Event 2 is blocked by Event 1!
      const batch1 = await outboxPublisherWorker.claimBatch(10);
      expect(batch1).toHaveLength(1);
      expect(batch1[0].id).toBe(event1.id);
      expect(batch1[0].event_type).toBe(EVENT_TYPES.ORDER_CREATED);

      // Verify Event 2 is STILL PENDING in DB
      const checkEvent2 = await prisma.outboxEvent.findUnique({ where: { id: event2.id } });
      expect(checkEvent2!.status).toBe(OutboxStatus.PENDING);

      // 4. Publish Event 1
      await rabbitmq.publishWithConfirmation(BROKER_TOPICS.EXCHANGE, batch1[0].event_type, batch1[0].payload);
      await prisma.outboxEvent.update({
        where: { id: event1.id },
        data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date() },
      });

      // 5. Next batch claim: Now that Event 1 is PUBLISHED, Event 2 is eligible and claimed!
      const batch2 = await outboxPublisherWorker.claimBatch(10);
      expect(batch2).toHaveLength(1);
      expect(batch2[0].id).toBe(event2.id);
      expect(batch2[0].event_type).toBe(EVENT_TYPES.ORDER_CONFIRMED);
    });

    it('should allow events belonging to DIFFERENT orders to be claimed concurrently in the same batch', async () => {
      const orderA = 'd2000000-0000-0000-0000-000000000001';
      const orderB = 'd2000000-0000-0000-0000-000000000002';

      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderA,
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { order: 'A' },
          status: OutboxStatus.PENDING,
        },
      });

      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderB,
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { order: 'B' },
          status: OutboxStatus.PENDING,
        },
      });

      const batch = await outboxPublisherWorker.claimBatch(10);
      expect(batch).toHaveLength(2);
      const aggregateIds = batch.map((r) => r.aggregate_id);
      expect(aggregateIds).toContain(orderA);
      expect(aggregateIds).toContain(orderB);
    });

    it('should prevent a later event from overtaking an earlier event that is FAILED and awaiting retry', async () => {
      const orderId = 'd3000000-0000-0000-0000-000000000001';

      // Earlier event is FAILED (e.g. broker error)
      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderId,
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { step: 1 },
          status: OutboxStatus.FAILED,
          retryCount: 1,
          createdAt: new Date(Date.now() - 10000),
          retryAfter: new Date(Date.now() + 60000), // In future backoff window
        },
      });

      // Later event is PENDING
      const event2 = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: orderId,
          eventType: EVENT_TYPES.ORDER_CONFIRMED,
          payload: { step: 2 },
          status: OutboxStatus.PENDING,
          createdAt: new Date(Date.now() - 5000),
        },
      });

      // Attempt to claim: Event 2 must NOT overtake Event 1!
      const batch = await outboxPublisherWorker.claimBatch(10);
      expect(batch.some((e) => e.id === event2.id)).toBe(false);
    });
  });

  describe('Outbox Exponential Backoff & Full Retry Lifecycle', () => {
    it('should not claim a failed event before its exponential retry_after has elapsed', async () => {
      const futureDate = new Date(Date.now() + 60 * 1000); // 60s in future
      const failedEvent = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: 'e1000000-0000-0000-0000-000000000001',
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { test: true },
          status: OutboxStatus.FAILED,
          retryCount: 1,
          retryAfter: futureDate,
        },
      });

      // While retryAfter is in the future, event should not be claimed
      const batchBefore = await outboxPublisherWorker.claimBatch(10);
      expect(batchBefore.some((r) => r.id === failedEvent.id)).toBe(false);

      // Artificially advance time by backdating retryAfter into the past
      await prisma.outboxEvent.update({
        where: { id: failedEvent.id },
        data: { retryAfter: new Date(Date.now() - 5000) },
      });

      // Now event should be eligible and claimed
      const batchAfter = await outboxPublisherWorker.claimBatch(10);
      expect(batchAfter.some((r) => r.id === failedEvent.id)).toBe(true);
    });

    it('should complete full lifecycle: publication failure -> retry eligibility -> successful republishing -> PUBLISHED', async () => {
      if (!rabbitmq.isConnected()) {
        await rabbitmq.connect();
      }

      const event = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: 'e2000000-0000-0000-0000-000000000001',
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { orderNumber: 'ORD-LIFECYCLE-1' },
          status: OutboxStatus.PENDING,
        },
      });

      // 1. First publish attempt: Mock broker rejection
      const originalPublish = rabbitmq.publishWithConfirmation;
      (rabbitmq as any).publishWithConfirmation = jest.fn().mockRejectedValue(new Error('Simulated network timeout'));

      const failureCycle = await outboxPublisherWorker.publishPendingEvents();
      expect(failureCycle.failureCount).toBe(1);

      // Verify status FAILED, retryCount = 1, retryAfter set
      const failedInDb = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
      expect(failedInDb!.status).toBe(OutboxStatus.FAILED);
      expect(failedInDb!.retryCount).toBe(1);
      expect(failedInDb!.retryAfter).not.toBeNull();
      expect(failedInDb!.lastError).toContain('Simulated network timeout');

      // 2. Advance retryAfter into past to simulate backoff window elapsed
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { retryAfter: new Date(Date.now() - 1000) },
      });

      // 3. Restore working broker and run second publish attempt
      (rabbitmq as any).publishWithConfirmation = originalPublish;

      const successCycle = await outboxPublisherWorker.publishPendingEvents();
      expect(successCycle.successCount).toBe(1);

      // 4. Verify status transitioned to PUBLISHED with publishedAt
      const publishedInDb = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
      expect(publishedInDb!.status).toBe(OutboxStatus.PUBLISHED);
      expect(publishedInDb!.publishedAt).not.toBeNull();
      expect(publishedInDb!.retryAfter).toBeNull();
      expect(publishedInDb!.lastError).toBeNull();
    });

    it('should respect maximum retry limit: event is never claimed after reaching maxRetries', async () => {
      const exhaustedEvent = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Order',
          aggregateId: 'e3000000-0000-0000-0000-000000000001',
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: { permanentFail: true },
          status: OutboxStatus.FAILED,
          retryCount: 5, // Reached max retries (5)
          retryAfter: new Date(Date.now() - 5000), // Even though elapsed
        },
      });

      const batch = await outboxPublisherWorker.claimBatch(10, 5);
      expect(batch.some((r) => r.id === exhaustedEvent.id)).toBe(false);
    });
  });
});
