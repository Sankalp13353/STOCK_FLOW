import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { useAuth } from '../hooks/useAuth';
import {
  fetchInventory,
  fetchInventoryMetrics,
  fetchInventoryMovements,
  fetchInventoryReservations,
  fetchThresholds,
  deleteThreshold,
  expireReservations,
} from '../api/inventory';
import { fetchWarehouses } from '../api/warehouses';
import {
  WarehouseInventoryItem,
  InventoryMovementRecord,
  InventoryReservationRecord,
  MinimumStockThresholdItem,
} from '../types/inventory';
import { Warehouse } from '../types';
import { RestockModal } from '../features/inventory/RestockModal';
import { ThresholdManagementModal } from '../features/inventory/ThresholdManagementModal';
import {
  Boxes,
  Package,
  AlertTriangle,
  History,
  Sliders,
  Search,
  CheckCircle2,
  RefreshCw,
  Plus,
  Building2,
  Trash2,
  Lock,
} from 'lucide-react';

type TabType = 'stock' | 'movements' | 'thresholds' | 'reservations';

export function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE_MANAGER';
  const queryClient = useQueryClient();

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('stock');

  // Notification Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<string | undefined>(undefined);
  const [restockWarehouse, setRestockWarehouse] = useState<string | undefined>(undefined);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);

  // Shared Filters
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  // Tab 1: Stock Filters
  const [stockSearch, setStockSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [stockPage, setStockPage] = useState(1);
  const stockLimit = 15;

  // Tab 2: Movements Filters & Pagination
  const [movementSearch, setMovementSearch] = useState('');
  const [movementType, setMovementType] = useState<string>('');
  const [movementStartDate, setMovementStartDate] = useState('');
  const [movementEndDate, setMovementEndDate] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const movementLimit = 20;

  // Tab 4: Reservations Filters & Pagination
  const [reservationSearch, setReservationSearch] = useState('');
  const [reservationStatus, setReservationStatus] = useState<string>('');
  const [reservationPage, setReservationPage] = useState(1);
  const reservationLimit = 20;

  // 1. Fetch Warehouses for dropdowns
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['warehouses-list'],
    queryFn: () => fetchWarehouses(),
    staleTime: 60 * 1000,
  });

  // 2. Fetch Metrics Summary
  const {
    data: metrics,
    isLoading: isLoadingMetrics,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['inventory-metrics', selectedWarehouseId],
    queryFn: () => fetchInventoryMetrics(selectedWarehouseId || undefined),
    staleTime: 30 * 1000,
  });

  // 3. Fetch Inventory Stock Items
  const {
    data: inventoryItems = [],
    isLoading: isLoadingStock,
    isError: isStockError,
    error: stockError,
    refetch: refetchStock,
  } = useQuery<WarehouseInventoryItem[]>({
    queryKey: [
      'inventory',
      selectedWarehouseId,
      stockSearch,
      lowStockOnly ? 'true' : undefined,
    ],
    queryFn: () =>
      fetchInventory({
        warehouseId: selectedWarehouseId || undefined,
        search: stockSearch.trim() || undefined,
        lowStockOnly: lowStockOnly ? 'true' : undefined,
      }),
    staleTime: 30 * 1000,
  });

  // 4. Fetch Movements Ledger
  const {
    data: movementsData,
    isLoading: isLoadingMovements,
    isError: isMovementsError,
    error: movementsError,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: [
      'inventory-movements',
      movementPage,
      movementLimit,
      selectedWarehouseId,
      movementType,
      movementSearch,
      movementStartDate,
      movementEndDate,
    ],
    queryFn: () =>
      fetchInventoryMovements({
        page: movementPage,
        limit: movementLimit,
        warehouseId: selectedWarehouseId || undefined,
        movementType: movementType || undefined,
        search: movementSearch.trim() || undefined,
        startDate: movementStartDate || undefined,
        endDate: movementEndDate || undefined,
      }),
    enabled: activeTab === 'movements',
    staleTime: 15 * 1000,
  });

  // 5. Fetch Reservations
  const {
    data: reservationsData,
    isLoading: isLoadingReservations,
    isError: isReservationsError,
    error: reservationsError,
    refetch: refetchReservations,
  } = useQuery({
    queryKey: [
      'inventory-reservations',
      reservationPage,
      reservationLimit,
      selectedWarehouseId,
      reservationStatus,
      reservationSearch,
    ],
    queryFn: () =>
      fetchInventoryReservations({
        page: reservationPage,
        limit: reservationLimit,
        warehouseId: selectedWarehouseId || undefined,
        status: reservationStatus || undefined,
        search: reservationSearch.trim() || undefined,
      }),
    enabled: activeTab === 'reservations',
    staleTime: 15 * 1000,
  });

  // 6. Fetch Thresholds (for Tab 3)
  const {
    data: thresholds = [],
    isLoading: isLoadingThresholds,
    refetch: refetchThresholds,
  } = useQuery<MinimumStockThresholdItem[]>({
    queryKey: ['thresholds', selectedWarehouseId],
    queryFn: () =>
      fetchThresholds({
        warehouseId: selectedWarehouseId || undefined,
      }),
    enabled: activeTab === 'thresholds',
    staleTime: 30 * 1000,
  });

  // Mutation: Expire Stale Reservations Sweep
  const expireMutation = useMutation({
    mutationFn: () => expireReservations(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      setToastMessage(
        `Sweep completed: Expired ${data.expiredCount} reservations and restocked ${data.restockedCount} units.`
      );
      setTimeout(() => setToastMessage(null), 5000);
    },
    onError: (err: any) => {
      setToastMessage(err.response?.data?.error?.message || 'Failed to expire reservations.');
      setTimeout(() => setToastMessage(null), 5000);
    },
  });

  // Mutation: Delete Threshold
  const deleteThresholdMutation = useMutation({
    mutationFn: (id: string) => deleteThreshold(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-metrics'] });
      setToastMessage('Threshold removed successfully.');
      setTimeout(() => setToastMessage(null), 5000);
    },
  });

  // Client-side filtering & pagination for Tab 1 (Stock Management)
  const filteredStockItems = useMemo(() => {
    let items = [...inventoryItems];

    if (stockStatusFilter === 'IN_STOCK') {
      items = items.filter((i) => i.quantityAvailable > 0 && !i.isLowStock);
    } else if (stockStatusFilter === 'LOW_STOCK') {
      items = items.filter((i) => i.isLowStock);
    } else if (stockStatusFilter === 'OUT_OF_STOCK') {
      items = items.filter((i) => i.quantityOnHand === 0 || i.quantityAvailable <= 0);
    } else if (stockStatusFilter === 'UNCONFIGURED') {
      items = items.filter((i) => !i.thresholdType || i.thresholdType === 'NONE');
    }

    return items;
  }, [inventoryItems, stockStatusFilter]);

  const paginatedStockItems = useMemo(() => {
    const startIndex = (stockPage - 1) * stockLimit;
    return filteredStockItems.slice(startIndex, startIndex + stockLimit);
  }, [filteredStockItems, stockPage, stockLimit]);

  const totalStockPages = Math.ceil(filteredStockItems.length / stockLimit) || 1;

  function handleQuickRestock(productId: string, warehouseId: string) {
    setRestockProduct(productId);
    setRestockWarehouse(warehouseId);
    setIsRestockModalOpen(true);
  }

  function handleOpenGenericRestock() {
    setRestockProduct(undefined);
    setRestockWarehouse(selectedWarehouseId || undefined);
    setIsRestockModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Inventory & Stock Allocation"
        description="Monitor physical on-hand stock, active reservation allocations, immutable movement logs, and minimum threshold configurations."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => expireMutation.mutate()}
                isLoading={expireMutation.isPending}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                title="Expire stale unpaid reservations older than 15 minutes and release holds"
              >
                Sweep Reservations
              </Button>
            )}

            {isManagerOrAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsThresholdModalOpen(true)}
                leftIcon={<Sliders className="w-3.5 h-3.5" />}
              >
                Manage Thresholds
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenGenericRestock}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Restock Inventory
            </Button>
          </div>
        }
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Summary Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Product SKUs */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Product SKUs
              </span>
              <Package className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 font-mono">
                {isLoadingMetrics ? '—' : metrics?.totalSkus ?? 0}
              </span>
              <span className="text-[10px] text-slate-500">tracked items</span>
            </div>
          </CardContent>
        </Card>

        {/* Total Physical Stock (quantityOnHand) */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Physical Stock
              </span>
              <Boxes className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-600 font-mono">
                {isLoadingMetrics ? '—' : metrics?.totalOnHand?.toLocaleString() ?? 0}
              </span>
              <span className="text-[10px] text-slate-500">units on hand</span>
            </div>
          </CardContent>
        </Card>

        {/* Total Reserved Stock (quantityReserved) */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Reserved Holds
              </span>
              <Lock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600 font-mono">
                {isLoadingMetrics ? '—' : metrics?.totalReserved?.toLocaleString() ?? 0}
              </span>
              <span className="text-[10px] text-slate-500">committed/held</span>
            </div>
          </CardContent>
        </Card>

        {/* Total Available Stock */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Available Stock
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600 font-mono">
                {isLoadingMetrics ? '—' : metrics?.totalAvailable?.toLocaleString() ?? 0}
              </span>
              <span className="text-[10px] text-slate-500">ready to sell</span>
            </div>
          </CardContent>
        </Card>

        {/* Low-Stock SKU Count */}
        <Card className={`border-slate-200 ${metrics && metrics.lowStockCount > 0 ? 'bg-amber-50/40 border-amber-200' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-800 uppercase tracking-wider">
                Low Stock Deficit
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-700 font-mono">
                {isLoadingMetrics ? '—' : metrics?.lowStockCount ?? 0}
              </span>
              <span className="text-[10px] text-amber-800">SKUs below min</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Warehouse Filter & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'stock'
                ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Stock Ledger
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {filteredStockItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'movements'
                ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            Movement History
          </button>

          <button
            onClick={() => setActiveTab('reservations')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'reservations'
                ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Lock className="w-4 h-4" />
            Active Reservations
          </button>

          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'thresholds'
                ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Threshold Policies
          </button>
        </div>

        {/* Global Warehouse Filter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedWarehouseId}
            onChange={(e) => {
              setSelectedWarehouseId(e.target.value);
              setStockPage(1);
              setMovementPage(1);
              setReservationPage(1);
            }}
            className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
          >
            <option value="">All Authorized Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                [{w.code}] {w.name} ({w.city})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: STOCK LEDGER */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <Card>
            <CardContent className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={stockSearch}
                    onChange={(e) => {
                      setStockSearch(e.target.value);
                      setStockPage(1);
                    }}
                    placeholder="Search by Product Name, SKU, or Warehouse..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 placeholder-slate-400"
                  />
                  {stockSearch && (
                    <button
                      onClick={() => setStockSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Stock Status Selector */}
                <select
                  value={stockStatusFilter}
                  onChange={(e) => {
                    setStockStatusFilter(e.target.value);
                    setStockPage(1);
                  }}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="ALL">All Stock Statuses</option>
                  <option value="IN_STOCK">In Stock</option>
                  <option value="LOW_STOCK">Low Stock</option>
                  <option value="OUT_OF_STOCK">Out of Stock</option>
                  <option value="UNCONFIGURED">Unconfigured</option>
                </select>
              </div>

              {/* Low Stock Only Checkbox */}
              <div className="flex items-center gap-4 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={lowStockOnly}
                    onChange={(e) => {
                      setLowStockOnly(e.target.checked);
                      setStockPage(1);
                    }}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                  <span>Low Stock Only</span>
                </label>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchStock();
                    refetchMetrics();
                  }}
                  title="Refresh stock ledger"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stock Table */}
          <Card>
            {isLoadingStock ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : isStockError ? (
              <div className="p-6">
                <ErrorMessage
                  title="Failed to Load Inventory"
                  message={(stockError as any)?.response?.data?.error?.message || 'Error fetching inventory.'}
                  onRetry={() => refetchStock()}
                />
              </div>
            ) : paginatedStockItems.length === 0 ? (
              <EmptyState
                icon={<Boxes className="w-8 h-8 text-slate-400" />}
                title="No Inventory Records Found"
                description={
                  stockSearch || stockStatusFilter !== 'ALL' || lowStockOnly
                    ? 'No products match your active search filters. Try resetting the filters.'
                    : 'No inventory records exist for the selected warehouse facility.'
                }
                actionLabel="Restock Catalog Item"
                onAction={handleOpenGenericRestock}
                className="border-none"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">Product / SKU</th>
                      <th className="py-3 px-4">Warehouse Facility</th>
                      <th className="py-3 px-4 text-right">Physical (On Hand)</th>
                      <th className="py-3 px-4 text-right">Reserved (Hold)</th>
                      <th className="py-3 px-4 text-right">Available (Sellable)</th>
                      <th className="py-3 px-4">Effective Min Threshold</th>
                      <th className="py-3 px-4">Stock Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedStockItems.map((item) => {
                      const available = item.quantityAvailable;
                      const isOutOfStock = item.quantityOnHand === 0 || available <= 0;
                      const isLow = item.isLowStock;
                      const hasThreshold = item.minQuantity !== null && item.minQuantity !== undefined;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Product */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {item.product?.name || 'Unnamed Product'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {item.product?.sku || 'SKU-UNKNOWN'}
                            </div>
                          </td>

                          {/* Warehouse */}
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">
                              {item.warehouse?.name || 'Central Facility'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              [{item.warehouse?.code || 'WH'}]
                            </div>
                          </td>

                          {/* Physical Stock */}
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                            {item.quantityOnHand.toLocaleString()}
                          </td>

                          {/* Reserved Stock */}
                          <td className="py-3 px-4 text-right font-mono text-amber-700">
                            {item.quantityReserved > 0 ? (
                              <span className="font-semibold">{item.quantityReserved.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>

                          {/* Available Stock */}
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            <span
                              className={
                                isOutOfStock
                                  ? 'text-rose-600'
                                  : isLow
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }
                            >
                              {available.toLocaleString()}
                            </span>
                          </td>

                          {/* Threshold */}
                          <td className="py-3 px-4">
                            {hasThreshold ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-slate-800">
                                  {item.minQuantity}
                                </span>
                                {item.thresholdType === 'WAREHOUSE_OVERRIDE' ? (
                                  <Badge variant="purple" size="sm">
                                    Override
                                  </Badge>
                                ) : (
                                  <Badge variant="neutral" size="sm">
                                    Default
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Not Configured</span>
                            )}
                          </td>

                          {/* Stock Status Badge */}
                          <td className="py-3 px-4">
                            {isOutOfStock ? (
                              <Badge variant="danger" size="sm">
                                Out of Stock
                              </Badge>
                            ) : isLow ? (
                              <Badge variant="warning" size="sm">
                                Low Stock
                              </Badge>
                            ) : hasThreshold ? (
                              <Badge variant="success" size="sm">
                                In Stock
                              </Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">
                                Unconfigured
                              </Badge>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickRestock(item.productId, item.warehouseId)}
                              className="text-xs py-1 px-2.5"
                            >
                              Restock
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {paginatedStockItems.length > 0 && (
              <Pagination
                currentPage={stockPage}
                totalPages={totalStockPages}
                totalRecords={filteredStockItems.length}
                limit={stockLimit}
                onPageChange={(page) => setStockPage(page)}
              />
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: MOVEMENT HISTORY LEDGER */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Movement Filters */}
          <Card>
            <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={movementSearch}
                  onChange={(e) => {
                    setMovementSearch(e.target.value);
                    setMovementPage(1);
                  }}
                  placeholder="Search by SKU, Product, Notes, or Ref UUID..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 placeholder-slate-400"
                />
              </div>

              {/* Movement Type Filter */}
              <select
                value={movementType}
                onChange={(e) => {
                  setMovementType(e.target.value);
                  setMovementPage(1);
                }}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All Movement Types</option>
                <option value="RESTOCK">Restock (Addition)</option>
                <option value="RESERVATION_HOLD">Reservation Hold</option>
                <option value="RESERVATION_RELEASE">Reservation Release</option>
                <option value="FULFILMENT_DISPATCH">Fulfilment Dispatch</option>
                <option value="CANCELLATION_RESTOCK">Cancellation Restock</option>
                <option value="AUDIT_ADJUSTMENT">Audit Adjustment</option>
              </select>

              {/* Start Date */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>From:</span>
                <input
                  type="date"
                  value={movementStartDate}
                  onChange={(e) => {
                    setMovementStartDate(e.target.value);
                    setMovementPage(1);
                  }}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* End Date */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>To:</span>
                <input
                  type="date"
                  value={movementEndDate}
                  onChange={(e) => {
                    setMovementEndDate(e.target.value);
                    setMovementPage(1);
                  }}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchMovements()}
                title="Refresh movement ledger"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* Movements Table */}
          <Card>
            {isLoadingMovements ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : isMovementsError ? (
              <div className="p-6">
                <ErrorMessage
                  title="Failed to Load Movement Ledger"
                  message={(movementsError as any)?.response?.data?.error?.message || 'Error fetching movements.'}
                  onRetry={() => refetchMovements()}
                />
              </div>
            ) : !movementsData?.movements || movementsData.movements.length === 0 ? (
              <EmptyState
                icon={<History className="w-8 h-8 text-slate-400" />}
                title="No Inventory Movements Recorded"
                description="Immutable stock movements will appear here when restocks, holds, dispatches, or cancellations occur."
                className="border-none"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Product / SKU</th>
                      <th className="py-3 px-4">Facility</th>
                      <th className="py-3 px-4">Movement Type</th>
                      <th className="py-3 px-4 text-right">Delta</th>
                      <th className="py-3 px-4">Reference ID / PO</th>
                      <th className="py-3 px-4">Ledger Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {movementsData.movements.map((m: InventoryMovementRecord) => {
                      const deltaPositive = m.quantityDelta > 0;
                      const deltaZero = m.quantityDelta === 0;

                      let badgeVariant: 'success' | 'brand' | 'purple' | 'warning' | 'neutral' = 'neutral';
                      if (m.movementType === 'RESTOCK' || m.movementType === 'CANCELLATION_RESTOCK') {
                        badgeVariant = 'success';
                      } else if (m.movementType === 'RESERVATION_HOLD') {
                        badgeVariant = 'brand';
                      } else if (m.movementType === 'RESERVATION_RELEASE') {
                        badgeVariant = 'purple';
                      } else if (m.movementType === 'FULFILMENT_DISPATCH') {
                        badgeVariant = 'warning';
                      }

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Timestamp */}
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            <div className="font-mono text-[11px] text-slate-700">
                              {new Date(m.createdAt).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          {/* Product */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {m.product?.name || 'Catalog Item'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {m.product?.sku || 'SKU'}
                            </div>
                          </td>

                          {/* Warehouse */}
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">
                              {m.warehouse?.name || 'Warehouse'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              [{m.warehouse?.code || 'WH'}]
                            </div>
                          </td>

                          {/* Type */}
                          <td className="py-3 px-4">
                            <Badge variant={badgeVariant} size="sm">
                              {m.movementType.replace('_', ' ')}
                            </Badge>
                          </td>

                          {/* Delta */}
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {deltaZero ? (
                              <span className="text-slate-400">0</span>
                            ) : deltaPositive ? (
                              <span className="text-emerald-600">+{m.quantityDelta.toLocaleString()}</span>
                            ) : (
                              <span className="text-rose-600">{m.quantityDelta.toLocaleString()}</span>
                            )}
                          </td>

                          {/* Reference ID */}
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {m.referenceId ? (
                              <span className="truncate max-w-[120px] inline-block" title={m.referenceId}>
                                {m.referenceId.slice(0, 8)}...
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>

                          {/* Notes */}
                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={m.notes || ''}>
                            {m.notes || <span className="text-slate-400 italic">No notes logged</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {movementsData?.pagination && movementsData.pagination.totalRecords > 0 && (
              <Pagination
                currentPage={movementsData.pagination.page}
                totalPages={movementsData.pagination.totalPages}
                totalRecords={movementsData.pagination.totalRecords}
                limit={movementsData.pagination.limit}
                onPageChange={(page) => setMovementPage(page)}
              />
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: THRESHOLD POLICIES */}
      {activeTab === 'thresholds' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Configured Stock Policies</h3>
                <p className="text-xs text-slate-500">
                  Warehouse-specific thresholds override organization-wide global defaults. Low stock alerts trigger automatically when sellable available stock dips below configured minimums.
                </p>
              </div>
              {isManagerOrAdmin && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsThresholdModalOpen(true)}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Configure Threshold
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            {isLoadingThresholds ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : thresholds.length === 0 ? (
              <EmptyState
                icon={<Sliders className="w-8 h-8 text-slate-400" />}
                title="No Minimum Thresholds Configured"
                description="Set up organization-wide default thresholds or warehouse overrides to prevent stockouts."
                actionLabel="Configure First Threshold"
                onAction={() => setIsThresholdModalOpen(true)}
                className="border-none"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">Product / SKU</th>
                      <th className="py-3 px-4">Scope / Facility</th>
                      <th className="py-3 px-4 text-right">Min Threshold</th>
                      <th className="py-3 px-4 text-right">Reorder Qty</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Updated</th>
                      {isManagerOrAdmin && <th className="py-3 px-4 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {thresholds.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{t.product?.name || 'Product'}</div>
                          <div className="font-mono text-[11px] text-slate-500">{t.product?.sku}</div>
                        </td>
                        <td className="py-3 px-4">
                          {t.warehouse ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="purple" size="sm">
                                Facility Override
                              </Badge>
                              <span className="font-medium text-slate-700">[{t.warehouse.code}] {t.warehouse.name}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="neutral" size="sm">
                                Global Default
                              </Badge>
                              <span className="text-slate-500 italic">All Warehouses</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {t.minQuantity} units
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {t.reorderQuantity ?? '—'}
                        </td>
                        <td className="py-3 px-4">
                          {t.isActive ? (
                            <Badge variant="success" size="sm">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Disabled
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                          {new Date(t.updatedAt).toLocaleDateString()}
                        </td>
                        {isManagerOrAdmin && (
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (window.confirm('Delete this threshold policy?')) {
                                  deleteThresholdMutation.mutate(t.id);
                                }
                              }}
                              className="text-rose-600 hover:text-rose-700 hover:border-rose-300 py-1 px-2 text-xs"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: ACTIVE RESERVATIONS & COMMITTED HOLDS */}
      {activeTab === 'reservations' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={reservationSearch}
                    onChange={(e) => {
                      setReservationSearch(e.target.value);
                      setReservationPage(1);
                    }}
                    placeholder="Search by Order #, SKU, or Customer..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 placeholder-slate-400"
                  />
                </div>

                <select
                  value={reservationStatus}
                  onChange={(e) => {
                    setReservationStatus(e.target.value);
                    setReservationPage(1);
                  }}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All Reservation Statuses</option>
                  <option value="ACTIVE">ACTIVE (Holds & Committed)</option>
                  <option value="RELEASED">RELEASED (Expired/Cancelled)</option>
                  <option value="FULFILLED">FULFILLED (Dispatched)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => expireMutation.mutate()}
                    isLoading={expireMutation.isPending}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Run Sweep
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchReservations()}
                  title="Refresh reservations"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            {isLoadingReservations ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : isReservationsError ? (
              <div className="p-6">
                <ErrorMessage
                  title="Failed to Load Reservations"
                  message={(reservationsError as any)?.response?.data?.error?.message || 'Error fetching reservations.'}
                  onRetry={() => refetchReservations()}
                />
              </div>
            ) : !reservationsData?.reservations || reservationsData.reservations.length === 0 ? (
              <EmptyState
                icon={<Lock className="w-8 h-8 text-slate-400" />}
                title="No Active Reservations"
                description="Stock reservations allocated during checkout or held for paid orders will appear here."
                className="border-none"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Product / SKU</th>
                      <th className="py-3 px-4">Warehouse</th>
                      <th className="py-3 px-4 text-right">Reserved Qty</th>
                      <th className="py-3 px-4">Allocation State</th>
                      <th className="py-3 px-4">Order Status</th>
                      <th className="py-3 px-4 text-right">Created / Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reservationsData.reservations.map((res: InventoryReservationRecord) => {
                      let stateBadge = <Badge variant="neutral" size="sm">{res.status}</Badge>;

                      if (res.isPaid && res.status === 'ACTIVE') {
                        stateBadge = (
                          <Badge variant="success" size="sm">
                            Committed (Paid)
                          </Badge>
                        );
                      } else if (res.isExpired) {
                        stateBadge = (
                          <Badge variant="danger" size="sm">
                            Expired Hold
                          </Badge>
                        );
                      } else if (res.status === 'ACTIVE') {
                        stateBadge = (
                          <Badge variant="brand" size="sm">
                            Active Hold
                          </Badge>
                        );
                      } else if (res.status === 'FULFILLED') {
                        stateBadge = (
                          <Badge variant="purple" size="sm">
                            Fulfilled
                          </Badge>
                        );
                      } else if (res.status === 'RELEASED') {
                        stateBadge = (
                          <Badge variant="neutral" size="sm">
                            Released
                          </Badge>
                        );
                      }

                      return (
                        <tr key={res.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-brand-600">
                            {res.order?.orderNumber || res.orderId.slice(0, 8)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{res.product?.name || 'Item'}</div>
                            <div className="font-mono text-[11px] text-slate-500">{res.product?.sku}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            [{res.warehouse?.code || 'WH'}] {res.warehouse?.name}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {res.quantity.toLocaleString()} units
                          </td>
                          <td className="py-3 px-4">{stateBadge}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {res.order?.status || 'PENDING'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px]">
                            <div>Created: {new Date(res.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            {res.isPaid ? (
                              <div className="text-emerald-600 font-sans text-[10px] font-medium">Secured for Fulfilment</div>
                            ) : (
                              <div className="text-slate-400">Exp: {new Date(res.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {reservationsData?.pagination && reservationsData.pagination.totalRecords > 0 && (
              <Pagination
                currentPage={reservationsData.pagination.page}
                totalPages={reservationsData.pagination.totalPages}
                totalRecords={reservationsData.pagination.totalRecords}
                limit={reservationsData.pagination.limit}
                onPageChange={(page) => setReservationPage(page)}
              />
            )}
          </Card>
        </div>
      )}

      {/* Restock Modal */}
      <RestockModal
        isOpen={isRestockModalOpen}
        onClose={() => {
          setIsRestockModalOpen(false);
          setRestockProduct(undefined);
          setRestockWarehouse(undefined);
        }}
        defaultProductId={restockProduct}
        defaultWarehouseId={restockWarehouse}
        onSuccess={(result) => {
          setToastMessage(
            `Restock completed: Added ${result.quantityOnHand - (result.quantityAvailable + result.quantityReserved - result.quantityOnHand > 0 ? 0 : 0)} units successfully.`
          );
          setTimeout(() => setToastMessage(null), 5000);
          refetchStock();
          refetchMetrics();
        }}
      />

      {/* Threshold Management Modal */}
      <ThresholdManagementModal
        isOpen={isThresholdModalOpen}
        onClose={() => setIsThresholdModalOpen(false)}
        onSuccessToast={(msg) => {
          setToastMessage(msg);
          setTimeout(() => setToastMessage(null), 5000);
          refetchThresholds();
          refetchStock();
          refetchMetrics();
        }}
      />
    </div>
  );
}
export default InventoryPage;
