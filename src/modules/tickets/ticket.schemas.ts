import { z } from 'zod';
import { TicketType, TicketStatus, TicketPriority } from '@prisma/client';

export const listTicketsQuerySchema = z.object({
  type: z.nativeEnum(TicketType).optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  warehouseId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const ticketIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Ticket ID must be a valid UUID' }),
});

export const assignTicketSchema = z.object({
  assignedToUserId: z.string().uuid({ message: 'assignedToUserId must be a valid UUID' }),
});

export const approveTicketSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export const rejectTicketSchema = z.object({
  reason: z.string().min(3, { message: 'Rejection reason must be at least 3 characters' }).max(1000),
});

export const resolveTicketSchema = z.object({
  resolutionNotes: z.string().min(3, { message: 'Resolution notes must be at least 3 characters' }).max(1000),
});

export const customerDecisionSchema = z.object({
  action: z.enum(['ACCEPT_PARTIAL', 'REJECT_PARTIAL']),
  notes: z.string().max(1000).optional(),
});

