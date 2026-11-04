import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Plus,
  MapPin,
  Sliders,
} from 'lucide-react';
import { Warehouse, WarehouseInventoryItem, UserRole } from '../../types';
import { StatCard } from './StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { formatCurrencyCents, formatNumber } from '../../utils/formatters';
import { fetchThresholds } from '../../api/inventory';

interface SelectedWarehouseOverviewProps {
  warehouse: Warehouse;
  inventory: WarehouseInventoryItem[];
  isLoading: boolean;
  userRole?: UserRole;
  onRefresh: () => void;
  onOpenRestock: (productId?: string) => void;
  onExpireReservations: () => void;
  isExpiringReservations: boolean;
  onOpenThresholds?: () => void;
}

export function SelectedWarehouseOverview({
  warehouse,
  inventory,
  isLoading,
  userRole,
  onRefresh,
  onOpenRestock,
  onExpireReservations,
  isExpiringReservations,
  onOpenThresholds,
}: SelectedWarehouseOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'low' | 'out'>('all');

  const isAdmin = userRole === 'ADMIN';
  const isManager = userRole === 'WAREHOUSE_MANAGER';

  // Fetch thresholds for this warehouse to evaluate true minimum stock thresholds
  const { data: thresholds = [] } = useQuery({
    queryKey: ['thresholds'],
    queryFn: () => fetchThresholds(),
    staleTime: 30 * 1000,
  });

  // Map threshold per product: warehouse override takes priority over global default
  const thresholdMap = useMemo(() => {
    const map = new Map<string, { minQuantity: number; isOverride: boolean }>();
    for (const t of thresholds) {
      if (t.warehouseId === warehouse.id) {
        // Warehouse override
        map.set(t.productId, { minQuantity: t.minQuantity, isOverride: true });
      } else if (!t.warehouseId && !map.has(t.productId)) {
        // Global default fallback
        map.set(t.productId, { minQuantity: t.minQuantity, isOverride: false });
      }
    }
    return map;
  }, [thresholds, warehouse.id]);

  // Compute metrics from real backend responses
  const totalSKUs = inventory.length;
  const totalOnHand = inventory.reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
  const totalReserved = inventory.reduce((sum, item) => sum + (item.quantityReserved || 0), 0);
  const totalAvailable = inventory.reduce((sum, item) => sum + (item.quantityAvailable || 0), 0);

  // Identify low stock items based on configured thresholds (or available <= 0 for out of stock)
  const lowStockItems = useMemo(() => {
    return inventory.filter((item) => {
      if (item.quantityAvailable <= 0) return false;
      const th = thresholdMap.get(item.productId);
      return th !== undefined ? item.quantityAvailable < th.minQuantity : false;
    });
  }, [inventory, thresholdMap]);

  const outOfStockItems = useMemo(() => {
    return inventory.filter((item) => item.quantityAvailable <= 0);
  }, [inventory]);

  // Filtered inventory list for the table
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const sku = item.product?.sku?.toLowerCase() || '';
      const name = item.product?.name?.toLowerCase() || '';
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || sku.includes(q) || name.includes(q);

      if (!matchesSearch) return false;

      if (filterMode === 'low') {
        const th = thresholdMap.get(item.productId);
        return item.quantityAvailable > 0 && th !== undefined && item.quantityAvailable < th.minQuantity;
      }
      if (filterMode === 'out') return item.quantityAvailable <= 0;
      return true;
    });
  }, [inventory, searchQuery, filterMode, thresholdMap]);

  return (
    <div className="space-y-6">
      {/* Selected Facility Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-base font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                {warehouse.code}
              </span>
              <h2 className="text-lg font-bold text-slate-900">{warehouse.name}</h2>
              <Badge variant={warehouse.isActive ? 'success' : 'neutral'} size="sm">
                {warehouse.isActive ? 'ACTIVE FACILITY' : 'INACTIVE'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {warehouse.address}, {warehouse.city}, {warehouse.country}
              </span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              isLoading={isLoading}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh Stock
            </Button>

            {/* Expire Reservations: Restricted to ADMIN administrative manual sweep */}
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={onExpireReservations}
                isLoading={isExpiringReservations}
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                leftIcon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
                title="Trigger automated sweep of stale unconfirmed stock reservations across warehouses"
              >
                Expire Reservations
              </Button>
            )}

            {/* Stock Thresholds: Available to ADMIN and WAREHOUSE_MANAGER */}
            {(isAdmin || isManager) && onOpenThresholds && (
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenThresholds}
                className="text-purple-700 border-purple-300 hover:bg-purple-50"
                leftIcon={<Sliders className="w-3.5 h-3.5 text-purple-600" />}
                title="Configure minimum stock thresholds and reorder points"
              >
                Stock Thresholds
              </Button>
            )}

            {/* Restock Inventory: Available to ADMIN, WAREHOUSE_MANAGER, and WAREHOUSE_STAFF */}
            <Button
              size="sm"
              variant="primary"
              onClick={() => onOpenRestock()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Restock Facility
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Product SKUs"
          value={totalSKUs}
          subtitle="Catalog lines at this facility"
          icon={<Package className="w-5 h-5 text-blue-600" />}
          iconBgColor="bg-blue-50 text-blue-600 border-blue-100"
          isLoading={isLoading}
        />
        <StatCard
          title="On-Hand Units"
          value={totalOnHand}
          subtitle="Total physical stock on-hand"
          icon={<Boxes className="w-5 h-5 text-indigo-600" />}
          iconBgColor="bg-indigo-50 text-indigo-600 border-indigo-100"
          isLoading={isLoading}
        />
        <StatCard
          title="Reserved Units"
          value={totalReserved}
          subtitle="Committed to pending orders"
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          iconBgColor="bg-amber-50 text-amber-600 border-amber-100"
          isLoading={isLoading}
        />
        <StatCard
          title="Available Units"
          value={totalAvailable}
          subtitle="Immediately pickable inventory"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          iconBgColor="bg-emerald-50 text-emerald-600 border-emerald-100"
          isLoading={isLoading}
        />
      </div>

      {/* Operational Alert Banners */}
      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-sm">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">Inventory Replenishment Notice:</span>{' '}
              {outOfStockItems.length > 0 && (
                <span className="font-semibold text-rose-700">
                  {outOfStockItems.length} SKU{outOfStockItems.length > 1 ? 's are' : ' is'} out of stock.{' '}
                </span>
              )}
              {lowStockItems.length > 0 && (
                <span>
                  {lowStockItems.length} SKU{lowStockItems.length > 1 ? 's have' : ' has'} available stock below configured minimum threshold.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setFilterMode(filterMode === 'all' ? 'low' : 'all')}
              className="text-xs font-semibold text-amber-800 underline hover:text-amber-900"
            >
              {filterMode === 'all' ? 'Filter Low Stock' : 'Show All SKUs'}
            </button>
          </div>
        </div>
      )}

      {/* Facility Inventory Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Facility Inventory by SKU</h3>
            <p className="text-xs text-slate-500">
              Live stock counts stored at {warehouse.code} ({warehouse.name})
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by SKU or name..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({inventory.length})
              </button>
              <button
                onClick={() => setFilterMode('low')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  filterMode === 'low'
                    ? 'bg-white text-amber-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Low ({lowStockItems.length})
              </button>
              <button
                onClick={() => setFilterMode('out')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  filterMode === 'out'
                    ? 'bg-white text-rose-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Out ({outOfStockItems.length})
              </button>
            </div>
          </div>
        </div>

        {/* Table Body */}
        {filteredInventory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-700">No inventory records found</p>
            <p className="text-slate-500 mt-0.5">
              {searchQuery || filterMode !== 'all'
                ? 'No items match your filter criteria.'
                : 'This warehouse currently has 0 inventory SKUs allocated.'}
            </p>
            {(!searchQuery && filterMode === 'all') && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => onOpenRestock()}
                className="mt-3"
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Restock First SKU
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3">Product SKU & Name</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3 text-right">On-Hand</th>
                  <th className="px-4 py-3 text-right">Reserved</th>
                  <th className="px-4 py-3 text-right">Available</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredInventory.map((item) => {
                  const isOutOfStock = item.quantityAvailable <= 0;
                  const th = thresholdMap.get(item.productId);
                  const isLowStock = !isOutOfStock && th !== undefined && item.quantityAvailable < th.minQuantity;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {item.product?.sku || 'UNKNOWN-SKU'}
                          </span>
                          <span className="text-xs text-slate-700">
                            {item.product?.name || 'Unnamed Product'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-600">
                        {item.product?.priceCents !== undefined
                          ? formatCurrencyCents(item.product.priceCents)
                          : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        {formatNumber(item.quantityOnHand)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-amber-700 font-medium">
                        {formatNumber(item.quantityReserved)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        {formatNumber(item.quantityAvailable)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {isOutOfStock ? (
                          <Badge variant="danger" size="sm">
                            OUT OF STOCK
                          </Badge>
                        ) : isLowStock ? (
                          <Badge variant="warning" size="sm">
                            LOW STOCK
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            IN STOCK
                          </Badge>
                        )}
                      </td>

                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenRestock(item.productId)}
                          className="h-7 px-2 text-xs"
                          leftIcon={<Plus className="w-3 h-3" />}
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
      </div>
    </div>
  );
}
