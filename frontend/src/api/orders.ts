import { apiClient } from './client';
import {
  ApiResponse,
  Order,
  CreateOrderInput,
  PaginatedOrdersResponse,
  OrderStatus,
  ListOrdersQueryParams,
  ProcessOrderInput,
  DispatchOrderInput,
  DeliverOrderInput,
  FulfilmentActionResult,
} from '../types';

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

export async function fetchOrders(
  params?: ListOrdersQueryParams
): Promise<PaginatedOrdersResponse> {
  const queryParams: Record<string, any> = {};

  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.status && params.status !== 'ALL') queryParams.status = params.status;
  if (params?.search && params.search.trim()) queryParams.search = params.search.trim();
  if (params?.warehouseId) queryParams.warehouseId = params.warehouseId;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;

  const response = await apiClient.get<ApiResponse<Order[]>>('/orders', { params: queryParams });
  return {
    orders: response.data.data,
    pagination: response.data.meta.pagination ?? {
      page: 1,
      limit: response.data.data.length || 20,
      totalRecords: response.data.data.length,
      totalPages: 1,
    },
  };
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

export async function processOrder(
  id: string,
  input?: ProcessOrderInput
): Promise<FulfilmentActionResult> {
  const response = await apiClient.post<ApiResponse<FulfilmentActionResult>>(
    `/orders/${id}/process`,
    input ?? {}
  );
  return response.data.data;
}

export async function dispatchOrder(
  id: string,
  input?: DispatchOrderInput
): Promise<FulfilmentActionResult> {
  const response = await apiClient.post<ApiResponse<FulfilmentActionResult>>(
    `/orders/${id}/dispatch`,
    input ?? {}
  );
  return response.data.data;
}

export async function deliverOrder(
  id: string,
  input?: DeliverOrderInput
): Promise<FulfilmentActionResult> {
  const response = await apiClient.post<ApiResponse<FulfilmentActionResult>>(
    `/orders/${id}/deliver`,
    input ?? {}
  );
  return response.data.data;
}
