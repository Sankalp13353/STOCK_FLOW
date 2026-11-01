process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://sankalp@127.0.0.1:5432/stockflow_test_db?schema=public';
process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';

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

