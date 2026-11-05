import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  WarehouseInventoryItem,
  RestockInput,
  RestockResult,
  ExpireReservationsResult,
  MinimumStockThresholdItem,
  CreateThresholdPayload,
  UpdateThresholdPayload,
  LowStockEvaluationItem,
  MovementsQueryParams,
  PaginatedMovementsResponse,
  ReservationsQueryParams,
  PaginatedReservationsResponse,
  InventoryMetricsSummary,
} from '../types/inventory';

export async function fetchWarehouseInventory(
  warehouseId: string
): Promise<WarehouseInventoryItem[]> {
  const response = await apiClient.get<ApiResponse<WarehouseInventoryItem[]>>(
    `/inventory/warehouse/${warehouseId}`
  );
  return response.data.data;
}

export async function fetchInventory(query?: {
  warehouseId?: string;
  productId?: string;
  search?: string;
  lowStockOnly?: string;
}): Promise<WarehouseInventoryItem[]> {
  const response = await apiClient.get<ApiResponse<WarehouseInventoryItem[]>>('/inventory', {
    params: query,
  });
  return response.data.data;
}

export async function fetchInventoryMetrics(
  warehouseId?: string
): Promise<InventoryMetricsSummary> {
  const response = await apiClient.get<ApiResponse<InventoryMetricsSummary>>('/inventory/metrics', {
    params: warehouseId ? { warehouseId } : undefined,
  });
  return response.data.data;
}

export async function fetchInventoryMovements(
  params?: MovementsQueryParams
): Promise<PaginatedMovementsResponse> {
  const response = await apiClient.get<ApiResponse<PaginatedMovementsResponse>>(
    '/inventory/movements',
    { params }
  );
  return response.data.data;
}

export async function fetchInventoryReservations(
  params?: ReservationsQueryParams
): Promise<PaginatedReservationsResponse> {
  const response = await apiClient.get<ApiResponse<PaginatedReservationsResponse>>(
    '/inventory/reservations',
    { params }
  );
  return response.data.data;
}

export async function restockInventory(input: RestockInput): Promise<RestockResult> {
  const response = await apiClient.post<ApiResponse<RestockResult>>('/inventory/restock', {
    productId: input.productId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
    supplier: input.supplier?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  });
  return response.data.data;
}

export async function expireReservations(): Promise<ExpireReservationsResult> {
  const response = await apiClient.post<ApiResponse<ExpireReservationsResult>>(
    '/inventory/expire-reservations'
  );
  return response.data.data;
}

export async function fetchThresholds(query?: {
  warehouseId?: string;
  productId?: string;
  isGlobal?: string;
}): Promise<MinimumStockThresholdItem[]> {
  const response = await apiClient.get<ApiResponse<MinimumStockThresholdItem[]>>(
    '/inventory/thresholds',
    { params: query }
  );
  return response.data.data ?? [];
}

export async function createThreshold(
  payload: CreateThresholdPayload
): Promise<MinimumStockThresholdItem> {
  const response = await apiClient.post<ApiResponse<MinimumStockThresholdItem>>(
    '/inventory/thresholds',
    payload
  );
  return response.data.data;
}

export async function updateThreshold(
  id: string,
  payload: UpdateThresholdPayload
): Promise<MinimumStockThresholdItem> {
  const response = await apiClient.put<ApiResponse<MinimumStockThresholdItem>>(
    `/inventory/thresholds/${id}`,
    payload
  );
  return response.data.data;
}

export async function deleteThreshold(
  id: string
): Promise<{ message: string; deletedId: string }> {
  const response = await apiClient.delete<ApiResponse<{ message: string; deletedId: string }>>(
    `/inventory/thresholds/${id}`
  );
  return response.data.data;
}

export async function fetchLowStockEvaluations(
  warehouseId?: string
): Promise<LowStockEvaluationItem[]> {
  const response = await apiClient.get<ApiResponse<LowStockEvaluationItem[]>>(
    '/inventory/low-stock',
    { params: warehouseId ? { warehouseId } : undefined }
  );
  return response.data.data ?? [];
}
