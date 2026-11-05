process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://sankalp@127.0.0.1:5432/stockflow_test_db?schema=public';
process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';

// Strict Safety Guard: Never permit connection to Neon or non-test databases during automated test runs
if (process.env.DATABASE_URL.includes('neon.tech')) {
  throw new Error('FATAL SAFETY VIOLATION: Automated tests attempted to connect to production Neon database! Aborting immediately.');
}
if (!process.env.DATABASE_URL.includes('stockflow_test_db')) {
  throw new Error(`FATAL SAFETY VIOLATION: Automated tests must run against isolated 'stockflow_test_db', received: ${process.env.DATABASE_URL}`);
}

import { prisma } from '../src/database/prisma';
import { redis } from '../src/infra/redis/redis.client';

export async function clearDatabase(): Promise<void> {
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma_%';
  `;

  for (const { tablename } of tablenames) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
    } catch (error) {
      console.error(`Failed to truncate ${tablename}`, error);
    }
  }
}

afterAll(async () => {
  await redis.disconnect();
  await prisma.$disconnect();
});

