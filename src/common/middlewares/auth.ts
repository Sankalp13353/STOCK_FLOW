import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error';
import { AuthenticatedRequest, AuthenticatedUserPayload } from '../types';

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed authorization token', 'AUTH_TOKEN_MISSING');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUserPayload;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Authentication token has expired', 'AUTH_TOKEN_EXPIRED');
    }
    throw new UnauthorizedError('Invalid authentication token', 'AUTH_TOKEN_INVALID');
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('User authentication required before authorization', 'AUTH_REQUIRED');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access denied. Role '${req.user.role}' is not authorized to access this resource.`,
        'FORBIDDEN'
      );
    }

    next();
  };
}
