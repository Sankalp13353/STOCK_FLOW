export type TimeRange = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardKPIs {
  totalProducts: number;
  totalPhysicalInventory: number;
  totalReservedInventory: number;
  totalAvailableInventory: number;
  lowStockCount: number;
  pendingOrders: number;
  ordersAwaitingProcessing: number;
  ordersAwaitingDispatch: number;
  activeTickets: number;
  activeWarehouses: number;
}

export interface InventoryDistributionItem {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockCount: number;
}

export interface LowStockItemSummary {
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  minQuantity: number;
  deficit: number;
}

export interface MovementTrendDataPoint {
  date: string;
  restockCount: number;
  restockQuantity: number;
  dispatchCount: number;
  dispatchQuantity: number;
  adjustmentCount: number;
  adjustmentQuantity: number;
}

export interface TopShortageItem {
  productId: string;
  sku: string;
  name: string;
  totalShortageQuantity: number;
  affectedOrdersCount: number;
  activeTicketsCount: number;
}

export interface InventoryAnalyticsResult {
  stockDistribution: InventoryDistributionItem[];
  lowStockSummary: LowStockItemSummary[];
  movementTrends: MovementTrendDataPoint[];
  topShortages: TopShortageItem[];
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface OrdersOverTimeDataPoint {
  date: string;
  totalOrders: number;
  totalAmountCents: number;
  confirmedCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
}

export interface OrderAnalyticsResult {
  byStatus: OrderStatusBreakdown[];
  ordersOverTime: OrdersOverTimeDataPoint[];
  backlog: {
    awaitingProcessingCount: number;
    awaitingDispatchCount: number;
    totalBacklog: number;
  };
  deliveredCount: number;
  cancellationTrends: {
    cancelledCount: number;
    cancellationRate: number;
  };
}

export interface WarehousePerformanceItem {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  isActive: boolean;
  city: string;
  country: string;
  inventoryOnHand: number;
  inventoryReserved: number;
  inventoryAvailable: number;
  lowStockCount: number;
  ordersFulfilledCount: number;
  dispatchedVolume: number;
  activeTicketsCount: number;
}

export interface OperationalAlertItem {
  id: string;
  type:
    | 'LOW_STOCK'
    | 'AWAITING_PROCESSING'
    | 'AWAITING_DISPATCH'
    | 'SHORTAGE_TICKET'
    | 'CUSTOMER_DECISION'
    | 'MANAGER_APPROVAL';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  targetUrl: string;
  entityId: string;
}

export interface OperationalAlertsResult {
  totalAlerts: number;
  alerts: OperationalAlertItem[];
}

export interface DashboardOverviewResult {
  timeRange: TimeRange;
  startDate: string;
  endDate: string;
  warehouseId: string | null;
  kpis: DashboardKPIs;
  inventory: InventoryAnalyticsResult;
  orders: OrderAnalyticsResult;
  warehouses: WarehousePerformanceItem[];
  alerts: OperationalAlertsResult;
}

export interface AnalyticsFilterParams {
  warehouseId?: string;
  timeRange?: TimeRange;
  startDate?: string;
  endDate?: string;
}

