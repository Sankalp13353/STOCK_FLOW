import { z } from 'zod';

export const addStockSchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format'),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Stock addition quantity must be greater than zero'),
  notes: z.string().trim().max(500).optional(),
});

export const inventoryQuerySchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format').optional(),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
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
export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type ThresholdQuery = z.infer<typeof thresholdQuerySchema>;

