import { apiClient } from './client';
import { ApiResponse, Order, CreateOrderInput, PaginatedOrdersResponse, OrderStatus } from '../types';

export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey?: string
): Promise<Order> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await apiClient.post<ApiResponse<Order>>('/orders', input, { headers });
  return response.data.data;
}

export async function fetchMyOrders(params?: {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}): Promise<PaginatedOrdersResponse> {
  const response = await apiClient.get<ApiResponse<Order[]>>('/orders/my-orders', { params });
  return {
    orders: response.data.data,
    pagination: response.data.meta.pagination ?? {
      page: 1,
      limit: response.data.data.length || 10,
      totalRecords: response.data.data.length,
      totalPages: 1,
    },
  };
}

export async function fetchOrderById(id: string): Promise<Order> {
  const response = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`);
  return response.data.data;
}

export async function cancelOrder(
  id: string,
  reason?: string
): Promise<{ orderId: string; status: OrderStatus; message: string }> {
  const response = await apiClient.post<ApiResponse<{ orderId: string; status: OrderStatus; message: string }>>(
    `/orders/${id}/cancel`,
    { reason }
  );
  return response.data.data;
}

