import { OrderSummary } from '../../types/dashboard';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrencyCents, formatDate, formatShortId } from '../../utils/formatters';
import { ShoppingCart } from 'lucide-react';

interface RecentOrdersListProps {
  orders: OrderSummary[];
  isLoading?: boolean;
}

export function RecentOrdersList({ orders, isLoading }: RecentOrdersListProps) {
  const getStatusBadgeVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'CONFIRMED':
      case 'SHIPPED':
      case 'DELIVERED':
        return 'success';
      case 'PENDING':
      case 'PAYMENT_PENDING':
      case 'RESERVED':
      case 'PROCESSING':
        return 'warning';
      case 'CANCELLED':
      case 'PAYMENT_FAILED':
      case 'RESERVATION_EXPIRED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader
        title="Recent Orders"
        subtitle="Latest customer orders submitted to the system."
      />
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="w-6 h-6 text-slate-400" />}
            title="No Orders Found"
            description="No recent orders have been submitted. As customer orders arrive, they will appear here in real time."
            className="py-12 border-none rounded-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {formatShortId(order.id)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={getStatusBadgeVariant(order.status)} size="sm">
                        {order.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[160px] truncate" title={order.shippingAddress}>
                      {order.shippingAddress}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-900">
                      {formatCurrencyCents(order.totalAmountCents)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

