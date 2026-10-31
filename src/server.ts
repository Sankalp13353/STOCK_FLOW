import { app } from './app';
import { env } from './config/env';
import { prisma } from './database/prisma';

const server = app.listen(env.PORT, () => {
  console.log(`🚀 StockFlow Backend running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  console.log(`📡 Health check available at http://localhost:${env.PORT}/health`);
  console.log(`📡 API endpoints mounted at http://localhost:${env.PORT}/api/v1`);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('Database connection pool released.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnection:', err);
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

