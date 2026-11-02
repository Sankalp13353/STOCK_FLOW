import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  DashboardStats,
  InventoryRecord,
  OrderSummary,
  WarehouseInventoryChartData,
} from '../types/dashboard';

export async function fetchProductsCount(): Promise<number> {
  const response = await apiClient.get<ApiResponse<unknown[]>>('/products', {
    params: { limit: 1 },
  });
  return response.data.meta.pagination?.totalRecords ?? 0;
}

export async function fetchWarehousesCount(): Promise<number> {
  const response = await apiClient.get<ApiResponse<unknown[]>>('/warehouses');
  return (
    response.data.meta.pagination?.totalRecords ??
    (Array.isArray(response.data.data) ? response.data.data.length : 0)
  );
}

export async function fetchPendingOrdersCount(): Promise<number> {
  const response = await apiClient.get<ApiResponse<unknown[]>>('/orders', {
    params: { status: 'PENDING', limit: 1 },
  });
  return response.data.meta.pagination?.totalRecords ?? 0;
}

export async function fetchRecentOrders(limit = 5): Promise<OrderSummary[]> {
  const response = await apiClient.get<ApiResponse<OrderSummary[]>>('/orders', {
    params: { limit },
  });
  return response.data.data ?? [];
}

export async function fetchInventory(): Promise<InventoryRecord[]> {
  const response = await apiClient.get<ApiResponse<InventoryRecord[]>>('/inventory');
  return response.data.data ?? [];
}

export interface DashboardData {
  stats: DashboardStats;
  chartData: WarehouseInventoryChartData[];
  recentOrders: OrderSummary[];
  lowStockItems: InventoryRecord[];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  // Execute queries in parallel using real backend endpoints
  const [productsCount, warehousesCount, pendingOrdersCount, recentOrders, inventoryRecords] =
    await Promise.all([
      fetchProductsCount().catch(() => 0),
      fetchWarehousesCount().catch(() => 0),
      fetchPendingOrdersCount().catch(() => 0),
      fetchRecentOrders(5).catch(() => []),
      fetchInventory().catch(() => []),
    ]);

  // Calculate total inventory units
  const totalInventoryUnits = inventoryRecords.reduce(
    (sum, item) => sum + (item.quantityOnHand || 0),
    0
  );

  // Group inventory by warehouse for the chart
  const warehouseMap = new Map<string, WarehouseInventoryChartData>();
  for (const item of inventoryRecords) {
    const code = item.warehouse?.code || 'UNKNOWN';
    const name = item.warehouse?.name || 'Unassigned';
    if (!warehouseMap.has(code)) {
      warehouseMap.set(code, {
        warehouseCode: code,
        warehouseName: name,
        onHand: 0,
        reserved: 0,
        available: 0,
      });
    }
    const entry = warehouseMap.get(code)!;
    entry.onHand += item.quantityOnHand || 0;
    entry.reserved += item.quantityReserved || 0;
    entry.available += item.quantityAvailable || 0;
  }
  const chartData = Array.from(warehouseMap.values());

  // Filter low stock products (e.g. available < 20 units)
  const lowStockItems = inventoryRecords
    .filter((item) => item.quantityAvailable <= 20)
    .sort((a, b) => a.quantityAvailable - b.quantityAvailable)
    .slice(0, 6);

  return {
    stats: {
      totalProducts: productsCount,
      totalWarehouses: warehousesCount,
      totalInventoryUnits,
      pendingOrdersCount,
    },
    chartData,
    recentOrders,
    lowStockItems,
  };
}
