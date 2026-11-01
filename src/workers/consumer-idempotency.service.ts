import crypto from 'crypto';
import { Prisma, ProcessedEventStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import { APP_CONSTANTS } from '../config/constants';

export interface ClaimResult {
  claimed: boolean;
  claimToken?: string;
}

export class ConsumerIdempotencyService {
  /**
   * Attempts an atomic reservation for an event using PostgreSQL's ON CONFLICT DO UPDATE.
   * If the event has never been seen, inserts an IN_PROGRESS record with a fresh claimToken.
   * If an active unexpired claim exists or the event is already COMPLETED, claiming fails.
   * If a previous worker crashed leaving an IN_PROGRESS claim whose lease expired, reclaims it.
   */
  public async claimEvent(
    eventId: string,
    consumerName: string,
    eventType: string,
    leaseTtlSeconds: number = APP_CONSTANTS.OUTBOX_LOCK_TTL_SECONDS
  ): Promise<ClaimResult> {
    const claimToken = crypto.randomUUID();

    try {
      const rows = await prisma.$queryRaw<Array<{ id: string; claim_token: string }>>`
        INSERT INTO processed_events (
          id, event_id, consumer_name, event_type, status, claim_token, locked_at, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(),
          ${eventId},
          ${consumerName},
          ${eventType},
          'IN_PROGRESS'::"ProcessedEventStatus",
          ${claimToken}::uuid,
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT (event_id, consumer_name) DO UPDATE
        SET status = 'IN_PROGRESS'::"ProcessedEventStatus",
            claim_token = EXCLUDED.claim_token,
            locked_at = NOW(),
            updated_at = NOW()
        WHERE processed_events.status = 'IN_PROGRESS'::"ProcessedEventStatus"
          AND processed_events.locked_at < NOW() - (${leaseTtlSeconds} * INTERVAL '1 second')
        RETURNING id, claim_token;
      `;

      if (rows && rows.length > 0) {
        return { claimed: true, claimToken: rows[0].claim_token };
      }

      return { claimed: false };
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { claimed: false };
      }
      throw error;
    }
  }

  /**
   * Transitions an in-progress event to COMPLETED status using the unique claim token.
   * Prevents stale/expired workers from overwriting a newer worker's claim.
   */
  public async completeEvent(
    eventId: string,
    consumerName: string,
    claimToken: string
  ): Promise<boolean> {
    const count = await prisma.$executeRaw`
      UPDATE processed_events
      SET status = 'COMPLETED'::"ProcessedEventStatus",
          processed_at = NOW(),
          claim_token = NULL,
          updated_at = NOW()
      WHERE event_id = ${eventId}
        AND consumer_name = ${consumerName}
        AND claim_token = ${claimToken}::uuid
        AND status = 'IN_PROGRESS'::"ProcessedEventStatus";
    `;

    return count > 0;
  }

  /**
   * Releases an event claim if processing fails, allowing subsequent retries to execute.
   * Only deletes if the worker still holds the valid claimToken.
   */
  public async releaseClaim(
    eventId: string,
    consumerName: string,
    claimToken: string
  ): Promise<boolean> {
    const count = await prisma.$executeRaw`
      DELETE FROM processed_events
      WHERE event_id = ${eventId}
        AND consumer_name = ${consumerName}
        AND claim_token = ${claimToken}::uuid
        AND status = 'IN_PROGRESS'::"ProcessedEventStatus";
    `;

    return count > 0;
  }

  /**
   * Checks whether an event has achieved COMPLETED status for a specific consumer.
   */
  public async isEventProcessed(eventId: string, consumerName: string): Promise<boolean> {
    const existing = await prisma.processedEvent.findFirst({
      where: {
        eventId,
        consumerName,
        status: ProcessedEventStatus.COMPLETED,
      },
    });

    return !!existing;
  }

  /**
   * Executes a business handler under atomic consumer idempotency and crash recovery protection.
   * If already COMPLETED or held by an active unexpired worker, skips execution.
   */
  public async executeWithIdempotency<T>(
    eventId: string,
    consumerName: string,
    eventType: string,
    handler: () => Promise<T>,
    leaseTtlSeconds: number = APP_CONSTANTS.OUTBOX_LOCK_TTL_SECONDS
  ): Promise<{ skipped: boolean; result?: T; completed?: boolean }> {
    // 1. Attempt atomic claim (fresh event or stale expired lease)
    const claim = await this.claimEvent(eventId, consumerName, eventType, leaseTtlSeconds);

    if (!claim.claimed) {
      console.log(
        `[Idempotency:${consumerName}] Event '${eventId}' (${eventType}) was already completed or is held by an active worker. Skipping duplicate.`
      );
      return { skipped: true };
    }

    // 2. Execute business handler
    try {
      const result = await handler();

      // 3. Mark COMPLETED using the unique claim token
      const completed = await this.completeEvent(eventId, consumerName, claim.claimToken!);
      if (!completed) {
        console.warn(
          `[Idempotency:${consumerName}] Event '${eventId}' lease expired before completion. Another worker took over.`
        );
      }

      return { skipped: false, result, completed };
    } catch (err) {
      // Release claim so redelivery or retry can pick it up
      await this.releaseClaim(eventId, consumerName, claim.claimToken!);
      throw err;
    }
  }
}

export const consumerIdempotencyService = new ConsumerIdempotencyService();
