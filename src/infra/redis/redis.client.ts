import Redis, { RedisOptions } from 'ioredis';
import { env } from '../../config/env';

export class RedisClient {
  private client: Redis | null = null;
  private isReady: boolean = false;
  private reconnecting: boolean = false;

  constructor() {
    // Lazy client initialization upon connect() call
  }

  public getClient(): Redis | null {
    return this.client;
  }

  public isConnected(): boolean {
    return this.isReady && this.client !== null && this.client.status === 'ready';
  }

  /**
   * Initializes Redis connection with robust retry and error handling.
   */
  public async connect(): Promise<void> {
    if (this.client && this.isReady) {
      return;
    }

    const options: RedisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 1, // Fail fast on commands when disconnected so HTTP requests don't hang
      enableOfflineQueue: false, // Don't buffer commands indefinitely if offline
      retryStrategy: (times: number) => {
        // Exponential backoff capped at 3000ms
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
    };

    try {
      this.client = new Redis(env.REDIS_URL, options);

      this.client.on('connect', () => {
        if (env.NODE_ENV !== 'test') {
          console.log('[Redis] Connecting to instance at', env.REDIS_URL.replace(/:[^:@]+@/, ':***@'));
        }
      });

      this.client.on('ready', () => {
        this.isReady = true;
        this.reconnecting = false;
        if (env.NODE_ENV !== 'test') {
          console.log('✅ [Redis] Connection established and ready to accept commands.');
        }
      });

      this.client.on('error', (err: any) => {
        this.isReady = false;
        // Suppress noisy error logging during tests or expected disconnects
        if (env.NODE_ENV !== 'test' && !this.reconnecting) {
          console.warn(`⚠️ [Redis] Connection warning: ${err.message}`);
        }
      });

      this.client.on('close', () => {
        this.isReady = false;
      });

      this.client.on('reconnecting', () => {
        this.reconnecting = true;
      });

      await this.client.connect();
    } catch (error: any) {
      this.isReady = false;
      if (env.NODE_ENV !== 'test') {
        console.warn(`⚠️ [Redis] Could not connect initially (${error.message}). App running in degraded mode.`);
      }
    }
  }

  /**
   * Safely retrieves and deserializes cached JSON data.
   * Returns null if key does not exist or Redis is unavailable (fail-open).
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected() || !this.client) {
      return null;
    }

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err: any) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`[Redis] GET failed for key '${key}': ${err.message}`);
      }
      return null;
    }
  }

  /**
   * Safely serializes and caches data with optional TTL (in seconds).
   * Fails silently if Redis is unavailable.
   */
  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected() || !this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (err: any) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`[Redis] SET failed for key '${key}': ${err.message}`);
      }
    }
  }

  /**
   * Safely deletes one or more cache keys.
   */
  public async del(...keys: string[]): Promise<void> {
    if (!this.isConnected() || !this.client || keys.length === 0) {
      return;
    }

    try {
      await this.client.del(...keys);
    } catch (err: any) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`[Redis] DEL failed for keys: ${err.message}`);
      }
    }
  }

  /**
   * Safely invalidates keys matching a pattern using non-blocking SCAN.
   * Never uses KEYS * to avoid blocking single-threaded Redis engine.
   */
  public async delByPattern(pattern: string): Promise<number> {
    if (!this.isConnected() || !this.client) {
      return 0;
    }

    let deletedCount = 0;
    try {
      let cursor = '0';
      do {
        // SCAN 100 keys per iteration
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');
    } catch (err: any) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`[Redis] delByPattern failed for pattern '${pattern}': ${err.message}`);
      }
    }

    return deletedCount;
  }

  /**
   * Graceful shutdown of Redis connection.
   */
  public async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      this.isReady = false;
      await this.client.quit();
    } catch (err) {
      this.client.disconnect();
    } finally {
      this.client = null;
    }
  }
}

export const redis = new RedisClient();

