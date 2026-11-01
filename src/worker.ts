import { env } from './config/env';
import { prisma } from './database/prisma';
import { rabbitmq } from './infra/rabbitmq/rabbitmq.client';
import { redis } from './infra/redis/redis.client';
import { outboxPublisherWorker } from './modules/outbox/outbox-publisher.worker';
import { notificationWorker } from './workers/notification.worker';
import { inventoryWorker } from './workers/inventory.worker';
import { reservationService } from './modules/reservations/reservation.service';

/**
 * StockFlow Background Worker Process Entrypoint
 * Dedicated solely to background processing:
 * 1. Transactional Outbox Publisher
 * 2. RabbitMQ Event Consumers (Notifications & Inventory)
 * 3. Expired Inventory Reservation Sweeper
 *
 * Does NOT start an HTTP server.
 */
console.log(`⚙️  Starting StockFlow Background Worker Process in ${env.NODE_ENV} mode...`);

let sweeperInterval: NodeJS.Timeout | null = null;

async function bootstrapWorker(): Promise<void> {
  try {
    // 1. Verify PostgreSQL connection
    await prisma.$connect();
    console.log('✅ [Worker] PostgreSQL connection verified.');

    // 2. Connect to Redis
    try {
      await redis.connect();
    } catch (err: any) {
      console.warn(`⚠️ [Worker] Redis not immediately reachable (${err.message}).`);
    }

    // 3. Connect to RabbitMQ broker and initialize topology with startup retry
    let connected = false;
    let attempts = 0;
    const maxAttempts = 10;
    while (!connected && attempts < maxAttempts) {
      try {
        attempts++;
        await rabbitmq.connect();
        connected = true;
        console.log('✅ [Worker] RabbitMQ connected and topology asserted.');
      } catch (err: any) {
        if (attempts >= maxAttempts) {
          throw err;
        }
        console.warn(`⏳ [Worker] RabbitMQ not ready yet (attempt ${attempts}/${maxAttempts}). Retrying in 3s...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // 4. Start Outbox Publisher Worker
    outboxPublisherWorker.start();
    console.log('⚡ [Worker] Outbox Publisher Worker started.');

    // 5. Start Consumers
    await notificationWorker.start();
    await inventoryWorker.start();
    console.log('⚡ [Worker] Notification & Inventory Consumers active.');

    // 6. Start Reservation Expiry Sweeper (runs every 60 seconds)
    const SWEEPER_INTERVAL_MS = 60 * 1000;
    sweeperInterval = setInterval(async () => {
      try {
        const sweepResult = await reservationService.expireStaleReservations();
        if (sweepResult.expiredOrdersCount > 0) {
          console.log(`🧹 [Sweeper] Automatically swept ${sweepResult.expiredOrdersCount} expired order reservation(s).`);
        }
      } catch (err: any) {
        console.error('❌ [Sweeper] Error sweeping expired reservations:', err.message);
      }
    }, SWEEPER_INTERVAL_MS);

    console.log('⚡ [Worker] Periodic Reservation Sweeper scheduled.');
    console.log('🚀 StockFlow Background Worker is fully operational.');
  } catch (err: any) {
    console.error('❌ [Worker] Fatal error during worker startup:', err);
    process.exit(1);
  }
}

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown of Background Worker...`);

  // Stop sweeper
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
  }

  // Stop outbox publisher
  outboxPublisherWorker.stop();

  // Stop consumers
  try {
    await notificationWorker.stop();
    await inventoryWorker.stop();
    console.log('[Worker] Consumers stopped.');
  } catch (err) {
    console.warn('[Worker] Error stopping consumers:', err);
  }

  // Close broker, redis, and database
  try {
    await rabbitmq.close();
    await redis.disconnect();
    await prisma.$disconnect();
    console.log('[Worker] All connections cleanly closed. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown cleanup:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

bootstrapWorker();

