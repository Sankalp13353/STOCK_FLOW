import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Warehouse as WarehouseIcon,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  ShoppingBag,
  ShoppingCart,
  Clock,
  ArrowRight,
  Filter,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../context/CartContext';
import { fetchWarehouses } from '../api/warehouses';
import { fetchRecentOrders } from '../api/dashboard';
import { fetchDashboardOverview } from '../api/analytics';
import { RestockModal } from '../features/inventory/RestockModal';
import { ThresholdManagementModal } from '../features/inventory/ThresholdManagementModal';
import { RecentOrdersList } from '../features/dashboard/RecentOrdersList';
import { StatCard } from '../features/dashboard/StatCard';
import { DashboardKpiRibbon } from '../features/dashboard/DashboardKpiRibbon';
import { OperationalAlertsSection } from '../features/dashboard/OperationalAlertsSection';
import { MovementTrendsChart } from '../features/dashboard/MovementTrendsChart';
import { OrderAnalyticsCharts } from '../features/dashboard/OrderAnalyticsCharts';
import { WarehousePerformanceTable } from '../features/dashboard/WarehousePerformanceTable';
import { TopShortagesTable } from '../features/dashboard/TopShortagesTable';
import { Warehouse, RestockResult } from '../types';
import { TimeRange } from '../types/analytics';

