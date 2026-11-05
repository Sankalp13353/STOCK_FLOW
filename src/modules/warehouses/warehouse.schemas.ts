import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createWarehouseSchema = z.object({
  code: z.string().trim().min(2, 'Warehouse code must be at least 2 characters').max(50),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150),
  address: z.string().trim().min(5, 'Address must be at least 5 characters').max(255),
  city: z.string().trim().min(2, 'City must be at least 2 characters').max(100),
  country: z.string().trim().min(2, 'Country must be at least 2 characters').max(100),
  isActive: z.boolean().optional().default(true),
});

export const warehouseIdParamSchema = z.object({
  id: z.string().uuid('Invalid Warehouse UUID format'),
});

export const listWarehousesQuerySchema = z.object({
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export const assignUserToWarehouseSchema = z.object({
  userId: z.string().uuid('Invalid User UUID format'),
  role: z.nativeEnum(UserRole).optional(),
});

export const warehouseUserParamSchema = z.object({
  id: z.string().uuid('Invalid Warehouse UUID format'),
  userId: z.string().uuid('Invalid User UUID format'),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type ListWarehousesQuery = z.infer<typeof listWarehousesQuerySchema>;
export type AssignUserToWarehouseInput = z.infer<typeof assignUserToWarehouseSchema>;
