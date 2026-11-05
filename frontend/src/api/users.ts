import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  UserItem,
  CreateUserPayload,
  UpdateUserPayload,
  UserListQueryParams,
  WarehouseTeamMembers,
  UserWarehouseAssignmentDetail,
} from '../types/users';

export async function fetchUsers(params?: UserListQueryParams): Promise<{
  users: UserItem[];
  pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
}> {
  const response = await apiClient.get<ApiResponse<UserItem[]>>('/users', { params });
  return {
    users: response.data.data || [],
    pagination: response.data.meta?.pagination || {
      page: 1,
      limit: 20,
      totalRecords: response.data.data?.length || 0,
      totalPages: 1,
    },
  };
}

export async function fetchUserById(id: string): Promise<UserItem> {
  const response = await apiClient.get<ApiResponse<UserItem>>(`/users/${id}`);
  return response.data.data;
}

export async function createUser(payload: CreateUserPayload): Promise<UserItem> {
  const response = await apiClient.post<ApiResponse<UserItem>>('/users', payload);
  return response.data.data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UserItem> {
  const response = await apiClient.patch<ApiResponse<UserItem>>(`/users/${id}`, payload);
  return response.data.data;
}

export async function updateUserRole(id: string, role: string): Promise<UserItem> {
  const response = await apiClient.patch<ApiResponse<UserItem>>(`/users/${id}/role`, { role });
  return response.data.data;
}

export async function updateUserStatus(id: string, isActive: boolean): Promise<UserItem> {
  const response = await apiClient.patch<ApiResponse<UserItem>>(`/users/${id}/status`, { isActive });
  return response.data.data;
}

export async function assignWarehouseToUser(
  userId: string,
  warehouseId: string,
  role?: string
): Promise<UserWarehouseAssignmentDetail> {
  const response = await apiClient.post<ApiResponse<UserWarehouseAssignmentDetail>>(
    `/users/${userId}/warehouses`,
    { warehouseId, role }
  );
  return response.data.data;
}

export async function syncUserWarehouses(
  userId: string,
  warehouseIds: string[]
): Promise<UserItem> {
  const response = await apiClient.put<ApiResponse<UserItem>>(
    `/users/${userId}/warehouses`,
    { warehouseIds }
  );
  return response.data.data;
}

export async function removeUserWarehouse(
  userId: string,
  warehouseId: string
): Promise<{ message: string }> {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/users/${userId}/warehouses/${warehouseId}`
  );
  return response.data.data;
}

export async function fetchWarehouseUsers(warehouseId: string): Promise<WarehouseTeamMembers> {
  const response = await apiClient.get<ApiResponse<WarehouseTeamMembers>>(
    `/warehouses/${warehouseId}/users`
  );
  return response.data.data;
}

