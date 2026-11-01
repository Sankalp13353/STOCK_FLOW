import { app } from './app';
import { env } from './config/env';
import { prisma } from './database/prisma';
import { redis } from './infra/redis/redis.client';

/**
 * StockFlow API Server Entrypoint
 * Dedicated solely to serving HTTP API requests.
 * Does NOT run background workers or queue consumers.
 */
const server = app.listen(env.PORT, '0.0.0.0', async () => {
  console.log(`🚀 StockFlow API Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  console.log(`📡 Health check available at http://localhost:${env.PORT}/health`);
  console.log(`📡 API endpoints mounted at http://localhost:${env.PORT}/api/v1`);

  // Initialize Database & Redis connections
  try {
    await prisma.$connect();
    console.log('✅ [Database] PostgreSQL connection verified.');
  } catch (err: any) {
    console.error('❌ [Database] Failed to connect to PostgreSQL:', err.message);
  }

  try {
    await redis.connect();
  } catch (err: any) {
    console.warn(`⚠️ [Redis] Initial connection deferred (${err.message}). API operating in degraded mode.`);
  }
});

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown of API server...`);

  server.close(async () => {
    console.log('[API] HTTP server stopped accepting new requests.');
    try {
      await redis.disconnect();
      await prisma.$disconnect();
      console.log('[API] Redis and Database connections cleanly closed.');
      process.exit(0);
    } catch (err) {
      console.error('[API] Error during shutdown cleanup:', err);
      process.exit(1);
    }
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[API] Force shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { server };
