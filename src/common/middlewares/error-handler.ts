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
      sendError(
        res,
        409,
        'FOREIGN_KEY_VIOLATION',
        'Operation violates referential integrity constraints. The record is either referenced by other entities or the referenced entity does not exist.'
      );
      return;
    }
    if (err.code === 'P2014') {
      sendError(
        res,
        409,
        'FOREIGN_KEY_VIOLATION',
        'The change you are trying to make would violate the required relation between records.'
      );
      return;
    }
  }

  // 4. PostgreSQL / Driver Connector Restrict & Foreign Key Violations (e.g. Postgres 23001, 23503)
  const errMsg = err.message || '';
  if (
    errMsg.includes('violates RESTRICT setting of foreign key constraint') ||
    errMsg.includes('violates foreign key constraint') ||
    errMsg.includes('code: "23001"') ||
    errMsg.includes('code: "23503"') ||
    errMsg.includes('code: 23001') ||
    errMsg.includes('code: 23503')
  ) {
    sendError(
      res,
      409,
      'FOREIGN_KEY_VIOLATION',
      'Cannot perform operation because this record is referenced by other database records (such as inventory, movements, or orders). Please deactivate or archive it instead.'
    );
    return;
  }

  // 5. Malformed JSON Body
  if (err instanceof SyntaxError && 'body' in err) {
    sendError(res, 400, 'INVALID_JSON', 'Malformed JSON in request body');
    return;
  }

  // 6. Fallback Internal Server Error
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

