import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Pagination } from '../components/ui/Pagination';
import { fetchMyOrders } from '../api/orders';
import { formatCurrencyCents, formatDate, formatShortId } from '../utils/formatters';
import { OrderStatus } from '../types';
import {
  Package,
  ShoppingBag,
  Search,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

export function MyOrdersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['my-orders', { page }],
    queryFn: () => fetchMyOrders({ page, limit: 10 }),
    staleTime: 15 * 1000,
  });

  const getStatusBadgeVariant = (status: OrderStatus): BadgeVariant => {
    switch (status) {
      case 'CONFIRMED':
      case 'SHIPPED':
      case 'DELIVERED':
        return 'success';
      case 'PENDING':
      case 'RESERVED':
      case 'PAYMENT_PENDING':
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

  const orders = data?.orders || [];
  const pagination = data?.pagination;

  // Filter orders by status and search locally if needed
  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'ACTIVE') {
        const activeStatuses = ['PENDING', 'RESERVED', 'PAYMENT_PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'];
        if (!activeStatuses.includes(order.status)) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (order.status !== 'DELIVERED') return false;
      } else if (statusFilter === 'CANCELLED') {
        const failureStatuses = ['CANCELLED', 'PAYMENT_FAILED', 'RESERVATION_EXPIRED'];
        if (!failureStatuses.includes(order.status)) return false;
      }
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchOrderNumber = order.orderNumber.toLowerCase().includes(q);
      const matchId = order.id.toLowerCase().includes(q);
      const matchProduct = order.orderItems.some((item) =>
        item.product?.name.toLowerCase().includes(q) || item.product?.sku.toLowerCase().includes(q)
      );
      return matchOrderNumber || matchId || matchProduct;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="My Orders"
        description="Review your past purchases, verify delivery timeline, and track real-time fulfillment status."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              isLoading={isFetching}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('/products')}
              leftIcon={<ShoppingBag className="w-4 h-4" />}
            >
              Shop More
            </Button>
          </div>
        }
      />

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'All Orders', value: 'ALL' },
            { label: 'Active / In Progress', value: 'ACTIVE' },
            { label: 'Completed', value: 'COMPLETED' },
            { label: 'Cancelled / Failed', value: 'CANCELLED' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === tab.value
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by order or product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-xs text-slate-500">Loading order history...</p>
        </div>
      ) : error ? (
        <ErrorMessage
          message={(error as any)?.message || 'Failed to load order history.'}
          onRetry={() => refetch()}
        />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-8 h-8 text-slate-400" />}
          title={searchTerm || statusFilter !== 'ALL' ? 'No matching orders found' : 'No orders placed yet'}
          description={
            searchTerm || statusFilter !== 'ALL'
              ? 'Try adjusting your search criteria or status filter to find orders.'
              : 'Browse our catalog of verified wholesale inventory and place your first order today.'
          }
          actionLabel="Explore Product Catalog"
          onAction={() => navigate('/products')}
        />
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const itemCount = order.orderItems.reduce((acc, item) => acc + item.quantity, 0);

            return (
              <Card key={order.id} className="overflow-hidden hover:border-slate-300 transition-colors">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 font-mono">
                            {order.orderNumber}
                          </h3>
                          <Badge variant={getStatusBadgeVariant(order.status)} size="sm">
                            {order.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Placed {formatDate(order.createdAt)} • Ref: {formatShortId(order.id)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Total Amount</p>
                        <p className="text-sm font-bold text-slate-900">
                          {formatCurrencyCents(order.totalAmountCents)}
                        </p>
                      </div>

                      <Link
                        to={`/orders/${order.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                      >
                        Track Order
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Summary of items in the order */}
                  <div className="pt-3">
                    <p className="text-xs font-medium text-slate-600 mb-2">
                      {itemCount} {itemCount === 1 ? 'item' : 'items'} in this order:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {order.orderItems.map((item) => (
                        <div
                          key={item.id}
                          className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-1.5"
                        >
                          <span className="font-semibold text-slate-900">{item.quantity}×</span>
                          <span className="truncate max-w-[200px]">
                            {item.product?.name || item.product?.sku || 'Product Item'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {pagination && pagination.totalPages > 1 && (
            <div className="pt-4">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalRecords={pagination.totalRecords}
                limit={pagination.limit}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
