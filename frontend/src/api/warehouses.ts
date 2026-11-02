import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  Warehouse,
  CreateWarehouseInput,
  ListWarehousesQuery,
  WarehouseInventoryItem,
} from '../types';

export async function fetchWarehouses(query: ListWarehousesQuery = {}): Promise<Warehouse[]> {
  const params: Record<string, boolean> = {};
  if (typeof query.isActive === 'boolean') {
    params.isActive = query.isActive;
  }
  const response = await apiClient.get<ApiResponse<Warehouse[]>>('/warehouses', { params });
  return response.data.data;
}

export async function fetchWarehouseById(id: string): Promise<Warehouse> {
  const response = await apiClient.get<ApiResponse<Warehouse>>(`/warehouses/${id}`);
  return response.data.data;
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
  const payload = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    country: input.country.trim(),
    isActive: input.isActive ?? true,
  };
  const response = await apiClient.post<ApiResponse<Warehouse>>('/warehouses', payload);
  return response.data.data;
}

export async function fetchWarehouseInventory(
  warehouseId: string
): Promise<WarehouseInventoryItem[]> {
  const response = await apiClient.get<ApiResponse<WarehouseInventoryItem[]>>(
    `/inventory/warehouse/${warehouseId}`
  );
  return response.data.data;
}

