export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  country: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  managers?: any[];
  staff?: any[];
  userAssignments?: any[];
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  address: string;
  city: string;
  country: string;
  isActive?: boolean;
}

export interface ListWarehousesQuery {
  isActive?: boolean;
}

