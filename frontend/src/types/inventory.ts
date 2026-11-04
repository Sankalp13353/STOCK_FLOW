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

