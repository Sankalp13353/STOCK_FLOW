import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedUserPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUserPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    pagination?: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
    };
  };
}

