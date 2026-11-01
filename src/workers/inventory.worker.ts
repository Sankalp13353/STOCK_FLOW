import { Channel } from 'amqplib';
import { BROKER_TOPICS, EVENT_TYPES } from '../config/constants';
import { rabbitmq } from '../infra/rabbitmq/rabbitmq.client';
import { EventEnvelope } from '../modules/events/event.types';
import { processConsumerMessage } from './worker-helper';

export class InventoryWorker {
  private consumerTag: string | null = null;
  private isRunning: boolean = false;
  private readonly consumerName = 'InventoryEventWorker';

  /**
   * Starts consuming messages from the inventory events queue.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const ch = rabbitmq.getChannel();
    await ch.prefetch(10);

    const { consumerTag } = await ch.consume(
      BROKER_TOPICS.QUEUES.INVENTORY_EVENTS,
      async (msg) => {
        if (!msg) return;
        await processConsumerMessage(ch, msg, this.consumerName, async (envelope) => {
          await this.handleEvent(envelope);
        });
      },
      { noAck: false }
    );

    this.consumerTag = consumerTag;
    this.isRunning = true;
    console.log(`[${this.consumerName}] Started consuming from '${BROKER_TOPICS.QUEUES.INVENTORY_EVENTS}'`);
  }

  /**
   * Handles downstream inventory reconciliation, metrics, and audit sync.
   */
  public async handleEvent(envelope: EventEnvelope): Promise<void> {
    const { type, aggregateId, payload } = envelope;

    switch (type) {
      case EVENT_TYPES.ORDER_CREATED:
        console.log(
          `📦 [INVENTORY_AUDIT] Order '${payload.orderNumber || aggregateId}' created: ${payload.items?.length || 0} item line(s) held in reservations.`
        );
        break;

      case EVENT_TYPES.ORDER_CONFIRMED:
        console.log(
          `📦 [INVENTORY_AUDIT] Order '${payload.orderNumber || aggregateId}' confirmed: stock deducted from warehouse physical inventory.`
        );
        break;

      case EVENT_TYPES.ORDER_CANCELLED:
        console.log(
          `📦 [INVENTORY_AUDIT] Order '${payload.orderNumber || aggregateId}' cancelled: stock release/restock completed (Stock Released: ${payload.stockReleased}).`
        );
        break;

      case EVENT_TYPES.ORDER_PAYMENT_FAILED:
        console.log(
          `📦 [INVENTORY_AUDIT] Payment failed for Order '${payload.orderNumber || aggregateId}': held reservations released back to available pool.`
        );
        break;

      case EVENT_TYPES.ORDER_RESERVATION_EXPIRED:
        console.log(
          `📦 [INVENTORY_AUDIT] Reservation expired for Order '${payload.orderNumber || aggregateId}': held units freed.`
        );
        break;

      default:
        console.log(`[${this.consumerName}] Logged inventory event '${type}' for '${aggregateId}'`);
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

export const inventoryWorker = new InventoryWorker();

