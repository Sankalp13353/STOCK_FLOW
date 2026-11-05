import { UserRole } from './index';

export interface UserWarehouseAssignmentDetail {
  id: string;
  warehouseId: string;
  role: UserRole | null;
  assignedAt: string;
  warehouse: {
    id: string;
    code: string;
    name: string;
    city: string;
    country: string;
    isActive: boolean;
  };
}

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  warehouseAssignments?: UserWarehouseAssignmentDetail[];
}

export interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  warehouseIds?: string[];
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  warehouseIds?: string[];
}

export interface UserListQueryParams {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
}

export interface WarehouseTeamMembers {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  totalAssigned: number;
  managers: UserItem[];
  staff: UserItem[];
  assignments: any[];
}

