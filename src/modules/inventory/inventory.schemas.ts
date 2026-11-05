import { z } from 'zod';
import { MovementType, ReservationStatus } from '@prisma/client';

export const addStockSchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format'),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Stock addition quantity must be greater than zero'),
  referenceId: z.string().uuid('Invalid Reference UUID format').optional(),
  supplier: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const inventoryQuerySchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format').optional(),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  search: z.string().trim().optional(),
  lowStockOnly: z.enum(['true', 'false']).optional(),
});

export const movementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  productId: z.string().uuid('Invalid Product UUID format').optional(),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  movementType: z.nativeEnum(MovementType).optional(),
  referenceId: z.string().optional(),
  search: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export const reservationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  productId: z.string().uuid('Invalid Product UUID format').optional(),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  status: z.nativeEnum(ReservationStatus).optional(),
  orderId: z.string().uuid('Invalid Order UUID format').optional(),
  search: z.string().trim().optional(),
});

export const warehouseIdParamSchema = z.object({
  warehouseId: z.string().uuid('Invalid Warehouse UUID format'),
});

export const createThresholdSchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format'),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').nullable().optional(),
  minQuantity: z
    .number()
    .int('Minimum stock threshold must be an integer')
    .min(0, 'Minimum stock threshold cannot be negative'),
  reorderQuantity: z
    .number()
    .int('Reorder quantity must be an integer')
    .min(0, 'Reorder quantity cannot be negative')
    .optional()
    .default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateThresholdSchema = z.object({
  minQuantity: z
    .number()
    .int('Minimum stock threshold must be an integer')
    .min(0, 'Minimum stock threshold cannot be negative')
    .optional(),
  reorderQuantity: z
    .number()
    .int('Reorder quantity must be an integer')
    .min(0, 'Reorder quantity cannot be negative')
    .optional(),
  isActive: z.boolean().optional(),
});

export const thresholdQuerySchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format').optional(),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  isGlobal: z.enum(['true', 'false']).optional(),
});

export const thresholdIdParamSchema = z.object({
  id: z.string().uuid('Invalid Threshold UUID format'),
});

export type AddStockInput = z.infer<typeof addStockSchema>;
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;
export type ReservationsQuery = z.infer<typeof reservationsQuerySchema>;
export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type ThresholdQuery = z.infer<typeof thresholdQuerySchema>;

