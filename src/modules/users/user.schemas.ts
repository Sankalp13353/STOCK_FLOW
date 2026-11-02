import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().trim().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user UUID format'),
});

export const userWarehouseParamsSchema = z.object({
  id: z.string().uuid('Invalid user UUID format'),
  warehouseId: z.string().uuid('Invalid warehouse UUID format'),
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: 'Invalid user role' }),
  }),
});

export const assignWarehouseSchema = z.object({
  warehouseId: z.string().uuid('Invalid warehouse UUID format'),
  role: z.nativeEnum(UserRole).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type AssignWarehouseInput = z.infer<typeof assignWarehouseSchema>;

