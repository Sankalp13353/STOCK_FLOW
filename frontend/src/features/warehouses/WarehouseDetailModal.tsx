import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Warehouse } from '../../types';
import { fetchWarehouseInventory } from '../../api/warehouses';
import { formatCurrencyCents, formatDate, formatNumber } from '../../utils/formatters';
import {
  Warehouse as WarehouseIcon,
  MapPin,
  Package,
  Boxes,
  ShieldCheck,
  Clock,
  Info,
} from 'lucide-react';

interface WarehouseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: Warehouse | null;
}

export function WarehouseDetailModal({
  isOpen,
  onClose,
  warehouse,
}: WarehouseDetailModalProps) {
  const {
    data: items,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['warehouse-inventory', warehouse?.id],
    queryFn: () => (warehouse?.id ? fetchWarehouseInventory(warehouse.id) : []),
    enabled: Boolean(isOpen && warehouse?.id),
    staleTime: 10 * 1000,
  });

  if (!warehouse) return null;

  const totalOnHand = items?.reduce((sum, item) => sum + item.quantityOnHand, 0) ?? 0;
  const totalReserved = items?.reduce((sum, item) => sum + item.quantityReserved, 0) ?? 0;
  const totalAvailable = items?.reduce((sum, item) => sum + item.quantityAvailable, 0) ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>{warehouse.name}</span>
          <Badge variant={warehouse.isActive ? 'success' : 'neutral'} size="sm">
            {warehouse.isActive ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        </div>
      }
      subtitle={`Facility Code: ${warehouse.code} • Regional Fulfillment Node`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-400">
            Registered on {formatDate(warehouse.createdAt)}
          </div>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Warehouse Physical Address Card */}
        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white border border-slate-200 rounded-lg text-brand-600 shrink-0">
              <WarehouseIcon className="w-5 h-5" />
            </div>
            <div className="space-y-0.5 flex-1">
              <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                Facility Location
              </span>
              <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {warehouse.address}, {warehouse.city}, {warehouse.country}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200/60 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Code</span>
              <p className="font-mono font-bold text-brand-700">{warehouse.code}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Status</span>
              <p className="font-medium text-slate-800">
                {warehouse.isActive ? 'Accepting Operations' : 'Facility Suspended'}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Facility ID</span>
              <p className="font-mono text-[11px] text-slate-500 truncate" title={warehouse.id}>
                {warehouse.id}
              </p>
            </div>
          </div>
        </div>

        {/* Stock Breakdown Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Current Inventory Stored On-Site
              </h4>
              <p className="text-xs text-slate-500">
                Physical item balances and active reservation locks
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-xs h-7 px-2"
            >
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" message="Loading warehouse inventory balances..." />
            </div>
          ) : error ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              Failed to load inventory records for this warehouse.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-slate-600 text-xs font-medium">
                    <Package className="w-3.5 h-3.5 text-slate-500" />
                    <span>Catalog SKUs</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    {formatNumber(items?.length ?? 0)}
                  </p>
                  <span className="text-[10px] text-slate-400">Distinct products</span>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-lg">
                  <div className="flex items-center gap-1.5 text-blue-700 text-xs font-medium">
                    <Boxes className="w-3.5 h-3.5" />
                    <span>On-Hand</span>
                  </div>
                  <p className="text-lg font-bold text-blue-950 mt-1">
                    {formatNumber(totalOnHand)}
                  </p>
                  <span className="text-[10px] text-blue-600">Physical stock count</span>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-lg">
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Reserved</span>
                  </div>
                  <p className="text-lg font-bold text-amber-950 mt-1">
                    {formatNumber(totalReserved)}
                  </p>
                  <span className="text-[10px] text-amber-600">Order commitments</span>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-lg">
                  <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Available</span>
                  </div>
                  <p className="text-lg font-bold text-emerald-950 mt-1">
                    {formatNumber(totalAvailable)}
                  </p>
                  <span className="text-[10px] text-emerald-600">Fulfillable units</span>
                </div>
              </div>

              {/* Items Table */}
              {!items || items.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200/80 rounded-lg text-center">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-700">No stock stored in this facility</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    This warehouse currently holds zero inventory units.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3.5 py-2.5">SKU & Product</th>
                        <th className="px-3.5 py-2.5 text-right">Unit Price</th>
                        <th className="px-3.5 py-2.5 text-right">On-Hand</th>
                        <th className="px-3.5 py-2.5 text-right">Reserved</th>
                        <th className="px-3.5 py-2.5 text-right font-bold text-emerald-800">
                          Available
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-mono">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-2.5 font-sans font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100">
                                {item.product?.sku ?? 'UNKNOWN'}
                              </span>
                              <span className="text-xs text-slate-700">
                                {item.product?.name ?? item.productId}
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-slate-600">
                            {item.product?.priceCents !== undefined
                              ? formatCurrencyCents(item.product.priceCents)
                              : '—'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-slate-700">
                            {formatNumber(item.quantityOnHand)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-amber-700">
                            {formatNumber(item.quantityReserved)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-bold text-emerald-700">
                            {formatNumber(item.quantityAvailable)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Architectural Immuntability Notice */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-[11px] text-slate-500">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            <strong>Facility Immutability:</strong> Warehouse definitions are permanent and immutable
            by design in StockFlow to preserve historical ledger movements, stock tracking, and
            distributed transaction audit trails.
          </p>
        </div>
      </div>
    </Modal>
  );
}