export function DashboardPage() {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const queryClient = useQueryClient();

  const isCustomer = user?.role === 'CUSTOMER';
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'WAREHOUSE_MANAGER';
  const isStaff = user?.role === 'WAREHOUSE_STAFF';

  // State for active filters
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
  } | null>(null);

  function showToast(message: string, type: 'success' | 'warning' | 'info' = 'success') {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  }

  // 1. Fetch user's accessible warehouses dynamically from backend
  const {
    data: warehouses = [],
    isLoading: isLoadingWarehouses,
    error: warehousesError,
    refetch: refetchWarehouses,
    isFetching: isFetchingWarehouses,
  } = useQuery<Warehouse[]>({
    queryKey: ['assigned-warehouses'],
    queryFn: () => fetchWarehouses(),
    enabled: !isCustomer,
    staleTime: 30 * 1000,
  });

  // Verify currently selected warehouse is still among assigned warehouses
  useEffect(() => {
    if (!warehouses || warehouses.length === 0) {
      if (selectedWarehouseId !== null) {
        setSelectedWarehouseId(null);
      }
      return;
    }

    if (selectedWarehouseId !== null) {
      const stillAssigned = warehouses.some((w) => w.id === selectedWarehouseId);
      if (!stillAssigned) {
        setSelectedWarehouseId(null);
        showToast(
          'Your previously selected warehouse assignment was revoked or updated. Scope reset to all assigned facilities.',
          'warning'
        );
      }
    }
  }, [warehouses, selectedWarehouseId]);

  // 2. Fetch comprehensive operational dashboard analytics from backend
  const {
    data: dashboardData,
    isLoading: isLoadingDashboard,
    error: dashboardError,
    refetch: refetchDashboard,
    isFetching: isFetchingDashboard,
  } = useQuery({
    queryKey: ['operational-dashboard', selectedWarehouseId, timeRange],
    queryFn: () =>
      fetchDashboardOverview({
        warehouseId: selectedWarehouseId || undefined,
        timeRange,
      }),
    enabled: Boolean(!isCustomer && warehouses.length > 0),
    staleTime: 15 * 1000,
  });

  // 3. For CUSTOMER: fetch customer's recent orders only
  const {
    data: customerOrders = [],
    isLoading: isLoadingCustomerOrders,
    refetch: refetchCustomerOrders,
  } = useQuery({
    queryKey: ['customer-recent-orders'],
    queryFn: () => fetchRecentOrders(10),
    enabled: isCustomer,
    staleTime: 30 * 1000,
  });

  // Restock success handler
  function handleRestockSuccess(result: RestockResult) {
    queryClient.invalidateQueries({ queryKey: ['operational-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-overview'] });
    showToast(
      `Stock updated successfully! Available quantity is now ${result.quantityAvailable} units.`
    );
  }

  // Refresh all dashboard queries
  function handleGlobalRefresh() {
    if (isCustomer) {
      refetchCustomerOrders();
    } else {
      refetchWarehouses();
      refetchDashboard();
    }
  }

  // ==========================================
  // CUSTOMER VIEW: Customer Wholesale Portal
  // ==========================================
  if (isCustomer) {
    const totalOrders = customerOrders.length;
    const activeOrders = customerOrders.filter((o) =>
      ['PENDING', 'RESERVED', 'PAYMENT_PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(
        o.status
      )
    ).length;
    const completedOrders = customerOrders.filter((o) => o.status === 'DELIVERED').length;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Customer Portal"
          description="Browse wholesale products, manage your shopping cart, and track fulfillment status."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchCustomerOrders()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh Orders
            </Button>
          }
        />

        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-brand-600 to-indigo-700 rounded-xl p-6 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Welcome, {user?.fullName}!</h2>
              <p className="text-brand-100 text-xs mt-1 max-w-xl">
                Browse our verified wholesale product catalog, place orders with real-time inventory allocation, and track orders from reservation to delivery.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/products"
                className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold bg-white text-brand-700 rounded-lg hover:bg-brand-50 transition-colors shrink-0 shadow-sm"
              >
                Explore Catalog
              </Link>
              <Link
                to="/cart"
                className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold bg-brand-500/40 text-white border border-white/20 rounded-lg hover:bg-brand-500/60 transition-colors shrink-0"
              >
                Shopping Cart ({totalItems})
              </Link>
            </div>
          </div>
        </div>

        {/* Customer Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Orders"
            value={totalOrders}
            subtitle="Lifetime orders submitted"
            icon={<ShoppingBag className="w-5 h-5" />}
            iconBgColor="bg-blue-50 text-blue-600 border-blue-100"
            isLoading={isLoadingCustomerOrders}
          />
          <StatCard
            title="In Progress"
            value={activeOrders}
            subtitle="Processing & in transit"
            icon={<Clock className="w-5 h-5" />}
            iconBgColor="bg-amber-50 text-amber-600 border-amber-100"
            isLoading={isLoadingCustomerOrders}
          />
          <StatCard
            title="Completed"
            value={completedOrders}
            subtitle="Delivered successfully"
            icon={<CheckCircle2 className="w-5 h-5" />}
            iconBgColor="bg-emerald-50 text-emerald-600 border-emerald-100"
            isLoading={isLoadingCustomerOrders}
          />
          <StatCard
            title="Cart Items"
            value={totalItems}
            subtitle="Ready for checkout"
            icon={<ShoppingCart className="w-5 h-5" />}
            iconBgColor="bg-purple-50 text-purple-600 border-purple-100"
          />
        </div>

        {/* Quick Shortcuts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/products"
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm transition-all group flex items-center justify-between"
          >
            <div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                Browse Products
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Explore active stock & wholesale pricing</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
          </Link>

          <Link
            to="/cart"
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm transition-all group flex items-center justify-between"
          >
            <div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                Shopping Cart
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">{totalItems} items saved in current session</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
          </Link>

          <Link
            to="/orders"
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm transition-all group flex items-center justify-between"
          >
            <div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                My Orders & Tracking
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">View full order history and status</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
          </Link>
        </div>

        {/* Recent Orders List with Track links */}
        <div className="grid grid-cols-1 gap-6">
          <RecentOrdersList orders={customerOrders.slice(0, 5)} isLoading={isLoadingCustomerOrders} />
        </div>
      </div>
    );
  }

  // ==========================================
  // OPERATIONAL COMMAND CENTRE
  // (ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF)
  // ==========================================
  const activeWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={
          isAdmin
            ? 'Enterprise Operational Command Centre'
            : isManager
            ? 'Warehouse Management Command Centre'
            : 'Operational Terminal & Workload Center'
        }
        description={
          isAdmin
            ? 'Organization-wide real-time operational metrics, multi-warehouse workload, inventory flow, and bottleneck indicators.'
            : isManager
            ? 'Real-time operational metrics and fulfilment velocity for your assigned warehouse facilities.'
            : 'Live operational workload, dispatch queues, and stock alerts for your assigned facilities.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Time Filter Dropdown / Buttons */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: '7d', label: '7 Days' },
                  { id: '30d', label: '30 Days' },
                  { id: '90d', label: '90 Days' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTimeRange(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    timeRange === tab.id
                      ? 'bg-brand-600 text-white font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Warehouse Scope Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedWarehouseId || ''}
                onChange={(e) => setSelectedWarehouseId(e.target.value || null)}
                className="text-xs font-medium text-slate-700 bg-transparent border-none focus:outline-hidden cursor-pointer"
                aria-label="Filter by warehouse"
              >
                <option value="">
                  {isAdmin
                    ? 'All Facilities (Enterprise)'
                    : `All Assigned Facilities (${warehouses.length})`}
                </option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.code} — {wh.name}
                  </option>
                ))}
              </select>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleGlobalRefresh}
              isLoading={isFetchingWarehouses || isFetchingDashboard}
              leftIcon={
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isFetchingWarehouses || isFetchingDashboard ? 'animate-spin' : ''
                  }`}
                />
              }
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Global Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs shadow-2xs animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : notification.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:opacity-75 transition-opacity"
            aria-label="Dismiss alert"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error state if warehouses or dashboard failed */}
      {warehousesError && (
        <ErrorMessage
          title="Failed to Load Assigned Warehouses"
          message={
            warehousesError instanceof Error
              ? warehousesError.message
              : 'Unable to communicate with the warehouse assignment service.'
          }
          onRetry={() => refetchWarehouses()}
        />
      )}

      {dashboardError && (
        <ErrorMessage
          title="Failed to Load Operational Analytics"
          message={
            dashboardError instanceof Error
              ? dashboardError.message
              : 'Unable to compute operational metrics from database.'
          }
          onRetry={() => refetchDashboard()}
        />
      )}

      {/* Loading or Empty Warehouse State */}
      {isLoadingWarehouses ? (
        <div className="space-y-4">
          <div className="h-24 w-full bg-slate-100 animate-pulse rounded-xl border border-slate-200" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="h-24 bg-slate-100 animate-pulse rounded-xl border border-slate-200"
              />
            ))}
          </div>
        </div>
      ) : warehouses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-12 text-center">
          <EmptyState
            icon={<WarehouseIcon className="w-10 h-10 text-slate-400" />}
            title="No warehouses assigned yet"
            description="You do not currently have access to any physical fulfillment centers. Once an administrator assigns one or more warehouses to your account, live operational analytics will automatically appear here."
            actionLabel="Check for New Assignments"
            onAction={() => refetchWarehouses()}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Scope Notice */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">Operational Scope:</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-bold text-brand-700">
                {activeWarehouse
                  ? `${activeWarehouse.code} — ${activeWarehouse.name}`
                  : isAdmin
                  ? 'All Facilities (Enterprise-wide)'
                  : `All Assigned Facilities (${warehouses.length})`}
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Timeframe: <strong className="text-slate-700 uppercase">{timeRange}</strong>
              </span>
            </div>

            {selectedWarehouseId && (
              <button
                onClick={() => setSelectedWarehouseId(null)}
                className="text-brand-600 hover:text-brand-700 font-semibold underline cursor-pointer text-xs"
              >
                Reset to All Assigned Facilities
              </button>
            )}
          </div>

          {/* Section 1: Dashboard KPI Cards Ribbon (10 Real Metrics) */}
          <DashboardKpiRibbon
            kpis={dashboardData?.kpis}
            isLoading={isLoadingDashboard || isFetchingDashboard}
          />

          {/* Section 2: Operational Alerts & Bottlenecks */}
          <OperationalAlertsSection
            alerts={dashboardData?.alerts?.alerts || []}
            isLoading={isLoadingDashboard || isFetchingDashboard}
          />

          {/* Section 3: Physical Movement Trends & Order Fulfillment Velocity */}
          <div className="grid grid-cols-1 gap-6">
            <MovementTrendsChart
              data={dashboardData?.inventory?.movementTrends || []}
              isLoading={isLoadingDashboard || isFetchingDashboard}
            />
            <OrderAnalyticsCharts
              analytics={dashboardData?.orders}
              isLoading={isLoadingDashboard || isFetchingDashboard}
            />
          </div>

          {/* Section 4: Multi-Warehouse Performance & Workload Comparison */}
          {(isAdmin || isManager || (isStaff && warehouses.length > 0)) && (
            <WarehousePerformanceTable
              warehouses={dashboardData?.warehouses || []}
              selectedWarehouseId={selectedWarehouseId}
              onSelectWarehouse={(id) => setSelectedWarehouseId(id)}
              isLoading={isLoadingDashboard || isFetchingDashboard}
            />
          )}

          {/* Section 5: Priority Shortages & Stock Deficits */}
          <TopShortagesTable
            shortages={dashboardData?.inventory?.topShortages || []}
            isLoading={isLoadingDashboard || isFetchingDashboard}
          />
        </div>
      )}

      {/* Restock Modal */}
      {activeWarehouse && (
        <RestockModal
          isOpen={isRestockOpen}
          onClose={() => setIsRestockOpen(false)}
          warehouse={activeWarehouse}
          onSuccess={handleRestockSuccess}
        />
      )}

      {/* Threshold Management Modal */}
      <ThresholdManagementModal
        isOpen={isThresholdModalOpen}
        onClose={() => setIsThresholdModalOpen(false)}
        onSuccessToast={(msg) => showToast(msg, 'success')}
      />
    </div>
  );
}
