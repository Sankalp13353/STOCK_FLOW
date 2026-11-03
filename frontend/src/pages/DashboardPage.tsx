import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../context/CartContext';
import { fetchWarehouses } from '../api/warehouses';
import {
  fetchWarehouseInventory,
  fetchInventory,
  expireReservations,
} from '../api/inventory';
import { fetchRecentOrders } from '../api/dashboard';
import { WarehouseSelector } from '../features/dashboard/WarehouseSelector';
import { SelectedWarehouseOverview } from '../features/dashboard/SelectedWarehouseOverview';
import { MultiWarehouseOverview } from '../features/dashboard/MultiWarehouseOverview';
import { RestockModal } from '../features/inventory/RestockModal';
import { RecentOrdersList } from '../features/dashboard/RecentOrdersList';
import { StatCard } from '../features/dashboard/StatCard';
import { Warehouse, RestockResult } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const queryClient = useQueryClient();

  const isCustomer = user?.role === 'CUSTOMER';
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'WAREHOUSE_MANAGER';

  // State for active warehouse selection
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isExpiringReservations, setIsExpiringReservations] = useState(false);
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

  // Automatically maintain selected warehouse & handle access revocation
  useEffect(() => {
    if (!warehouses || warehouses.length === 0) {
      if (selectedWarehouseId !== null) {
        setSelectedWarehouseId(null);
      }
      return;
    }

    // If currently selected warehouse is no longer present in assigned warehouses
    const stillAssigned = warehouses.some((w) => w.id === selectedWarehouseId);
    if (!stillAssigned) {
      const fallback = warehouses[0].id;
      if (selectedWarehouseId !== null) {
        // Selection was previously pointing to a revoked warehouse
        showToast(
          'Your previously selected warehouse assignment was updated or revoked. Switched to another assigned facility.',
          'warning'
        );
      }
      setSelectedWarehouseId(fallback);
    }

    // Evict cached inventory data for any facility that is no longer in user's active assignments
    const assignedIdSet = new Set(warehouses.map((w) => w.id));
    queryClient.removeQueries({
      predicate: (query) => {
        const queryKey = query.queryKey;
        if (queryKey[0] === 'warehouse-inventory' && typeof queryKey[1] === 'string') {
          return !assignedIdSet.has(queryKey[1]);
        }
        return false;
      },
    });
  }, [warehouses, selectedWarehouseId]);

  // Active warehouse object
  const activeWarehouse = useMemo(() => {
    if (!selectedWarehouseId) return null;
    return warehouses.find((w) => w.id === selectedWarehouseId) || null;
  }, [warehouses, selectedWarehouseId]);

  // 2. Fetch inventory for currently selected warehouse
  const {
    data: warehouseInventory = [],
    isLoading: isLoadingInventory,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ['warehouse-inventory', selectedWarehouseId],
    queryFn: () => fetchWarehouseInventory(selectedWarehouseId!),
    enabled: Boolean(!isCustomer && selectedWarehouseId),
    staleTime: 15 * 1000,
    retry: 1,
  });

  // Handle immediate 403 access revocation for the selected warehouse
  useEffect(() => {
    if (inventoryError) {
      const status = (inventoryError as any)?.status;
      if (status === 403 && selectedWarehouseId) {
        // Clear cached data for revoked warehouse
        queryClient.removeQueries({ queryKey: ['warehouse-inventory', selectedWarehouseId] });
        showToast(
          'Access to this warehouse was revoked by an administrator. Refreshing assigned facilities...',
          'warning'
        );
        // Immediately refresh user's assigned warehouse list
        refetchWarehouses();
      }
    }
  }, [inventoryError, selectedWarehouseId, queryClient, refetchWarehouses]);

  // 3. For ADMIN & WAREHOUSE_MANAGER: Fetch multi-warehouse overview inventory across all assigned facilities
  const isManagerOrAdmin = isAdmin || isManager;
  const {
    data: allInventory = [],
    isLoading: isLoadingAllInventory,
    refetch: refetchAllInventory,
  } = useQuery({
    queryKey: ['all-assigned-inventory'],
    queryFn: () => fetchInventory(),
    enabled: Boolean(!isCustomer && isManagerOrAdmin && warehouses.length > 0),
    staleTime: 30 * 1000,
  });

  // 4. For CUSTOMER: fetch customer's recent orders only
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
    queryClient.invalidateQueries({ queryKey: ['warehouse-inventory', selectedWarehouseId] });
    queryClient.invalidateQueries({ queryKey: ['all-assigned-inventory'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
    showToast(
      `Stock updated successfully! Available quantity is now ${result.quantityAvailable} units.`
    );
  }

  // Sweep stale reservations handler (ADMIN & WAREHOUSE_MANAGER)
  async function handleExpireReservations() {
    setIsExpiringReservations(true);
    try {
      const res = await expireReservations();
      queryClient.invalidateQueries({ queryKey: ['warehouse-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['all-assigned-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      showToast(
        `Reservation sweep completed: ${res.expiredCount} expired reservations swept, ${res.restockedCount} units restocked into available inventory.`
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to expire reservations.', 'warning');
    } finally {
      setIsExpiringReservations(false);
    }
  }

  // Refresh all dashboard queries
  function handleGlobalRefresh() {
    if (isCustomer) {
      refetchCustomerOrders();
    } else {
      refetchWarehouses();
      if (selectedWarehouseId) {
        refetchInventory();
      }
      if (isManagerOrAdmin) {
        refetchAllInventory();
      }
    }
  }

  // ==========================================
  // CUSTOMER VIEW: Customer Portal Only
  // ==========================================
  if (isCustomer) {
    const totalOrders = customerOrders.length;
    const activeOrders = customerOrders.filter((o) =>
      ['PENDING', 'RESERVED', 'PAYMENT_PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status)
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
  // INTERNAL OPERATIONS / WAREHOUSE VIEW
  // (ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF)
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={
          isAdmin
            ? 'Enterprise Warehouse Operations'
            : isManager
            ? 'Warehouse Management Dashboard'
            : 'Warehouse Operational Terminal'
        }
        description={
          isAdmin
            ? 'Organization-wide facility distribution metrics, multi-warehouse oversight, and inventory allocations.'
            : isManager
            ? 'Dynamic operational oversight of all your assigned fulfillment facilities and inventory allocations.'
            : 'Real-time stock ledger and operational terminal for your assigned fulfillment facilities.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGlobalRefresh}
              isLoading={isFetchingWarehouses}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetchingWarehouses ? 'animate-spin' : ''}`} />}
            >
              Refresh Dashboard
            </Button>
          </div>
        }
      />

      {/* Global Notification / Alert Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs shadow-sm animate-in fade-in duration-200 ${
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

      {/* Error state if warehouses failed to load */}
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

      {/* Loading Skeletons */}
      {isLoadingWarehouses ? (
        <div className="space-y-4">
          <div className="h-16 w-full bg-slate-100 animate-pulse rounded-xl border border-slate-200" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-xl border border-slate-200" />
            ))}
          </div>
        </div>
      ) : warehouses.length === 0 ? (
        /* Empty State: Exactly as specified in Section 6 */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <EmptyState
            icon={<WarehouseIcon className="w-10 h-10 text-slate-400" />}
            title="No warehouses assigned yet. Contact your administrator."
            description="You do not currently have access to any physical fulfillment centers. Once an administrator assigns one or more warehouses to your account, they will automatically appear here."
            actionLabel="Check for New Assignments"
            onAction={() => refetchWarehouses()}
          />
        </div>
      ) : (
        /* Warehouse Operations Interface */
        <div className="space-y-6">
          {/* Warehouse Selector (Dynamic, Searchable, Scrollable, No fixed limit) */}
          <div>
            <WarehouseSelector
              warehouses={warehouses}
              selectedWarehouseId={selectedWarehouseId}
              onSelectWarehouse={(id) => setSelectedWarehouseId(id)}
              isLoading={isLoadingWarehouses}
              isAdmin={isAdmin}
            />
          </div>

          {/* Selected Warehouse Overview */}
          {activeWarehouse && (
            <SelectedWarehouseOverview
              warehouse={activeWarehouse}
              inventory={warehouseInventory}
              isLoading={isLoadingInventory}
              userRole={user?.role}
              onRefresh={() => refetchInventory()}
              onOpenRestock={() => setIsRestockOpen(true)}
              onExpireReservations={handleExpireReservations}
              isExpiringReservations={isExpiringReservations}
            />
          )}

          {/* Multi-Warehouse Comparative Overview (For ADMIN and WAREHOUSE_MANAGER) */}
          {isManagerOrAdmin && warehouses.length > 1 && (
            <div className="pt-2">
              <MultiWarehouseOverview
                warehouses={warehouses}
                allInventory={allInventory}
                isLoading={isLoadingAllInventory}
                selectedWarehouseId={selectedWarehouseId}
                onSelectWarehouse={(id) => {
                  setSelectedWarehouseId(id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
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
    </div>
  );
}
