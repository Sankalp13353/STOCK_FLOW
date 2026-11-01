import { rabbitmq } from '../src/infra/rabbitmq/rabbitmq.client';
import { BROKER_TOPICS } from '../src/config/constants';

describe('RabbitMQ Connection & Topology Infrastructure', () => {
  beforeAll(async () => {
    await rabbitmq.connect();
  });

  afterAll(async () => {
    await rabbitmq.close();
  });

  it('should establish active connection and confirm channels', () => {
    expect(rabbitmq.isConnected()).toBe(true);
    expect(rabbitmq.getChannel()).toBeDefined();
    expect(rabbitmq.getConfirmChannel()).toBeDefined();
  });

  it('should verify durable topology: exchanges, queues, and DLQs', async () => {
    const ch = rabbitmq.getChannel();

    // Verify exchange assertions succeed
    await expect(ch.checkExchange(BROKER_TOPICS.EXCHANGE)).resolves.not.toThrow();
    await expect(ch.checkExchange(BROKER_TOPICS.DLX)).resolves.not.toThrow();

    // Verify primary and dead-letter queue assertions succeed
    const notifQueue = await ch.checkQueue(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS);
    expect(notifQueue.queue).toBe(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS);

    const invQueue = await ch.checkQueue(BROKER_TOPICS.QUEUES.INVENTORY_EVENTS);
    expect(invQueue.queue).toBe(BROKER_TOPICS.QUEUES.INVENTORY_EVENTS);

    const notifDlq = await ch.checkQueue(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ);
    expect(notifDlq.queue).toBe(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ);

    const invDlq = await ch.checkQueue(BROKER_TOPICS.QUEUES.INVENTORY_EVENTS_DLQ);
    expect(invDlq.queue).toBe(BROKER_TOPICS.QUEUES.INVENTORY_EVENTS_DLQ);
  });

  it('should publish with publisher confirms and consume message from queue', async () => {
    const ch = rabbitmq.getChannel();
    const testEventId = `test-event-${Date.now()}`;
    const testMessage = {
      id: testEventId,
      type: 'order.created',
      aggregateType: 'Order',
      aggregateId: 'f0000000-0000-0000-0000-000000000001',
      payload: { message: 'Hello RabbitMQ' },
      timestamp: new Date().toISOString(),
      version: 1,
    };

    // Purge queue before test to ensure clean state
    await ch.purgeQueue(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS);

    // Publish with confirmation to exchange
    const published = await rabbitmq.publishWithConfirmation(
      BROKER_TOPICS.EXCHANGE,
      'order.created',
      testMessage
    );
    expect(published).toBe(true);

    // Consume single message
    const received = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for message consumption')), 5000);

      ch.consume(
        BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS,
        (msg) => {
          if (msg) {
            clearTimeout(timeout);
            ch.ack(msg);
            const parsed = JSON.parse(msg.content.toString());
            resolve(parsed);
          }
        },
        { noAck: false }
      );
    });

    expect(received.id).toBe(testEventId);
    expect(received.type).toBe('order.created');
    expect(received.payload.message).toBe('Hello RabbitMQ');
  });
});

