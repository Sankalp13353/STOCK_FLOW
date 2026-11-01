import { Channel, ConsumeMessage } from 'amqplib';
import { APP_CONSTANTS, BROKER_TOPICS } from '../config/constants';
import { rabbitmq } from '../infra/rabbitmq/rabbitmq.client';
import { EventEnvelope } from '../modules/events/event.types';
import { consumerIdempotencyService } from './consumer-idempotency.service';

export async function processConsumerMessage(
  ch: Channel,
  msg: ConsumeMessage,
  consumerName: string,
  handler: (envelope: EventEnvelope) => Promise<void>
): Promise<void> {
  const headers = msg.properties.headers || {};
  const retryCount = (headers['x-retry-count'] as number) || 0;

  try {
    const rawContent = msg.content.toString();
    const envelope: EventEnvelope = JSON.parse(rawContent);

    if (!envelope.id || !envelope.type) {
      throw new Error(`Invalid message envelope structure: missing id or type`);
    }

    // Process through consumer idempotency barrier
    await consumerIdempotencyService.executeWithIdempotency(
      envelope.id,
      consumerName,
      envelope.type,
      async () => {
        await handler(envelope);
      }
    );

    // Acknowledge after successful processing and idempotency commit
    ch.ack(msg);
  } catch (error: any) {
    console.error(`[${consumerName}] Processing failed: ${error.message}`);

    if (retryCount < APP_CONSTANTS.MAX_CONSUMER_RETRIES) {
      const nextRetry = retryCount + 1;
      console.warn(
        `[${consumerName}] Retrying event (attempt ${nextRetry} of ${APP_CONSTANTS.MAX_CONSUMER_RETRIES})...`
      );

      try {
        const parsed = JSON.parse(msg.content.toString());
        await rabbitmq.publishWithConfirmation(
          msg.fields.exchange || BROKER_TOPICS.EXCHANGE,
          msg.fields.routingKey,
          parsed,
          {
            ...headers,
            'x-retry-count': nextRetry,
            'x-last-error': error.message,
            'x-failed-consumer': consumerName,
          }
        );
        // Ack the failed instance so the re-queued instance with updated retry header takes over
        ch.ack(msg);
      } catch (republishErr: any) {
        console.error(`[${consumerName}] Failed to republish for retry:`, republishErr.message);
        // Fallback to nack to DLQ
        ch.nack(msg, false, false);
      }
    } else {
      console.error(
        `[${consumerName}] Max retries (${APP_CONSTANTS.MAX_CONSUMER_RETRIES}) exceeded. Routing to Dead-Letter Queue.`
      );
      // Reject without requeue -> Dead-Letter Exchange (DLX) routes to DLQ
      ch.nack(msg, false, false);
    }
  }
}

