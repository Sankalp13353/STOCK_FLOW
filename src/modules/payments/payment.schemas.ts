import { z } from 'zod';

export const processPaymentSchema = z.object({
  orderId: z.string().uuid('Invalid Order UUID format'),
  amountCents: z
    .number()
    .int('Amount must be an integer in cents')
    .positive('Amount must be greater than zero'),
  paymentMethod: z.string().trim().min(2).default('MOCK_CARD'),
  simulateOutcome: z.enum(['SUCCESS', 'FAIL']).default('SUCCESS'),
});

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;

