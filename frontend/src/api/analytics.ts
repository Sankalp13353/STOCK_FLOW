import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  DashboardOverviewResult,
  DashboardKPIs,
  InventoryAnalyticsResult,
  OrderAnalyticsResult,
  WarehousePerformanceItem,
  OperationalAlertsResult,
  AnalyticsFilterParams,
} from '../types/analytics';

export async function fetchDashboardOverview(
  params?: AnalyticsFilterParams
): Promise<DashboardOverviewResult> {
  const response = await apiClient.get<ApiResponse<DashboardOverviewResult>>(
    '/analytics/dashboard',
    { params }
  );
  return response.data.data;
}

export async function fetchDashboardKPIs(
  params?: AnalyticsFilterParams
): Promise<DashboardKPIs> {
  const response = await apiClient.get<ApiResponse<DashboardKPIs>>('/analytics/kpis', {
    params,
  });
  return response.data.data;
}

export async function fetchInventoryAnalytics(
  params?: AnalyticsFilterParams
): Promise<InventoryAnalyticsResult> {
  const response = await apiClient.get<ApiResponse<InventoryAnalyticsResult>>(
    '/analytics/inventory',
    { params }
  );
  return response.data.data;
}

export async function fetchOrderAnalytics(
  params?: AnalyticsFilterParams
): Promise<OrderAnalyticsResult> {
  const response = await apiClient.get<ApiResponse<OrderAnalyticsResult>>(
    '/analytics/orders',
    { params }
  );
  return response.data.data;
}

export async function fetchWarehousePerformance(
  params?: AnalyticsFilterParams
): Promise<WarehousePerformanceItem[]> {
  const response = await apiClient.get<ApiResponse<WarehousePerformanceItem[]>>(
    '/analytics/warehouses',
    { params }
  );
  return response.data.data;
}

export async function fetchOperationalAlerts(
  params?: AnalyticsFilterParams
): Promise<OperationalAlertsResult> {
  const response = await apiClient.get<ApiResponse<OperationalAlertsResult>>(
    '/analytics/alerts',
    { params }
  );
  return response.data.data;
}

