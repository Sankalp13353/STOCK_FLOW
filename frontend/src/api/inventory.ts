import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  WarehouseInventoryItem,
  RestockInput,
  RestockResult,
  ExpireReservationsResult,
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
}): Promise<WarehouseInventoryItem[]> {
  const response = await apiClient.get<ApiResponse<WarehouseInventoryItem[]>>('/inventory', {
    params: query,
  });
  return response.data.data;
}

export async function restockInventory(input: RestockInput): Promise<RestockResult> {
  const response = await apiClient.post<ApiResponse<RestockResult>>('/inventory/restock', {
    productId: input.productId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
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

