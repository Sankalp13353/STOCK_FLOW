import amqp, { Channel, ChannelModel, ConfirmChannel } from 'amqplib';
import { env } from '../../config/env';
import { BROKER_TOPICS } from '../../config/constants';

export class RabbitMQClient {
  private static instance: RabbitMQClient;
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private confirmChannel: ConfirmChannel | null = null;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelayMs: number = 2000;
  private readonly maxReconnectDelayMs: number = 30000;

  private constructor() {}

  public static getInstance(): RabbitMQClient {
    if (!RabbitMQClient.instance) {
      RabbitMQClient.instance = new RabbitMQClient();
    }
    return RabbitMQClient.instance;
  }

  /**
   * Establishes connection to RabbitMQ with automatic topology setup.
   */
  public async connect(): Promise<void> {
    if (this.connection && this.channel && this.confirmChannel) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      const targetUrl = this.normalizeUrl(env.RABBITMQ_URL);
      console.log(`[RabbitMQ] Connecting to broker at ${this.maskUrl(targetUrl)}...`);
      this.connection = await amqp.connect(targetUrl);

      this.connection.on('error', (err) => {
        console.error('[RabbitMQ] Connection error encountered:', err.message);
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        console.warn('[RabbitMQ] Connection closed.');
        this.handleDisconnect();
      });

      // Create regular channel and confirm channel
      this.channel = await this.connection.createChannel();
      this.confirmChannel = await this.connection.createConfirmChannel();

      // Configure Topology (Exchanges, Queues, Dead Letter bindings)
      await this.setupTopology();

      // Reset reconnect delay on successful connection
      this.reconnectDelayMs = 2000;
      this.isConnecting = false;
      console.log('✅ [RabbitMQ] Successfully connected and topology verified.');
    } catch (error: any) {
      this.isConnecting = false;
      console.error(`❌ [RabbitMQ] Connection failed: ${error.message}`);
      this.handleDisconnect();
      throw error;
    }
  }

  /**
   * Initializes durable exchanges, queues, and dead-letter configurations.
   */
  public async setupTopology(): Promise<void> {
    if (!this.channel) {
      throw new Error('[RabbitMQ] Cannot setup topology: channel not established');
    }

    const ch = this.channel;

    // 1. Assert Dead-Letter Exchange (DLX)
    await ch.assertExchange(BROKER_TOPICS.DLX, 'direct', { durable: true });

    // 2. Assert and bind Dead-Letter Queues (DLQ)
    await ch.assertQueue(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ, { durable: true });
    await ch.bindQueue(
      BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ,
      BROKER_TOPICS.DLX,
      BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ
    );

    await ch.assertQueue(BROKER_TOPICS.QUEUES.INVENTORY_EVENTS_DLQ, { durable: true });
    await ch.bindQueue(
      BROKER_TOPICS.QUEUES.INVENTORY_EVENTS_DLQ,
      BROKER_TOPICS.DLX,
      BROKER_TOPICS.QUEUES.INVENTORY_EVENTS_DLQ
    );

    // 3. Assert Primary Topic Exchange
    await ch.assertExchange(BROKER_TOPICS.EXCHANGE, 'topic', { durable: true });

    // 4. Assert and bind Primary Queues with Dead-Letter parameters
    await ch.assertQueue(BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS, {
      durable: true,
      deadLetterExchange: BROKER_TOPICS.DLX,
      deadLetterRoutingKey: BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS_DLQ,
    });
    await ch.bindQueue(
      BROKER_TOPICS.QUEUES.ORDER_NOTIFICATIONS,
      BROKER_TOPICS.EXCHANGE,
      BROKER_TOPICS.ROUTING_KEYS.ALL_ORDER_EVENTS
    );

    await ch.assertQueue(BROKER_TOPICS.QUEUES.INVENTORY_EVENTS, {
      durable: true,
      deadLetterExchange: BROKER_TOPICS.DLX,
      deadLetterRoutingKey: BROKER_TOPICS.QUEUES.INVENTORY_EVENTS_DLQ,
    });
    await ch.bindQueue(
      BROKER_TOPICS.QUEUES.INVENTORY_EVENTS,
      BROKER_TOPICS.EXCHANGE,
      BROKER_TOPICS.ROUTING_KEYS.INVENTORY_RELEVANT_EVENTS
    );

    console.log('[RabbitMQ] Topology setup completed: Exchanges, Queues, and DLQs asserted.');
  }

  /**
   * Publishes an event using Publisher Confirms to ensure the broker has persisted the message.
   */
  public async publishWithConfirmation(
    exchange: string,
    routingKey: string,
    content: any,
    headers: Record<string, any> = {}
  ): Promise<boolean> {
    if (!this.confirmChannel) {
      throw new Error('[RabbitMQ] Cannot publish: Confirm channel is not available');
    }

    const payloadBuffer = Buffer.from(JSON.stringify(content));

    return new Promise<boolean>((resolve, reject) => {
      this.confirmChannel!.publish(
        exchange,
        routingKey,
        payloadBuffer,
        {
          persistent: true, // DeliveryMode: 2 (message written to disk)
          contentType: 'application/json',
          timestamp: Date.now(),
          headers,
        },
        (err) => {
          if (err) {
            console.error(`[RabbitMQ] Publish NACK / error for key '${routingKey}':`, err);
            return reject(err);
          }
          resolve(true);
        }
      );
    });
  }

  public getChannel(): Channel {
    if (!this.channel) {
      throw new Error('[RabbitMQ] Channel is not available');
    }
    return this.channel;
  }

  public getConfirmChannel(): ConfirmChannel {
    if (!this.confirmChannel) {
      throw new Error('[RabbitMQ] Confirm channel is not available');
    }
    return this.confirmChannel;
  }

  public isConnected(): boolean {
    return this.connection !== null && this.channel !== null && this.confirmChannel !== null;
  }

  /**
   * Handles unexpected disconnections and schedules exponential backoff reconnection.
   */
  private handleDisconnect(): void {
    this.connection = null;
    this.channel = null;
    this.confirmChannel = null;

    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectTimeout) {
      return;
    }

    console.warn(`[RabbitMQ] Scheduling reconnect in ${this.reconnectDelayMs}ms...`);
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch {
        // Double delay up to max cap
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
      }
    }, this.reconnectDelayMs);
  }

  /**
   * Gracefully shuts down connection and channels.
   */
  public async close(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.confirmChannel) {
        await this.confirmChannel.close();
        this.confirmChannel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('[RabbitMQ] Connection and channels gracefully closed.');
    } catch (err: any) {
      console.error('[RabbitMQ] Error while closing connection:', err.message);
    }
  }

  /**
   * Safely normalizes the RabbitMQ URL to ensure credentials containing
   * special characters (such as '@', ':', '#', '%', '!', '&', '/', etc.) are properly
   * percent-encoded for amqplib / WHATWG URI parsing, avoiding double-encoding
   * and preventing URIError on malformed percent sequences.
   */
  public normalizeUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl;

    const atIndex = rawUrl.lastIndexOf('@');
    const schemeIndex = rawUrl.indexOf('://');

    if (schemeIndex === -1 || atIndex === -1 || atIndex < schemeIndex) {
      return rawUrl;
    }

    const protocol = rawUrl.substring(0, schemeIndex + 3);
    const userInfo = rawUrl.substring(schemeIndex + 3, atIndex);
    const hostAndRest = rawUrl.substring(atIndex + 1);

    const colonIndex = userInfo.indexOf(':');
    if (colonIndex === -1) {
      const encodedUser = this.normalizeCredentialComponent(userInfo);
      return `${protocol}${encodedUser}@${hostAndRest}`;
    }

    const rawUser = userInfo.substring(0, colonIndex);
    const rawPass = userInfo.substring(colonIndex + 1);

    const encodedUser = this.normalizeCredentialComponent(rawUser);
    const encodedPass = this.normalizeCredentialComponent(rawPass);

    return `${protocol}${encodedUser}:${encodedPass}@${hostAndRest}`;
  }

  /**
   * Normalizes a single credential component (username or password).
   * - Preserves valid percent-encoding sequences (%[0-9a-fA-F]{2}) to avoid double-encoding.
   * - Safely encodes raw special characters (including @, :, #, %, !, &, /).
   * - Protects against URIError from malformed percent sequences by treating
   *   any % not followed by two hex digits as a literal % to be encoded as %25.
   */
  private normalizeCredentialComponent(component: string): string {
    return component.replace(/(%[0-9a-fA-F]{2})|([^a-zA-Z0-9_.~-])/g, (_match, validEscape, otherChar) => {
      if (validEscape) {
        return validEscape;
      }
      return encodeURIComponent(otherChar);
    });
  }

  /**
   * Safely masks the password in a RabbitMQ URL for diagnostic logging.
   * Never leaks any characters of the password, even if it contains '@', '#', or ':'.
   */
  public maskUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl;

    const atIndex = rawUrl.lastIndexOf('@');
    const schemeIndex = rawUrl.indexOf('://');

    if (schemeIndex === -1 || atIndex === -1 || atIndex < schemeIndex) {
      return rawUrl;
    }

    const protocol = rawUrl.substring(0, schemeIndex + 3);
    const userInfo = rawUrl.substring(schemeIndex + 3, atIndex);
    const hostAndRest = rawUrl.substring(atIndex + 1);

    const colonIndex = userInfo.indexOf(':');
    if (colonIndex === -1) {
      return `${protocol}***@${hostAndRest}`;
    }

    const rawUser = userInfo.substring(0, colonIndex);
    return `${protocol}${rawUser}:***@${hostAndRest}`;
  }
}

export const rabbitmq = RabbitMQClient.getInstance();
