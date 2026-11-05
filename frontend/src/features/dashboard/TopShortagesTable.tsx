import { Link } from 'react-router-dom';
import { Ticket, ArrowRight, Package } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { TopShortageItem } from '../../types/analytics';
import { formatNumber } from '../../utils/formatters';

interface TopShortagesTableProps {
  shortages: TopShortageItem[];
  isLoading?: boolean;
}

export function TopShortagesTable({ shortages, isLoading = false }: TopShortagesTableProps) {
  return (
    <Card className="flex flex-col border-slate-200">
      <CardHeader
        title={
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 text-sm">
                Priority Inventory Shortages & Stock Deficits
              </span>
              <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                Products with the highest unfulfilled shortage volume and low-stock threshold deficits.
              </p>
            </div>
            <Link
              to="/inventory"
              className="text-xs text-brand-600 hover:text-brand-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Stock</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        }
      />
      <CardContent className="flex-1 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Product SKU & Name</th>
                <th className="py-3 px-4 text-right">Shortage / Deficit Units</th>
                <th className="py-3 px-4 text-center">Affected Orders</th>
                <th className="py-3 px-4 text-center">Shortage Tickets</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : shortages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No active product shortages or threshold deficits recorded.
                  </td>
                </tr>
              ) : (
                shortages.map((item) => (
                  <tr key={item.productId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-rose-50 text-rose-600 border border-rose-100">
                          <Package className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">{item.sku}</span>
                          <span className="text-[11px] text-slate-500">{item.name}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      -{formatNumber(item.totalShortageQuantity)} units
                    </td>

                    <td className="py-3 px-4 text-center">
                      {item.affectedOrdersCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          {item.affectedOrdersCount} orders
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {item.activeTicketsCount > 0 ? (
                        <Link
                          to="/tickets"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
                        >
                          <Ticket className="w-3 h-3" />
                          <span>{item.activeTicketsCount} tickets</span>
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-[11px]">0</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/inventory?search=${encodeURIComponent(item.sku)}`}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-100 hover:bg-brand-50 hover:text-brand-600 text-slate-700 transition-colors inline-block"
                      >
                        Restock SKU
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
