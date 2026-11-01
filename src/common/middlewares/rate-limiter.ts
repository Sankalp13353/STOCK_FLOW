import { Request, Response, NextFunction } from 'express';
import { redis } from '../../infra/redis/redis.client';
import { env } from '../../config/env';
import { sendError } from '../utils/response';
import { HTTP_STATUS } from '../../config/constants';

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  action?: string;
}

/**
 * Distributed rate limiter middleware using Redis.
 * Protects sensitive endpoints (login, register) from brute-force and credential-stuffing attacks.
 *
 * Resilience Strategy (Fail-Open):
 * If Redis is temporarily unreachable or fails during execution, the middleware logs a warning
 * and allows the request through (fail-open) so legitimate users are not locked out.
 */
export function rateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? env.RATE_LIMIT_MAX_REQUESTS;
  const action = options.action ?? 'generic';
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // If Redis is disconnected, fail open safely
    if (!redis.isConnected()) {
      return next();
    }

    const client = redis.getClient();
    if (!client) {
      return next();
    }

    // Determine client identifier (IP address)
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const key = `ratelimit:auth:${action}:${clientIp}`;

    try {
      // Execute atomic INCR and TTL lookup via pipeline
      const pipeline = client.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);
      const results = await pipeline.exec();

      if (!results || results[0][0] !== null) {
        // Redis pipeline error, fail open
        return next();
      }

      const currentCount = results[0][1] as number;
      let ttl = results[1][1] as number;

      // If new key without TTL, set expiration
      if (ttl === -1 || currentCount === 1) {
        await client.expire(key, windowSeconds);
        ttl = windowSeconds;
      }

      const remaining = Math.max(0, maxRequests - currentCount);
      const resetTimeSeconds = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds);

      // Set standard RFC rate-limiting response headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds);

      // Check if threshold exceeded
      if (currentCount > maxRequests) {
        const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
        res.setHeader('Retry-After', retryAfterSeconds);

        sendError(
          res,
          HTTP_STATUS.TOO_MANY_REQUESTS,
          'TOO_MANY_REQUESTS',
          `Too many ${action} attempts from this IP. Please try again after ${retryAfterSeconds} seconds.`,
          {
            limit: maxRequests,
            windowMs,
            retryAfterSeconds,
          }
        );
        return;
      }

      next();
    } catch (err: any) {
      // Fail-open fallback: log warning and proceed
      if (env.NODE_ENV !== 'test') {
        console.warn(`[RateLimiter] Error evaluating rate limit for ${clientIp} (${err.message}). Failing open.`);
      }
      next();
    }
  };
}

