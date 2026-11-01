import { OutboxEvent, OutboxStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export interface CreateOutboxEventParams {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
}

export class OutboxService {
  /**
   * Persists an outbox event within an existing database transaction client.
   * Guarantees atomic inclusion with business entity modifications.
   */
  public async recordEvent(
    tx: Prisma.TransactionClient,
    params: CreateOutboxEventParams
  ): Promise<OutboxEvent> {
    const { aggregateType, aggregateId, eventType, payload } = params;

    return tx.outboxEvent.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payload: payload ?? {},
        status: OutboxStatus.PENDING,
      },
    });
  }

  /**
   * Directly queries outbox event by ID (useful for verification and testing).
   */
  public async getEventById(id: string): Promise<OutboxEvent | null> {
    return prisma.outboxEvent.findUnique({
      where: { id },
    });
  }

  /**
   * Counts events by status.
   */
  public async countByStatus(status: OutboxStatus): Promise<number> {
    return prisma.outboxEvent.count({
      where: { status },
    });
  }
}

export const outboxService = new OutboxService();

