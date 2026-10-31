import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().trim().min(2, 'SKU must be at least 2 characters').max(100),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  description: z.string().trim().max(2000).optional(),
  priceCents: z.number().int().nonnegative('Price must be a non-negative integer in cents'),
  isActive: z.boolean().optional().default(true),
});

export const updateProductSchema = z
  .object({
    sku: z.string().trim().min(2).max(100).optional(),
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    priceCents: z.number().int().nonnegative('Price must be a non-negative integer in cents').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('Invalid Product UUID format'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

