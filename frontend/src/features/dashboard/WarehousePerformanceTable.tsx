import { Warehouse as WarehouseIcon, AlertTriangle, Send, Ticket } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { WarehousePerformanceItem } from '../../types/analytics';
import { formatNumber } from '../../utils/formatters';

interface WarehousePerformanceTableProps {
  warehouses: WarehousePerformanceItem[];
  selectedWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string | null) => void;
  isLoading?: boolean;
}

export function WarehousePerformanceTable({
  warehouses,
  selectedWarehouseId,
  onSelectWarehouse,
  isLoading = false,
}: WarehousePerformanceTableProps) {
  return (
    <Card className="flex flex-col border-slate-200">
      <CardHeader
        title={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold text-slate-900 text-sm">
                Multi-Warehouse Facility Performance & Workload
              </span>
              <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                Comparative stock levels, fulfillment throughput, and operational bottleneck indicators across facilities.
              </p>
            </div>
            {selectedWarehouseId && (
              <button
                onClick={() => onSelectWarehouse(null)}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold underline self-start sm:self-auto cursor-pointer"
              >
                Clear Warehouse Filter (View All)
              </button>
            )}
          </div>
        }
      />
      <CardContent className="flex-1 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Facility Code & Name</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Physical On Hand</th>
                <th className="py-3 px-4 text-right">Reserved</th>
                <th className="py-3 px-4 text-right">Available</th>
                <th className="py-3 px-4 text-right">Orders Handled</th>
                <th className="py-3 px-4 text-right">Units Dispatched</th>
                <th className="py-3 px-4 text-center">Low-Stock SKUs</th>
                <th className="py-3 px-4 text-center">Active Tickets</th>
                <th className="py-3 px-4 text-center">Scope Filter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={10} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : warehouses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    No accessible warehouses found.
                  </td>
                </tr>
              ) : (
                warehouses.map((wh) => {
                  const isSelected = selectedWarehouseId === wh.warehouseId;
                  return (
                    <tr
                      key={wh.warehouseId}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-brand-50/40 font-medium' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-md ${
                              isSelected
                                ? 'bg-brand-100 text-brand-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <WarehouseIcon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{wh.warehouseCode}</span>
                            <span className="text-[11px] text-slate-500">{wh.warehouseName}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {wh.city}, {wh.country}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatNumber(wh.inventoryOnHand)}
                      </td>

                      <td className="py-3 px-4 text-right text-amber-600 font-medium">
                        {formatNumber(wh.inventoryReserved)}
                      </td>

                      <td className="py-3 px-4 text-right text-emerald-600 font-semibold">
                        {formatNumber(wh.inventoryAvailable)}
                      </td>

                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {formatNumber(wh.ordersFulfilledCount)}
                      </td>

                      <td className="py-3 px-4 text-right font-medium text-blue-600">
                        <span className="inline-flex items-center gap-0.5">
                          <Send className="w-3 h-3 text-blue-400" />
                          {formatNumber(wh.dispatchedVolume)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {wh.lowStockCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            {wh.lowStockCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {wh.activeTicketsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                            <Ticket className="w-3 h-3" />
                            {wh.activeTicketsCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() =>
                            onSelectWarehouse(isSelected ? null : wh.warehouseId)
                          }
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Filtered' : 'Filter Scope'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
