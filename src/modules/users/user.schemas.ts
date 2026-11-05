import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  role: z.nativeEnum(UserRole).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'DEACTIVATED']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user UUID format'),
});

export const userWarehouseParamsSchema = z.object({
  id: z.string().uuid('Invalid user UUID format'),
  warehouseId: z.string().uuid('Invalid warehouse UUID format'),
});

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: 'Invalid user role' }),
  }),
  warehouseIds: z.array(z.string().uuid('Invalid warehouse UUID format')).optional(),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100).optional(),
  email: z.string().email('Invalid email address format').max(255).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  warehouseIds: z.array(z.string().uuid('Invalid warehouse UUID format')).optional(),
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: 'Invalid user role' }),
  }),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const assignWarehouseSchema = z.object({
  warehouseId: z.string().uuid('Invalid warehouse UUID format'),
  role: z.nativeEnum(UserRole).optional(),
});

export const syncUserWarehousesSchema = z.object({
  warehouseIds: z.array(z.string().uuid('Invalid warehouse UUID format')),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type AssignWarehouseInput = z.infer<typeof assignWarehouseSchema>;
export type SyncUserWarehousesInput = z.infer<typeof syncUserWarehousesSchema>;
