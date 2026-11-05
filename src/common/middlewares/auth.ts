import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { AppError, ForbiddenError, UnauthorizedError } from '../errors/app-error';
import { AuthenticatedRequest, AuthenticatedUserPayload } from '../types';
import { prisma } from '../../database/prisma';

export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed authorization token', 'AUTH_TOKEN_MISSING'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUserPayload;

    // Verify user exists and account is actively permitted to access internal APIs
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user) {
      return next(new UnauthorizedError('User account not found', 'USER_NOT_FOUND'));
    }

    if (!user.isActive) {
      return next(
        new UnauthorizedError(
          'Your account has been deactivated. Please contact an administrator.',
          'ACCOUNT_DEACTIVATED'
        )
      );
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Authentication token has expired', 'AUTH_TOKEN_EXPIRED'));
    }
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new UnauthorizedError('Invalid authentication token', 'AUTH_TOKEN_INVALID'));
  }
}

export async function authenticateOptional(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUserPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (user && user.isActive) {
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
    }
    next();
  } catch {
    next();
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('User authentication required before authorization', 'AUTH_REQUIRED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Role '${req.user.role}' is not authorized to access this resource.`,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
