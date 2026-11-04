import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, WarehouseInventoryItem } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatNumber } from '../../utils/formatters';
import { fetchThresholds } from '../../api/inventory';
import {
  Warehouse as WarehouseIcon,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
} from 'lucide-react';

interface MultiWarehouseOverviewProps {
  warehouses: Warehouse[];
  allInventory: WarehouseInventoryItem[];
  isLoading: boolean;
  selectedWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string) => void;
}

interface WarehouseAggregate {
  warehouse: Warehouse;
  skuCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export function MultiWarehouseOverview({
  warehouses,
  allInventory,
  isLoading,
  selectedWarehouseId,
  onSelectWarehouse,
}: MultiWarehouseOverviewProps) {
  // Fetch configured thresholds to determine actual low-stock status
  const { data: thresholds = [] } = useQuery({
    queryKey: ['thresholds'],
    queryFn: () => fetchThresholds(),
    staleTime: 30 * 1000,
  });

  // Aggregate inventory by warehouseId
  const warehouseAggregates = useMemo<WarehouseAggregate[]>(() => {
    const invByWh = new Map<string, WarehouseInventoryItem[]>();
    for (const item of allInventory) {
      const whId = item.warehouseId;
      if (!invByWh.has(whId)) {
        invByWh.set(whId, []);
      }
      invByWh.get(whId)!.push(item);
    }

    // Index thresholds by warehouse-override and global default
    const whThresholdMap = new Map<string, number>();
    const globalThresholdMap = new Map<string, number>();
    for (const t of thresholds) {
      if (t.warehouseId) {
        whThresholdMap.set(`${t.productId}:${t.warehouseId}`, t.minQuantity);
      } else {
        globalThresholdMap.set(t.productId, t.minQuantity);
      }
    }

    return warehouses.map((wh) => {
      const items = invByWh.get(wh.id) || [];
      const totalOnHand = items.reduce((sum, i) => sum + (i.quantityOnHand || 0), 0);
      const totalReserved = items.reduce((sum, i) => sum + (i.quantityReserved || 0), 0);
      const totalAvailable = items.reduce((sum, i) => sum + (i.quantityAvailable || 0), 0);

      const lowStockCount = items.filter((i) => {
        if (i.quantityAvailable <= 0) return false;
        const th = whThresholdMap.get(`${i.productId}:${wh.id}`) ?? globalThresholdMap.get(i.productId);
        return th !== undefined ? i.quantityAvailable < th : false;
      }).length;
      const outOfStockCount = items.filter((i) => i.quantityAvailable <= 0).length;

      return {
        warehouse: wh,
        skuCount: items.length,
        totalOnHand,
        totalReserved,
        totalAvailable,
        lowStockCount,
        outOfStockCount,
      };
    });
  }, [warehouses, allInventory, thresholds]);

  // Overall multi-facility totals
  const overallTotals = useMemo(() => {
    return warehouseAggregates.reduce(
      (acc, curr) => {
        acc.onHand += curr.totalOnHand;
        acc.reserved += curr.totalReserved;
        acc.available += curr.totalAvailable;
        acc.skus += curr.skuCount;
        return acc;
      },
      { onHand: 0, reserved: 0, available: 0, skus: 0 }
    );
  }, [warehouseAggregates]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="h-6 w-48 bg-slate-200 animate-pulse rounded" />
        <div className="h-32 w-full bg-slate-100 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (warehouses.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
      {/* Header Bar */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-bold text-slate-900">Multi-Warehouse Oversight</h3>
            <span className="text-xs bg-brand-50 text-brand-700 font-semibold px-2 py-0.5 rounded-full border border-brand-200">
              {warehouses.length} {warehouses.length === 1 ? 'Facility' : 'Facilities'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Aggregated distribution health, stock reserves, and operational alerts across all assigned facilities.
          </p>
        </div>

        {/* Aggregate Mini Metrics */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Total On-Hand</span>
            <span className="font-bold text-slate-900 text-sm">{formatNumber(overallTotals.onHand)}</span>
          </div>
          <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Total Reserved</span>
            <span className="font-bold text-amber-700 text-sm">{formatNumber(overallTotals.reserved)}</span>
          </div>
          <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-slate-500 text-[10px] block uppercase font-sans">Total Available</span>
            <span className="font-bold text-emerald-700 text-sm">{formatNumber(overallTotals.available)}</span>
          </div>
        </div>
      </div>

      {/* Facilities Comparative Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
          <thead className="bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-5 py-3.5">Facility Code & Name</th>
              <th className="px-4 py-3.5">Location</th>
              <th className="px-4 py-3.5 text-center">Status</th>
              <th className="px-4 py-3.5 text-right">SKUs</th>
              <th className="px-4 py-3.5 text-right">On-Hand</th>
              <th className="px-4 py-3.5 text-right">Reserved</th>
              <th className="px-4 py-3.5 text-right">Available</th>
              <th className="px-4 py-3.5 text-center">Operational Alert</th>
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {warehouseAggregates.map((row) => {
              const wh = row.warehouse;
              const isSelected = wh.id === selectedWarehouseId;
              const hasCritical = row.outOfStockCount > 0;
              const hasWarning = !hasCritical && row.lowStockCount > 0;

              return (
                <tr
                  key={wh.id}
                  className={`transition-colors ${
                    isSelected ? 'bg-brand-50/50 hover:bg-brand-50/80 font-medium' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <WarehouseIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-900 truncate">
                          {wh.code}
                        </span>
                        <span className="text-xs text-slate-600 truncate">{wh.name}</span>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5 text-slate-600 truncate max-w-xs">
                    {wh.city}, {wh.country}
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <Badge variant={wh.isActive ? 'success' : 'neutral'} size="sm">
                      {wh.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </td>

                  <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                    {formatNumber(row.skuCount)}
                  </td>

                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">
                    {formatNumber(row.totalOnHand)}
                  </td>

                  <td className="px-4 py-3.5 text-right font-mono text-amber-700 font-medium">
                    {formatNumber(row.totalReserved)}
                  </td>

                  <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">
                    {formatNumber(row.totalAvailable)}
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    {hasCritical ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {row.outOfStockCount} Out of Stock
                      </span>
                    ) : hasWarning ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {row.lowStockCount} Low Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        Optimal
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    {isSelected ? (
                      <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wide">
                        Active
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectWarehouse(wh.id)}
                        className="h-7 px-2.5 text-xs text-brand-600 hover:text-brand-700 hover:border-brand-300"
                        rightIcon={<ArrowRight className="w-3 h-3" />}
                      >
                        Inspect
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
