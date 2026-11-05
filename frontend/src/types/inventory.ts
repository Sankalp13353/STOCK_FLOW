export interface ProductWarehouseStock {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
}

export interface ProductInventoryOverview {
  productId: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  breakdown: ProductWarehouseStock[];
}

export interface WarehouseInventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  minQuantity?: number | null;
  reorderQuantity?: number | null;
  thresholdType?: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE';
  thresholdId?: string | null;
  isLowStock?: boolean;
  product?: {
    id: string;
    sku: string;
    name: string;
    priceCents: number;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface RestockInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  supplier?: string;
  referenceId?: string;
  notes?: string;
}

export interface RestockResult {
  inventoryId: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  movementId: string;
}

export interface ExpireReservationsResult {
  expiredCount: number;
  restockedCount: number;
}

export interface MinimumStockThresholdItem {
  id: string;
  productId: string;
  warehouseId: string | null;
  minQuantity: number;
  reorderQuantity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  product?: {
    id: string;
    sku: string;
    name: string;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface CreateThresholdPayload {
  productId: string;
  warehouseId?: string | null;
  minQuantity: number;
  reorderQuantity?: number;
  isActive?: boolean;
}

export interface UpdateThresholdPayload {
  minQuantity?: number;
  reorderQuantity?: number;
  isActive?: boolean;
}

export interface LowStockEvaluationItem {
  productId: string;
  warehouseId: string;
  productName?: string;
  productSku?: string;
  warehouseCode?: string;
  warehouseName?: string;
  quantityOnHand: number;
  quantityReserved: number;
  availableStock: number;
  thresholdQuantity: number | null;
  reorderQuantity: number | null;
  thresholdType: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE';
  thresholdId: string | null;
  isThresholdConfigured: boolean;
  isLowStock: boolean;
  deficit: number;
  evaluatedAt: string;
}

export type MovementTypeEnum =
  | 'RESTOCK'
  | 'RESERVATION_HOLD'
  | 'RESERVATION_RELEASE'
  | 'FULFILMENT_DISPATCH'
  | 'DISPATCH'
  | 'CANCELLATION_RESTOCK'
  | 'AUDIT_ADJUSTMENT'
  | 'ADJUSTMENT_ADD'
  | 'ADJUSTMENT_DEDUCT'
  | 'DAMAGED'
  | 'RETURN'
  | (string & {});

export interface InventoryMovementRecord {
  id: string;
  productId: string;
  warehouseId: string;
  quantityDelta: number;
  movementType: MovementTypeEnum;
  referenceId: string | null;
  notes: string | null;
  actor: string | null;
  createdAt: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    priceCents?: number;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface MovementsQueryParams {
  page?: number;
  limit?: number;
  productId?: string;
  warehouseId?: string;
  movementType?: string;
  referenceId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedMovementsResponse {
  movements: InventoryMovementRecord[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

export interface InventoryReservationRecord {
  id: string;
  orderId: string;
  inventoryId: string;
  quantity: number;
  status: 'ACTIVE' | 'RELEASED' | 'FULFILLED';
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  isPaid: boolean;
  isExpired: boolean;
  displayStatus: string;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmountCents: number;
    createdAt: string;
    user?: {
      id: string;
      fullName: string;
      email: string;
    };
  };
  product?: {
    id: string;
    sku: string;
    name: string;
    priceCents?: number;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface ReservationsQueryParams {
  page?: number;
  limit?: number;
  productId?: string;
  warehouseId?: string;
  status?: string;
  orderId?: string;
  search?: string;
}

export interface PaginatedReservationsResponse {
  reservations: InventoryReservationRecord[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

export interface InventoryMetricsSummary {
  totalSkus: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockCount: number;
}
