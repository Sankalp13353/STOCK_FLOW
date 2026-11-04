import { apiClient } from './client';
import { ApiResponse } from '../types';
import { Ticket, TicketPriority, TicketStatus, TicketType } from '../types/ticket';

export interface FetchTicketsParams {
  type?: TicketType;
  status?: TicketStatus;
  priority?: TicketPriority;
  warehouseId?: string;
  orderId?: string;
  productId?: string;
  page?: number;
  limit?: number;
}

export async function fetchTickets(params?: FetchTicketsParams): Promise<{
  tickets: Ticket[];
  pagination?: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}> {
  const response = await apiClient.get<ApiResponse<Ticket[]>>('/tickets', {
    params,
  });
  return {
    tickets: response.data.data,
    pagination: response.data.meta.pagination,
  };
}

export async function fetchTicketById(id: string): Promise<Ticket> {
  const response = await apiClient.get<ApiResponse<Ticket>>(`/tickets/${id}`);
  return response.data.data;
}

export async function assignTicket(
  ticketId: string,
  assignedToUserId: string
): Promise<Ticket> {
  const response = await apiClient.post<ApiResponse<Ticket>>(
    `/tickets/${ticketId}/assign`,
    { assignedToUserId }
  );
  return response.data.data;
}

export async function approveTicket(
  ticketId: string,
  notes?: string
): Promise<Ticket> {
  const response = await apiClient.post<ApiResponse<Ticket>>(
    `/tickets/${ticketId}/approve`,
    { notes }
  );
  return response.data.data;
}

export async function rejectTicket(
  ticketId: string,
  reason: string
): Promise<Ticket> {
  const response = await apiClient.post<ApiResponse<Ticket>>(
    `/tickets/${ticketId}/reject`,
    { reason }
  );
  return response.data.data;
}

export async function resolveTicket(
  ticketId: string,
  resolutionNotes: string
): Promise<Ticket> {
  const response = await apiClient.post<ApiResponse<Ticket>>(
    `/tickets/${ticketId}/resolve`,
    { resolutionNotes }
  );
  return response.data.data;
}

export async function submitCustomerDecision(
  ticketId: string,
  action: 'ACCEPT_PARTIAL' | 'REJECT_PARTIAL',
  notes?: string
): Promise<Ticket> {
  const response = await apiClient.post<ApiResponse<Ticket>>(
    `/tickets/${ticketId}/customer-decision`,
    { action, notes }
  );
  return response.data.data;
}

