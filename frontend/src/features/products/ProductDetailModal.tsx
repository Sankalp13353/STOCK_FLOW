import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Product } from '../../types';
import { fetchProductInventory } from '../../api/products';
import { formatCurrencyCents, formatDate, formatNumber } from '../../utils/formatters';
import { Warehouse, Boxes, ShieldCheck, Clock } from 'lucide-react';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onEdit?: (product: Product) => void;
  isAdmin?: boolean;
}

export function ProductDetailModal({
  isOpen,
  onClose,
  product,
  onEdit,
  isAdmin = false,
}: ProductDetailModalProps) {
  const {
    data: inventory,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['product-inventory', product?.id],
    queryFn: () => (product?.id ? fetchProductInventory(product.id) : null),
    enabled: Boolean(isOpen && product?.id),
    staleTime: 10 * 1000,
  });

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>{product.name}</span>
          <Badge variant={product.isActive ? 'success' : 'neutral'} size="sm">
            {product.isActive ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        </div>
      }
      subtitle={`SKU: ${product.sku} • StockFlow Master Catalog`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-400">
            Created on {formatDate(product.createdAt)}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(product);
                }}
              >
                Edit Product
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Core Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
              SKU
            </span>
            <p className="font-mono text-sm font-semibold text-slate-900 mt-0.5">
              {product.sku}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
              Unit Price
            </span>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {formatCurrencyCents(product.priceCents)}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
              Status
            </span>
            <div className="mt-0.5">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  product.isActive ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    product.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
                {product.isActive ? 'Active for Orders' : 'Catalog Inactive'}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
              Last Updated
            </span>
            <p className="text-xs text-slate-600 mt-0.5">{formatDate(product.updatedAt)}</p>
          </div>
        </div>

        {/* Product Description */}
        {product.description && (
          <div>
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description & Specifications
            </h4>
            <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
              {product.description}
            </div>
          </div>
        )}

        {/* Real-time Inventory Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Multi-Warehouse Stock Allocation
              </h4>
              <p className="text-xs text-slate-500">
                Aggregated live stock from regional distribution centers
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-xs h-7 px-2"
            >
              Refresh Stock
            </Button>
          </div>

          {isLoading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" message="Loading warehouse stock breakdown..." />
            </div>
          ) : error ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              Failed to load inventory stock breakdown.
            </div>
          ) : inventory ? (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-lg">
                  <div className="flex items-center gap-1.5 text-blue-700 text-xs font-medium">
                    <Boxes className="w-3.5 h-3.5" />
                    <span>Total On-Hand</span>
                  </div>
                  <p className="text-lg font-bold text-blue-950 mt-1">
                    {formatNumber(inventory.totalOnHand)}
                  </p>
                  <span className="text-[10px] text-blue-600">Physical inventory stored</span>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-lg">
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Reserved</span>
                  </div>
                  <p className="text-lg font-bold text-amber-950 mt-1">
                    {formatNumber(inventory.totalReserved)}
                  </p>
                  <span className="text-[10px] text-amber-600">Locked in checkout/orders</span>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-lg">
                  <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Available</span>
                  </div>
                  <p className="text-lg font-bold text-emerald-950 mt-1">
                    {formatNumber(inventory.totalAvailable)}
                  </p>
                  <span className="text-[10px] text-emerald-600">Free to promise</span>
                </div>
              </div>

              {/* Warehouse Details Table */}
              {inventory.breakdown.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200/80 rounded-lg text-center">
                  <Warehouse className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-700">No stock allocations yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    This product has not been received or stocked into any warehouse facility.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3.5 py-2.5">Warehouse</th>
                        <th className="px-3.5 py-2.5 text-right">On-Hand</th>
                        <th className="px-3.5 py-2.5 text-right">Reserved</th>
                        <th className="px-3.5 py-2.5 text-right font-bold text-emerald-800">
                          Available
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-mono">
                      {inventory.breakdown.map((wh) => (
                        <tr key={wh.warehouseId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-2.5 font-sans font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100">
                                {wh.warehouseCode}
                              </span>
                              <span className="text-xs text-slate-700">{wh.warehouseName}</span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-slate-700">
                            {formatNumber(wh.quantityOnHand)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-amber-700">
                            {formatNumber(wh.quantityReserved)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-bold text-emerald-700">
                            {formatNumber(wh.quantityAvailable)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
