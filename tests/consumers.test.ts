import { ProcessedEventStatus } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { notificationWorker } from '../src/workers/notification.worker';
import { inventoryWorker } from '../src/workers/inventory.worker';
import { consumerIdempotencyService } from '../src/workers/consumer-idempotency.service';
import { processConsumerMessage } from '../src/workers/worker-helper';
import { EVENT_TYPES, BROKER_TOPICS, APP_CONSTANTS } from '../src/config/constants';
import { rabbitmq } from '../src/infra/rabbitmq/rabbitmq.client';
import { EventEnvelope } from '../src/modules/events/event.types';

describe('Consumer Workers, Idempotency & Crash Recovery', () => {
  beforeAll(async () => {
    await rabbitmq.connect();
  });

  afterAll(async () => {
    await rabbitmq.close();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('NotificationWorker & InventoryWorker Event Handling', () => {
    it('should process all order event types in NotificationWorker without error', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const eventTypes = [
        EVENT_TYPES.ORDER_CREATED,
        EVENT_TYPES.ORDER_CONFIRMED,
        EVENT_TYPES.ORDER_CANCELLED,
        EVENT_TYPES.ORDER_PAYMENT_FAILED,
        EVENT_TYPES.ORDER_RESERVATION_EXPIRED,
      ];

      for (const type of eventTypes) {
        const envelope: EventEnvelope = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          type,
          aggregateType: 'Order',
          aggregateId: 'test-order-id',
          payload: {
            orderId: 'test-order-id',
            orderNumber: 'ORD-TEST-123',
            userId: 'user-123',
            totalAmountCents: 10000,
            reason: 'Customer request',
            stockReleased: true,
          },
          timestamp: new Date().toISOString(),
          version: 1,
        };

        await expect(notificationWorker.handleEvent(envelope)).resolves.not.toThrow();
      }

      consoleSpy.mockRestore();
    });

    it('should process inventory events in InventoryWorker without error', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const envelope: EventEnvelope = {
        id: `evt-inv-${Date.now()}`,
        type: EVENT_TYPES.ORDER_CONFIRMED,
        aggregateType: 'Order',
        aggregateId: 'test-order-id',
        payload: {
          orderId: 'test-order-id',
          orderNumber: 'ORD-TEST-INV',
        },
        timestamp: new Date().toISOString(),
        version: 1,
      };

      await expect(inventoryWorker.handleEvent(envelope)).resolves.not.toThrow();
      consoleSpy.mockRestore();
    });
  });

  describe('Consumer Crash Recovery & Lease Management', () => {
    it('should recover from simulated crash after claim and process redelivery after lease expiry', async () => {
      const eventId = `crash-event-${Date.now()}`;
      const consumerName = 'CrashRecoveryWorker';
      let executionCount = 0;

      // 1. Simulate Worker 1 claiming event and then crashing abruptly before handler completes
      const claim1 = await consumerIdempotencyService.claimEvent(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, 5);
      expect(claim1.claimed).toBe(true);
      expect(claim1.claimToken).toBeDefined();

      // Verify row is IN_PROGRESS in DB
      const record1 = await prisma.processedEvent.findFirst({
        where: { eventId, consumerName },
      });
      expect(record1!.status).toBe(ProcessedEventStatus.IN_PROGRESS);

      // 2. Immediate redelivery while lease is still active (5s TTL) must be skipped
      const claimImmediate = await consumerIdempotencyService.claimEvent(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, 5);
      expect(claimImmediate.claimed).toBe(false);

      // 3. Artificially backdate locked_at by 10 seconds to simulate elapsed lease
      await prisma.processedEvent.updateMany({
        where: { eventId, consumerName },
        data: { lockedAt: new Date(Date.now() - 10 * 1000) },
      });

      // 4. Redelivered message after lease expiry should now successfully reclaim and execute
      const executeResult = await consumerIdempotencyService.executeWithIdempotency(
        eventId,
        consumerName,
        EVENT_TYPES.ORDER_CREATED,
        async () => {
          executionCount++;
          return 'recovered-data';
        },
        5 // 5s lease
      );

      expect(executeResult.skipped).toBe(false);
      expect(executeResult.completed).toBe(true);
      expect(executionCount).toBe(1);

      // 5. Verify status transitioned to COMPLETED in database
      const finalRecord = await prisma.processedEvent.findFirst({
        where: { eventId, consumerName },
      });
      expect(finalRecord!.status).toBe(ProcessedEventStatus.COMPLETED);
      expect(finalRecord!.processedAt).not.toBeNull();
    });

    it('should prevent an expired worker from overwriting a newer worker claim (claim token fence)', async () => {
      const eventId = `fence-event-${Date.now()}`;
      const consumerName = 'FenceWorker';

      // 1. Worker 1 claims event
      const claim1 = await consumerIdempotencyService.claimEvent(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, 5);
      expect(claim1.claimed).toBe(true);

      // 2. Backdate locked_at to expire Worker 1 lease
      await prisma.processedEvent.updateMany({
        where: { eventId, consumerName },
        data: { lockedAt: new Date(Date.now() - 10 * 1000) },
      });

      // 3. Worker 2 takes over the claim
      const claim2 = await consumerIdempotencyService.claimEvent(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, 5);
      expect(claim2.claimed).toBe(true);
      expect(claim2.claimToken).not.toBe(claim1.claimToken);

      // 4. Worker 1 wakes up and attempts to complete using its expired claim token
      const worker1Complete = await consumerIdempotencyService.completeEvent(eventId, consumerName, claim1.claimToken!);
      expect(worker1Complete).toBe(false); // Refused!

      // 5. Worker 2 completes using valid current claim token
      const worker2Complete = await consumerIdempotencyService.completeEvent(eventId, consumerName, claim2.claimToken!);
      expect(worker2Complete).toBe(true); // Accepted!
    });

    it('should permanently prevent duplicate processing once an event is COMPLETED', async () => {
      const eventId = `completed-event-${Date.now()}`;
      const consumerName = 'CompletedWorker';
      let executionCount = 0;

      // First run executes and completes
      const firstRun = await consumerIdempotencyService.executeWithIdempotency(
        eventId,
        consumerName,
        EVENT_TYPES.ORDER_CREATED,
        async () => {
          executionCount++;
        }
      );
      expect(firstRun.skipped).toBe(false);
      expect(executionCount).toBe(1);

      // Even if backdated, a COMPLETED event cannot be claimed or re-executed
      await prisma.processedEvent.updateMany({
        where: { eventId, consumerName },
        data: { lockedAt: new Date(Date.now() - 3600 * 1000) },
      });

      const secondRun = await consumerIdempotencyService.executeWithIdempotency(
        eventId,
        consumerName,
        EVENT_TYPES.ORDER_CREATED,
        async () => {
          executionCount++;
        }
      );
      expect(secondRun.skipped).toBe(true);
      expect(executionCount).toBe(1); // Never executed again
    });

    it('should release claim on handler failure so subsequent retries can re-claim immediately', async () => {
      const eventId = `fail-release-event-${Date.now()}`;
      const consumerName = 'FailReleaseWorker';
      let attempts = 0;

      // First attempt fails
      await expect(
        consumerIdempotencyService.executeWithIdempotency(
          eventId,
          consumerName,
          EVENT_TYPES.ORDER_CREATED,
          async () => {
            attempts++;
            throw new Error('Handler crashed');
          }
        )
      ).rejects.toThrow('Handler crashed');

      expect(attempts).toBe(1);

      // Claim should have been released (deleted), so next attempt can claim immediately without waiting for lease TTL
      const secondRun = await consumerIdempotencyService.executeWithIdempotency(
        eventId,
        consumerName,
        EVENT_TYPES.ORDER_CREATED,
        async () => {
          attempts++;
          return 'success-on-retry';
        }
      );

      expect(secondRun.skipped).toBe(false);
      expect(attempts).toBe(2);
      expect(secondRun.result).toBe('success-on-retry');
    });

    it('should handle simultaneous duplicate deliveries without race conditions', async () => {
      const eventId = `concurrent-event-${Date.now()}`;
      const consumerName = 'ConcurrentSafetyWorker';
      let executionCount = 0;

      const handler = async () => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
      };

      // 3 simultaneous deliveries
      await Promise.all([
        consumerIdempotencyService.executeWithIdempotency(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, handler),
        consumerIdempotencyService.executeWithIdempotency(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, handler),
        consumerIdempotencyService.executeWithIdempotency(eventId, consumerName, EVENT_TYPES.ORDER_CREATED, handler),
      ]);

      expect(executionCount).toBe(1);
    });
  });

  describe('Bounded Retries & Dead-Letter Queue (DLQ) Routing', () => {
    it('should retry transient errors with bounded attempts and increment retry headers', async () => {
      const mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
      } as any;

      const envelope: EventEnvelope = {
        id: `evt-retry-${Date.now()}`,
        type: EVENT_TYPES.ORDER_CREATED,
        aggregateType: 'Order',
        aggregateId: 'retry-order-1',
        payload: { test: true },
        timestamp: new Date().toISOString(),
        version: 1,
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(envelope)),
        fields: {
          exchange: BROKER_TOPICS.EXCHANGE,
          routingKey: EVENT_TYPES.ORDER_CREATED,
        },
        properties: {
          headers: { 'x-retry-count': 1 },
        },
      } as any;

      const publishSpy = jest.spyOn(rabbitmq, 'publishWithConfirmation').mockResolvedValue(true);

      const failingHandler = async () => {
        throw new Error('Temporary downstream timeout');
      };

      await processConsumerMessage(mockChannel, mockMsg, 'RetryTestWorker', failingHandler);

      expect(publishSpy).toHaveBeenCalledWith(
        BROKER_TOPICS.EXCHANGE,
        EVENT_TYPES.ORDER_CREATED,
        envelope,
        expect.objectContaining({ 'x-retry-count': 2 })
      );

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
      publishSpy.mockRestore();
    });

    it('should route permanently failing messages to Dead-Letter Queue when max retries are exceeded', async () => {
      const ch = rabbitmq.getChannel();
      await ch.purgeQueue(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ);

      const dlqEventId = `evt-dlq-${Date.now()}`;
      const envelope: EventEnvelope = {
        id: dlqEventId,
        type: EVENT_TYPES.ORDER_CREATED,
        aggregateType: 'Order',
        aggregateId: 'dlq-order-1',
        payload: { willFailPermanently: true },
        timestamp: new Date().toISOString(),
        version: 1,
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(envelope)),
        fields: {
          exchange: BROKER_TOPICS.EXCHANGE,
          routingKey: 'order.created',
        },
        properties: {
          headers: { 'x-retry-count': APP_CONSTANTS.MAX_CONSUMER_RETRIES },
        },
      } as any;

      const mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
      } as any;

      const failingHandler = async () => {
        throw new Error('Permanent processing error');
      };

      await processConsumerMessage(mockChannel, mockMsg, 'DLQTestWorker', failingHandler);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });
  });
});
