import { z } from 'zod';

export const TimeRangeEnum = z.enum(['today', '7d', '30d', '90d', 'custom']);
export type TimeRange = z.infer<typeof TimeRangeEnum>;

export const analyticsQuerySchema = z.object({
  warehouseId: z.string().uuid({ message: 'warehouseId must be a valid UUID' }).optional(),
  timeRange: TimeRangeEnum.default('7d'),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

