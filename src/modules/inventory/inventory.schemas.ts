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

export type AddStockInput = z.infer<typeof addStockSchema>;
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

