import { Channel } from 'amqplib';
import { BROKER_TOPICS, EVENT_TYPES } from '../config/constants';
import { rabbitmq } from '../infra/rabbitmq/rabbitmq.client';
import { EventEnvelope } from '../modules/events/event.types';
import { processConsumerMessage } from './worker-helper';

export class NotificationWorker {
  private consumerTag: string | null = null;
  private isRunning: boolean = false;
  private readonly consumerName = 'NotificationWorker';

  /**
   * Starts consuming messages from the order notifications queue.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const ch = rabbitmq.getChannel();
    // Ensure prefetch is bounded for fair dispatching
    await ch.prefetch(10);

    const { consumerTag } = await ch.consume(
      BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS,
      async (msg) => {
        if (!msg) return;
        await processConsumerMessage(ch, msg, this.consumerName, async (envelope) => {
          await this.handleEvent(envelope);
        });
      },
      { noAck: false } // Manual acknowledgements required
    );

    this.consumerTag = consumerTag;
    this.isRunning = true;
    console.log(`[${this.consumerName}] Started consuming from '${BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS}'`);
  }

  /**
   * Handles simulated notifications for order events.
   */
  public async handleEvent(envelope: EventEnvelope): Promise<void> {
    const { type, aggregateId, payload } = envelope;

    switch (type) {
      case EVENT_TYPES.ORDER_CREATED:
        console.log(
          `📧 [NOTIFICATION] Order Placed: Sent confirmation email to user '${payload.userId}' for Order '${payload.orderNumber || aggregateId}'. Total: $${((payload.totalAmountCents || 0) / 100).toFixed(2)}`
        );
        break;

      case EVENT_TYPES.ORDER_CONFIRMED:
        console.log(
          `📧 [NOTIFICATION] Payment Received: Sent payment confirmation receipt for Order '${payload.orderNumber || aggregateId}'. Payment Ref: '${payload.paymentId}'`
        );
        break;

      case EVENT_TYPES.ORDER_CANCELLED:
        console.log(
          `📧 [NOTIFICATION] Order Cancelled: Sent cancellation notice for Order '${payload.orderNumber || aggregateId}'. Reason: '${payload.reason}'. Stock Restored: ${payload.stockReleased}`
        );
        break;

      case EVENT_TYPES.ORDER_PAYMENT_FAILED:
        console.log(
          `📧 [NOTIFICATION] Payment Failed: Sent alert to user '${payload.userId}' for Order '${payload.orderNumber || aggregateId}'. Reason: '${payload.failureReason}'`
        );
        break;

      case EVENT_TYPES.ORDER_RESERVATION_EXPIRED:
        console.log(
          `📧 [NOTIFICATION] Reservation Expired: Order '${payload.orderNumber || aggregateId}' cancelled due to TTL timeout. Reserved stock released back to inventory.`
        );
        break;

      default:
        console.log(`[${this.consumerName}] Received unhandled event type '${type}' for aggregate '${aggregateId}'`);
        break;
    }
  }

  /**
   * Stops the consumer gracefully.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.consumerTag) {
      return;
    }

    try {
      const ch = rabbitmq.getChannel();
      await ch.cancel(this.consumerTag);
      this.consumerTag = null;
      this.isRunning = false;
      console.log(`[${this.consumerName}] Stopped consumer gracefully.`);
    } catch (err: any) {
      console.error(`[${this.consumerName}] Error stopping consumer:`, err.message);
    }
  }

  public getStatus(): { isRunning: boolean; consumerTag: string | null } {
    return {
      isRunning: this.isRunning,
      consumerTag: this.consumerTag,
    };
  }
}

export const notificationWorker = new NotificationWorker();

