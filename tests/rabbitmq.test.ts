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

  describe('RabbitMQ URL Safety & Credentials Sanitization', () => {
    describe('Valid Encoded Credentials', () => {
      it('should preserve already percent-encoded credentials without double-encoding', () => {
        const encodedUrl = 'amqp://user%40stockflow:p%40ss%23w%3Aord%2F%26%25@rabbitmq.railway.internal:5672/vhost';
        const normalized = rabbitmq.normalizeUrl(encodedUrl);

        expect(normalized).toBe(encodedUrl);
        // Ensure %40 didn't become %2540 and %23 didn't become %2523
        expect(normalized).not.toContain('%2540');
        expect(normalized).not.toContain('%2523');

        // Confirm idempotency
        expect(rabbitmq.normalizeUrl(normalized)).toBe(normalized);
      });
    });

    describe('Raw Special Characters Handling', () => {
      it('should properly percent-encode passwords containing @, :, #, %, !, &, and /', () => {
        const rawUrl = 'amqp://app_user:p@ss:w#o%r!d&/@rabbitmq.railway.internal:5672/vhost';
        const normalized = rabbitmq.normalizeUrl(rawUrl);

        // @ -> %40, : -> %3A, # -> %23, %r -> %25r, & -> %26, / -> %2F
        expect(normalized).toBe('amqp://app_user:p%40ss%3Aw%23o%25r!d%26%2F@rabbitmq.railway.internal:5672/vhost');

        // Verify that WHATWG URL parser successfully parses the normalized URL
        const parsed = new URL(normalized);
        expect(parsed.hostname).toBe('rabbitmq.railway.internal');
        expect(parsed.port).toBe('5672');
        expect(parsed.pathname).toBe('/vhost');

        // Verify idempotency
        expect(rabbitmq.normalizeUrl(normalized)).toBe(normalized);
      });

      it('should handle special characters in username as well', () => {
        const rawUrl = 'amqp://user@org#1:pass123@rabbitmq.railway.internal:5672';
        const normalized = rabbitmq.normalizeUrl(rawUrl);

        expect(normalized).toBe('amqp://user%40org%231:pass123@rabbitmq.railway.internal:5672');
      });
    });

    describe('Malformed Percent Sequences Resilience', () => {
      it('should safely normalize URLs with malformed percent sequences without throwing URIError', () => {
        // Test non-hex (%word, %zz), trailing percent (pass%), and single hex digit (pass%1)
        const malformedUrls = [
          'amqp://user:pass%word@rabbitmq.railway.internal:5672/vhost',
          'amqp://user:pass%@rabbitmq.railway.internal:5672/vhost',
          'amqp://user:pass%1@rabbitmq.railway.internal:5672/vhost',
          'amqp://user:pass%zz@rabbitmq.railway.internal:5672/vhost',
        ];

        for (const url of malformedUrls) {
          expect(() => rabbitmq.normalizeUrl(url)).not.toThrow();
        }

        expect(rabbitmq.normalizeUrl('amqp://user:pass%word@rabbitmq.railway.internal:5672/vhost')).toBe(
          'amqp://user:pass%25word@rabbitmq.railway.internal:5672/vhost'
        );
        expect(rabbitmq.normalizeUrl('amqp://user:pass%@rabbitmq.railway.internal:5672/vhost')).toBe(
          'amqp://user:pass%25@rabbitmq.railway.internal:5672/vhost'
        );
        expect(rabbitmq.normalizeUrl('amqp://user:pass%1@rabbitmq.railway.internal:5672/vhost')).toBe(
          'amqp://user:pass%251@rabbitmq.railway.internal:5672/vhost'
        );
        expect(rabbitmq.normalizeUrl('amqp://user:pass%zz@rabbitmq.railway.internal:5672/vhost')).toBe(
          'amqp://user:pass%25zz@rabbitmq.railway.internal:5672/vhost'
        );
      });

      it('should preserve valid percent-encoded characters while safely escaping malformed percent sequences in the same string', () => {
        // %40 is a valid escape (@), %word is malformed
        const mixedUrl = 'amqp://user:p%40ss%word@rabbitmq.railway.internal:5672/vhost';
        const normalized = rabbitmq.normalizeUrl(mixedUrl);

        expect(normalized).toBe('amqp://user:p%40ss%25word@rabbitmq.railway.internal:5672/vhost');
        expect(rabbitmq.normalizeUrl(normalized)).toBe(normalized);
      });
    });

    describe('Password Masking for Safe Logging', () => {
      it('should mask passwords containing special characters without leaking any characters', () => {
        const rawUrl = 'amqp://admin:secr@t#p@ss%123!&/@rabbitmq.railway.internal:5672/vhost';
        const masked = rabbitmq.maskUrl(rawUrl);

        expect(masked).toBe('amqp://admin:***@rabbitmq.railway.internal:5672/vhost');
        expect(masked).not.toContain('secr');
        expect(masked).not.toContain('p@ss');
        expect(masked).not.toContain('123');
      });

      it('should handle URLs with username only without leaking or crashing', () => {
        const rawUrl = 'amqp://user-without-pass@rabbitmq.railway.internal:5672/vhost';
        const masked = rabbitmq.maskUrl(rawUrl);

        expect(masked).toBe('amqp://***@rabbitmq.railway.internal:5672/vhost');
      });

      it('should handle URLs without credentials cleanly', () => {
        const rawUrl = 'amqp://localhost:5672';
        expect(rabbitmq.normalizeUrl(rawUrl)).toBe('amqp://localhost:5672');
        expect(rabbitmq.maskUrl(rawUrl)).toBe('amqp://localhost:5672');
      });
    });
  });
});

