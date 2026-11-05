import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const createOrderItemSchema = z.object({
  productId: z.string().uuid('Invalid Product UUID format'),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than zero'),
});

export const createOrderSchema = z.object({
  shippingAddress: z
    .string()
    .trim()
    .min(5, 'Shipping address must be at least 5 characters long')
    .max(500, 'Shipping address must not exceed 500 characters'),
  items: z
    .array(createOrderItemSchema)
    .min(1, 'Order must contain at least one item'),
  allowPartial: z.boolean().optional(),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.nativeEnum(OrderStatus).optional(),
  search: z.string().trim().optional(),
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid('Invalid Order UUID format'),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const processOrderSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const dispatchOrderSchema = z.object({
  warehouseId: z.string().uuid('Invalid Warehouse UUID format').optional(),
  trackingNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const deliverOrderSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  deliveryNotes: z.string().trim().max(500).optional(),
  deliveredAt: z.string().optional(),
});

export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ProcessOrderInput = z.infer<typeof processOrderSchema>;
export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;
export type DeliverOrderInput = z.infer<typeof deliverOrderSchema>;

