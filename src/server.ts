import { app } from './app';
import { env } from './config/env';
import { prisma } from './database/prisma';
import { rabbitmq } from './infra/rabbitmq/rabbitmq.client';
import { outboxPublisherWorker } from './modules/outbox/outbox-publisher.worker';
import { notificationWorker } from './workers/notification.worker';
import { inventoryWorker } from './workers/inventory.worker';

const server = app.listen(env.PORT, async () => {
  console.log(`🚀 StockFlow Backend running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  console.log(`📡 Health check available at http://localhost:${env.PORT}/health`);
  console.log(`📡 API endpoints mounted at http://localhost:${env.PORT}/api/v1`);

  // Start Event-Driven Subsystems
  try {
    await rabbitmq.connect();
    outboxPublisherWorker.start();
    await notificationWorker.start();
    await inventoryWorker.start();
    console.log('⚡ [Event-Driven] RabbitMQ connected and background workers operational.');
  } catch (err: any) {
    console.warn(
      `⚠️ [Event-Driven] RabbitMQ not reachable on startup (${err.message}). Workers will resume on broker availability.`
    );
  }
});

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);

  // Stop background workers
  outboxPublisherWorker.stop();
  await notificationWorker.stop();
  await inventoryWorker.stop();

  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await rabbitmq.close();
      await prisma.$disconnect();
      console.log('Database and message broker connections released.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown cleanup:', err);
      process.exit(1);
    }
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('Force shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { server };
