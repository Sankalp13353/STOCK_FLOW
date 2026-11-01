import request from 'supertest';
import { app } from '../src/app';
import { redis } from '../src/infra/redis/redis.client';
import { clearDatabase } from './setup';
import { env } from '../src/config/env';

describe('Redis-Backed Distributed Rate Limiting', () => {
  const testIp = '192.168.10.55';

  beforeAll(async () => {
    await redis.connect();
  });

  beforeEach(async () => {
    await clearDatabase();
    if (redis.isConnected()) {
      await redis.getClient()?.flushall();
    }
  });

  afterAll(async () => {
    if (redis.isConnected()) {
      await redis.getClient()?.flushall();
    }
  });

  describe('Login & Registration Protection', () => {
    it('should allow requests within the configured rate limit and return appropriate headers', async () => {
      // Send 3 requests (limit is env.RATE_LIMIT_MAX_REQUESTS, default 10)
      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({ email: 'nonexistent@test.com', password: 'WrongPassword123!' });

        // Endpoint returns 401 Unauthorized for bad credentials, NOT 429
        expect(res.status).toBe(401);
        expect(res.headers['x-ratelimit-limit']).toBe(String(env.RATE_LIMIT_MAX_REQUESTS));
        expect(Number(res.headers['x-ratelimit-remaining'])).toBe(env.RATE_LIMIT_MAX_REQUESTS - i);
        expect(res.headers['x-ratelimit-reset']).toBeDefined();
      }
    });

    it('should return HTTP 429 TOO_MANY_REQUESTS when limit is exceeded', async () => {
      const maxRequests = env.RATE_LIMIT_MAX_REQUESTS; // default 10

      // Exhaust all allowed requests
      for (let i = 0; i < maxRequests; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({ email: 'nonexistent@test.com', password: 'WrongPassword123!' });
      }

      // Next request MUST be rejected with HTTP 429
      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ email: 'nonexistent@test.com', password: 'WrongPassword123!' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(blockedRes.body.error.details.limit).toBe(maxRequests);
      expect(blockedRes.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(blockedRes.headers['retry-after']).toBeDefined();
    });

    it('should enforce independent rate limits for different client IPs (shared Redis keys)', async () => {
      const ip1 = '198.51.100.1';
      const ip2 = '198.51.100.2';
      const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;

      // Exhaust limit for IP 1
      for (let i = 0; i < maxRequests; i++) {
        await request(app)
          .post('/api/v1/auth/register')
          .set('X-Forwarded-For', ip1)
          .send({ email: `user${i}@test.com`, password: 'Password123!', fullName: 'User' });
      }

      // IP 1 is blocked
      const blockedRes = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', ip1)
        .send({ email: 'blocked@test.com', password: 'Password123!', fullName: 'Blocked' });
      expect(blockedRes.status).toBe(429);

      // IP 2 is completely unblocked and can register
      const allowedRes = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', ip2)
        .send({ email: 'freshuser@test.com', password: 'Password123!', fullName: 'Fresh User' });

      expect(allowedRes.status).toBe(201);
      expect(allowedRes.headers['x-ratelimit-remaining']).toBe(String(maxRequests - 1));
    });
  });

  describe('Redis Unavailable Resilience (Fail-Open)', () => {
    it('should fail-open and allow authentication requests without crashing if Redis is offline', async () => {
      // Disconnect Redis to simulate outage
      await redis.disconnect();
      expect(redis.isConnected()).toBe(false);

      // Request must proceed without throwing 500 or crashing
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'nonexistent@test.com', password: 'WrongPassword123!' });

      // Cleanly handled as normal authentication failure (401), not rate-limiter crash
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');

      // Reconnect Redis for subsequent suites
      await redis.connect();
      expect(redis.isConnected()).toBe(true);
    });
  });
});
