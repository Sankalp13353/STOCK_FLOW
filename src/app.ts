import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { APP_CONSTANTS } from './config/constants';
import { requestLogger } from './common/middlewares/request-logger';
import { errorHandler } from './common/middlewares/error-handler';
import { NotFoundError } from './common/errors/app-error';
import { sendSuccess } from './common/utils/response';
import { rootRouter } from './routes';

export function createApp(): Express {
  const app = express();

  // 1. Global Middlewares
  // Trust first proxy hop in production (Railway, AWS ALB, Cloudflare)
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = env.CORS_ORIGIN.includes(',')
    ? env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : env.CORS_ORIGIN;
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // 2. Health Check
  const healthHandler = (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: 'UP',
      service: 'stockflow-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
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

