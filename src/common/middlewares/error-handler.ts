import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';
import { sendError } from '../utils/response';
import { env } from '../../config/env';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Known AppError
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    sendError(res, 400, 'VALIDATION_ERROR', 'Input validation failed', details);
    return;
  }

  // 3. Prisma Known Request Error
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      sendError(res, 409, 'DUPLICATE_RESOURCE', `Unique constraint violated on ${target}`);
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 404, 'NOT_FOUND', 'Record to process does not exist');
      return;
    }
    if (err.code === 'P2003') {
      sendError(res, 400, 'FOREIGN_KEY_VIOLATION', 'Related record does not exist');
      return;
    }
  }

  // 4. Malformed JSON Body
  if (err instanceof SyntaxError && 'body' in err) {
    sendError(res, 400, 'INVALID_JSON', 'Malformed JSON in request body');
    return;
  }

  // 5. Fallback Internal Server Error
  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled Server Error:', err);
  }

  sendError(
    res,
    500,
    'INTERNAL_SERVER_ERROR',
    'An unexpected internal server error occurred',
    env.NODE_ENV === 'development' ? { stack: err.stack } : undefined
  );
}

