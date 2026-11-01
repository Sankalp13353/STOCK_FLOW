import { OutboxStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { rabbitmq } from '../../infra/rabbitmq/rabbitmq.client';
import { APP_CONSTANTS, BROKER_TOPICS } from '../../config/constants';
import { EventEnvelope } from '../events/event.types';

export interface OutboxClaimedRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: any;
  status: OutboxStatus;
  retry_count: number;
  last_error: string | null;
  retry_after: Date | null;
  created_at: Date;
}

export class OutboxPublisherWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private isRunning: boolean = false;

  /**
   * Safely claims a batch of pending/failed/expired-lease outbox events.
   * Guarantees:
   * 1. Strict Per-Aggregate Ordering: An event is only claimed if no earlier event
   *    for the same aggregate is pending, processing, or failed awaiting retry.
   * 2. Concurrent Processing across different aggregates.
   * 3. Exponential Backoff: Failed events are not reclaimed until retry_after has elapsed.
   * 4. FOR UPDATE SKIP LOCKED: Lock is committed immediately so no DB transaction is held
   *    during network transmission to RabbitMQ.
   */
  public async claimBatch(
    batchSize: number = APP_CONSTANTS.OUTBOX_BATCH_SIZE,
    maxRetries: number = APP_CONSTANTS.OUTBOX_MAX_RETRIES,
    lockTtlSeconds: number = APP_CONSTANTS.OUTBOX_LOCK_TTL_SECONDS
  ): Promise<OutboxClaimedRow[]> {
    const claimedRows = await prisma.$queryRaw<OutboxClaimedRow[]>`
      UPDATE outbox_events
      SET status = 'PROCESSING'::"OutboxStatus",
          locked_at = NOW(),
          updated_at = NOW()
      WHERE id IN (
        SELECT e.id
        FROM outbox_events e
        WHERE (
          e.status = 'PENDING'::"OutboxStatus"
          OR (
            e.status = 'FAILED'::"OutboxStatus"
            AND e.retry_count < ${maxRetries}
            AND (e.retry_after IS NULL OR e.retry_after <= NOW())
          )
          OR (
            e.status = 'PROCESSING'::"OutboxStatus"
            AND e.locked_at < NOW() - (${lockTtlSeconds} * INTERVAL '1 second')
          )
        )
        -- Enforce strict per-aggregate FIFO ordering:
        -- Exclude event e if any prior event for the same aggregate has not yet achieved PUBLISHED status
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_events prior
          WHERE prior.aggregate_type = e.aggregate_type
            AND prior.aggregate_id = e.aggregate_id
            AND prior.id != e.id
            AND prior.status != 'PUBLISHED'::"OutboxStatus"
            AND (
              prior.created_at < e.created_at
              OR (prior.created_at = e.created_at AND prior.id < e.id)
            )
        )
        ORDER BY e.created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, last_error, retry_after, created_at;
    `;

    return claimedRows;
  }

  /**
   * Processes a single iteration of publishing pending outbox events to RabbitMQ.
   * Returns the count of successfully published events.
   */
  public async publishPendingEvents(): Promise<{ processedCount: number; successCount: number; failureCount: number }> {
    if (!rabbitmq.isConnected()) {
      return { processedCount: 0, successCount: 0, failureCount: 0 };
    }

    const claimedEvents = await this.claimBatch();
    if (claimedEvents.length === 0) {
      return { processedCount: 0, successCount: 0, failureCount: 0 };
    }

    let successCount = 0;
    let failureCount = 0;

    for (const event of claimedEvents) {
      const envelope: EventEnvelope = {
        id: event.id,
        type: event.event_type,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        payload: event.payload,
        timestamp: new Date(event.created_at).toISOString(),
        version: 1,
      };

      try {
        // Publish to topic exchange with routing key = event_type
        await rabbitmq.publishWithConfirmation(
          BROKER_TOPICS.EXCHANGE,
          event.event_type,
          envelope,
          {
            'x-event-id': event.id,
            'x-aggregate-type': event.aggregate_type,
            'x-aggregate-id': event.aggregate_id,
          }
        );

        // Mark as PUBLISHED only after broker confirmation
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
            lockedAt: null,
            lastError: null,
            retryAfter: null,
          },
        });

        successCount++;
        console.log(`[OutboxPublisher] Published event '${event.event_type}' (ID: ${event.id})`);
      } catch (err: any) {
        failureCount++;
        const errorMessage = err?.message || 'Unknown broker error';
        console.error(`[OutboxPublisher] Failed to publish event '${event.event_type}' (ID: ${event.id}):`, errorMessage);

        // Exponential backoff: 2^n seconds, capped at 60s
        const nextRetryCount = event.retry_count + 1;
        const backoffSeconds = Math.min(Math.pow(2, nextRetryCount), 60);
        const retryAfter = new Date(Date.now() + backoffSeconds * 1000);

        // Record failure, increment retry count, set retryAfter backoff window
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.FAILED,
            retryCount: { increment: 1 },
            lastError: errorMessage,
            retryAfter,
            lockedAt: null,
          },
        });
      }
    }

    return {
      processedCount: claimedEvents.length,
      successCount,
      failureCount,
    };
  }

  /**
   * Starts background polling loop.
   */
  public start(intervalMs: number = APP_CONSTANTS.OUTBOX_POLL_INTERVAL_MS): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`[OutboxPublisher] Background worker started (polling every ${intervalMs}ms)`);

    this.timer = setInterval(async () => {
      if (this.isProcessing) {
        return; // Guard against overlapping runs
      }
      this.isProcessing = true;
      try {
        await this.publishPendingEvents();
      } catch (err: any) {
        console.error('[OutboxPublisher] Error during poll cycle:', err.message);
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);
  }

  /**
   * Stops background polling worker.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[OutboxPublisher] Background worker stopped.');
  }

  public getStatus(): { isRunning: boolean; isProcessing: boolean } {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
    };
  }
}

export const outboxPublisherWorker = new OutboxPublisherWorker();
