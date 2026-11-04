import { LowStockEvaluationItem } from '../../types/inventory';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { CheckCircle2 } from 'lucide-react';

interface LowStockListProps {
  items: Array<LowStockEvaluationItem | any>;
  isLoading?: boolean;
}

export function LowStockList({ items, isLoading }: LowStockListProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader
        title="Low Stock Alerts"
        subtitle="Inventory items with available stock below configured minimum thresholds."
      />
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />}
            title="All Stock Levels Healthy"
            description="No inventory items currently fall below critical threshold levels across any warehouse."
            className="py-12 border-none rounded-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4 text-right">Available</th>
                  <th className="py-3 px-4 text-right">Min Threshold</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const available = typeof item.availableStock === 'number' ? item.availableStock : item.quantityAvailable;
                  const isOut = available <= 0;
                  const threshold = item.thresholdQuantity;
                  const thresholdType = item.thresholdType;

                  return (
                    <tr key={item.id || `${item.productId}-${item.warehouseId}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {item.productSku || item.product?.sku || 'UNKNOWN'}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {item.productName || item.product?.name || 'Unnamed Product'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        <span className="font-mono">{item.warehouseCode || item.warehouse?.code || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {available}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {threshold !== undefined && threshold !== null ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="font-mono font-semibold text-slate-800">
                              Min: {threshold}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {thresholdType === 'WAREHOUSE_OVERRIDE'
                                ? 'Facility Override'
                                : thresholdType === 'GLOBAL_DEFAULT'
                                ? 'Global Default'
                                : 'Threshold'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono italic">Not Set</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Badge variant={isOut ? 'danger' : 'warning'} size="sm">
                          {isOut ? 'OUT OF STOCK' : 'BELOW THRESHOLD'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
