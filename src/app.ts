import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { APP_CONSTANTS } from './config/constants';
import { requestLogger } from './common/middlewares/request-logger';
import { errorHandler } from './common/middlewares/error-handler';
import { NotFoundError } from './common/errors/app-error';
import { sendSuccess } from './common/utils/response';
import { rootRouter } from './routes';
import { checkDatabaseConnection } from './database/prisma';

export function createApp(): Express {
  const app = express();

  // 1. Global Middlewares
  // Disable X-Powered-By header to prevent fingerprinting
  app.disable('x-powered-by');

  // Trust first proxy hop in production (Railway, AWS ALB, Cloudflare, Render)
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = env.CORS_ORIGIN.includes(',')
    ? env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : env.CORS_ORIGIN;
  app.use(cors({ origin: allowedOrigins, credentials: true }));

  // Security Headers (Defense in depth: nosniff, anti-clickjacking frame guard, XSS protection, HSTS)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // 2. Health Check (actively validates database connection)
  const healthHandler = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dbCheck = await checkDatabaseConnection();
      const isHealthy = dbCheck.healthy;
      const status = isHealthy ? 'UP' : 'DEGRADED';
      const statusCode = isHealthy ? 200 : 503;

      if (!isHealthy && dbCheck.error) {
        console.error('❌ [HealthCheck] Database connectivity check failed:', dbCheck.error);
      }

      res.status(statusCode).json({
        success: isHealthy,
        data: {
          status,
          service: 'stockflow-backend',
          database: {
            status: isHealthy ? 'UP' : 'DOWN',
            ...(isHealthy && dbCheck.latencyMs !== undefined ? { latencyMs: dbCheck.latencyMs } : {}),
            ...(!isHealthy ? { message: 'Database connection unavailable' } : {}),
          },
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.floor(process.uptime()),
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  app.get('/health', healthHandler);
  app.get(`${APP_CONSTANTS.API_PREFIX}/health`, healthHandler);

  // 3. API Routes
  app.use(APP_CONSTANTS.API_PREFIX, rootRouter);

  // 4. Catch-all 404 handler for unknown routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // 5. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

