import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().default('*'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().default('stockflow.events'),
  RABBITMQ_DLX: z.string().default('stockflow.dlx'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CACHE_TTL: z.coerce.number().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment variable validation failed');
}

export const env = parsed.data;

