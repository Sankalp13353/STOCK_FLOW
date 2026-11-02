import { OrderStatus } from './index';

export interface InventoryRecord {
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

export interface OrderItemSummary {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderSummary {
  id: string;
  customerId: string;
  status: OrderStatus;
  totalAmountCents: number;
  shippingAddress: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemSummary[];
}

export interface DashboardStats {
  totalProducts: number;
  totalWarehouses: number;
  totalInventoryUnits: number;
  pendingOrdersCount: number;
}

export interface WarehouseInventoryChartData {
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
}

