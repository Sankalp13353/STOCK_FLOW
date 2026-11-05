import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Pagination } from '../components/ui/Pagination';
import { Modal } from '../components/ui/Modal';
import { DispatchModal } from '../components/orders/DispatchModal';
import { OrderDetailModal } from '../components/orders/OrderDetailModal';
import { fetchOrders, processOrder, deliverOrder } from '../api/orders';
import { fetchWarehouses } from '../api/warehouses';
import { formatCurrencyCents, formatDate } from '../utils/formatters';
import { Order, OrderStatus } from '../types';
import { useAuth } from '../hooks/useAuth';
import {
  ShoppingCart,
  Search,
  RefreshCw,
  Building2,
  Truck,
  CheckCircle2,
  PlayCircle,
  Eye,
  AlertTriangle,
  X,
} from 'lucide-react';

const STATUS_OPTIONS: Array<{ value: OrderStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'CONFIRMED', label: 'Confirmed (Paid)' },
  { value: 'PROCESSING', label: 'Processing (Picking)' },
  { value: 'SHIPPED', label: 'Shipped (In Transit)' },
  { value: 'DELIVERED', label: 'Delivered (Complete)' },
  { value: 'PENDING', label: 'Pending (Hold)' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function OrdersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userRole = user?.role || 'ADMIN';

  // Filters state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals state
  const [selectedOrderIdForDetail, setSelectedOrderIdForDetail] = useState<string | null>(null);
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<Order | null>(null);
  const [orderToProcess, setOrderToProcess] = useState<Order | null>(null);
  const [processNotes, setProcessNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [orderToDeliver, setOrderToDeliver] = useState<Order | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isDelivering, setIsDelivering] = useState(false);

  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'danger' | 'info';
    message: string;
  } | null>(null);

  // Fetch warehouses for warehouse filter & permission boundary
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => fetchWarehouses(),
    staleTime: 60 * 1000,
  });

  const accessibleWarehouseIds = useMemo(() => {
    return warehouses.map((w) => w.id);
  }, [warehouses]);

  // Fetch orders from real backend API
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'orders',
      {
        page,
        limit,
        status: statusFilter,
        search: appliedSearch,
        warehouseId: warehouseFilter !== 'ALL' ? warehouseFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    ],
    queryFn: () =>
      fetchOrders({
        page,
        limit,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: appliedSearch || undefined,
        warehouseId: warehouseFilter !== 'ALL' ? warehouseFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    staleTime: 10 * 1000,
  });

  const orders = data?.orders || [];
  const pagination = data?.pagination;

  // Filter application handlers
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchTerm.trim());
  }

  function handleResetFilters() {
    setSearchTerm('');
    setAppliedSearch('');
    setStatusFilter('ALL');
    setWarehouseFilter('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  const hasActiveFilters = Boolean(
    appliedSearch ||
      statusFilter !== 'ALL' ||
      warehouseFilter !== 'ALL' ||
      startDate ||
      endDate
  );

  // Status Badge Mapping
  const getStatusBadgeVariant = (status: OrderStatus): BadgeVariant => {
    switch (status) {
      case 'CONFIRMED':
        return 'brand';
      case 'PROCESSING':
        return 'purple';
      case 'SHIPPED':
        return 'warning';
      case 'DELIVERED':
        return 'success';
      case 'CANCELLED':
      case 'PAYMENT_FAILED':
      case 'RESERVATION_EXPIRED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  // Quick Action: Process Order
  async function handleConfirmProcess() {
    if (!orderToProcess) return;
    setIsProcessing(true);
    setActionFeedback(null);
    try {
      await processOrder(orderToProcess.id, { notes: processNotes.trim() || undefined });
      setOrderToProcess(null);
      setProcessNotes('');
      setActionFeedback({
        type: 'success',
        message: `Order ${orderToProcess.orderNumber} moved to PROCESSING status.`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err: any) {
      setActionFeedback({
        type: 'danger',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed to transition order to processing.',
      });
    } finally {
      setIsProcessing(false);
    }
  }

  // Quick Action: Deliver Order
  async function handleConfirmDeliver() {
    if (!orderToDeliver) return;
    setIsDelivering(true);
    setActionFeedback(null);
    try {
      await deliverOrder(orderToDeliver.id, {
        deliveryNotes: deliveryNotes.trim() || undefined,
        deliveredAt: new Date().toISOString(),
      });
      setOrderToDeliver(null);
      setDeliveryNotes('');
      setActionFeedback({
        type: 'success',
        message: `Order ${orderToDeliver.orderNumber} marked as DELIVERED.`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err: any) {
      setActionFeedback({
        type: 'danger',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed to mark order as delivered.',
      });
    } finally {
      setIsDelivering(false);
    }
  }

  // Helper to extract unique warehouse allocations for an order row
  function getOrderWarehouseTags(order: Order) {
    if (!order.orderItems || order.orderItems.length === 0) return [];
    const map = new Map<string, { code: string; name: string; count: number }>();

    for (const item of order.orderItems) {
      const code = item.warehouse?.code || item.warehouseId.slice(0, 6);
      const name = item.warehouse?.name || 'Warehouse';
      if (!map.has(code)) {
        map.set(code, { code, name, count: 0 });
      }
      map.get(code)!.count += item.quantity;
    }

    return Array.from(map.values());
  }

  // Helper to check user's warehouse authorization for an order
  function isUserAuthorizedForOrder(order: Order) {
    if (userRole === 'ADMIN') return true;
    if (!order.orderItems || order.orderItems.length === 0) return true;
    return order.orderItems.some((item) => accessibleWarehouseIds.includes(item.warehouseId));
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Orders & Fulfilment Operations"
        description={
          userRole === 'ADMIN'
            ? 'Organization-wide order fulfillment, multi-warehouse dispatch control, and status tracking.'
            : 'Fulfillment operations, picking, dispatch, and delivery tracking for your assigned facilities.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              isLoading={isFetching}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Refresh Data
            </Button>
          </div>
        }
      />

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs shadow-sm animate-in fade-in duration-200 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionFeedback.type === 'danger'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionFeedback.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            {actionFeedback.type === 'danger' && (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters & Search Control Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Order #, UUID, customer name, email, SKU..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" variant="primary">
                Search
              </Button>
              {hasActiveFilters && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleResetFilters}
                  leftIcon={<X className="w-3.5 h-3.5" />}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </form>

          {/* Secondary Filter Row: Status, Warehouse, Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            {/* Status Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Order Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
                className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Warehouse Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Source Warehouse
              </label>
              <select
                value={warehouseFilter}
                onChange={(e) => {
                  setWarehouseFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
              >
                <option value="ALL">All Warehouses ({warehouses.length})</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                From Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                To Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Data Table */}
      <Card>
        <CardHeader
          title="Operational Orders"
          subtitle={
            pagination
              ? `Displaying page ${pagination.page} of ${pagination.totalPages} (${pagination.totalRecords} total orders)`
              : 'Managing order queue'
          }
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Role Scope:</span>
              <Badge variant={userRole === 'ADMIN' ? 'purple' : 'brand'} size="sm">
                {userRole.replace('_', ' ')}
              </Badge>
            </div>
          }
        />
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <LoadingSpinner size="lg" />
              <p className="mt-3 text-xs text-slate-500 font-medium">
                Querying live order repository...
              </p>
            </div>
          ) : error ? (
            <div className="p-6">
              <ErrorMessage
                message={(error as any)?.message || 'Failed to load operational orders.'}
                onRetry={() => refetch()}
              />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<ShoppingCart className="w-6 h-6" />}
                title="No Orders Found"
                description={
                  hasActiveFilters
                    ? 'No orders match your active filter criteria. Try adjusting your search term, status, or date range.'
                    : 'There are currently no orders in the system.'
                }
                actionLabel={hasActiveFilters ? 'Reset All Filters' : undefined}
                onAction={hasActiveFilters ? handleResetFilters : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Order / ID</th>
                    <th className="py-3 px-4">Placed Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Warehouse Allocations</th>
                    <th className="py-3 px-4 text-right">Items & Total</th>
                    <th className="py-3 px-4 text-center">Fulfilment Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((ord) => {
                    const warehouseTags = getOrderWarehouseTags(ord);
                    const isMulti = warehouseTags.length > 1;
                    const totalUnits =
                      ord.orderItems?.reduce((sum, it) => sum + it.quantity, 0) || 0;
                    const isAuthorized = isUserAuthorizedForOrder(ord);

                    return (
                      <tr
                        key={ord.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          !isAuthorized ? 'opacity-70 bg-slate-50/40' : ''
                        }`}
                      >
                        {/* Order Number & UUID */}
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => setSelectedOrderIdForDetail(ord.id)}
                            className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1.5"
                          >
                            <span>{ord.orderNumber}</span>
                          </button>
                          <span className="font-mono text-[11px] text-slate-400 block mt-0.5">
                            {ord.id.slice(0, 8)}...
                          </span>
                        </td>

                        {/* Creation Date */}
                        <td className="py-3.5 px-4 text-slate-600">
                          <div>{formatDate(ord.createdAt)}</div>
                        </td>

                        {/* Customer Info */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900">
                            {ord.user?.fullName || 'Customer'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {ord.user?.email || `User: ${ord.userId.slice(0, 8)}...`}
                          </div>
                        </td>

                        {/* Order Status */}
                        <td className="py-3.5 px-4">
                          <Badge variant={getStatusBadgeVariant(ord.status)}>
                            {ord.status}
                          </Badge>
                        </td>

                        {/* Warehouse Allocations */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {warehouseTags.map((tag) => (
                              <span
                                key={tag.code}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                                title={`${tag.name}: ${tag.count} unit(s)`}
                              >
                                <Building2 className="w-3 h-3 text-slate-400" />
                                {tag.code} ({tag.count})
                              </span>
                            ))}
                            {isMulti && (
                              <Badge variant="purple" size="sm">
                                Multi-WH
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Item Count & Total Amount */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-bold text-slate-900">
                            {formatCurrencyCents(ord.totalAmountCents)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {totalUnits} unit{totalUnits > 1 ? 's' : ''} ({ord.orderItems?.length || 0} SKU)
                          </div>
                        </td>

                        {/* Fulfilment Actions */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Confirmed -> Start Processing */}
                            {ord.status === 'CONFIRMED' && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => setOrderToProcess(ord)}
                                disabled={!isAuthorized}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] py-1 px-2.5"
                                leftIcon={<PlayCircle className="w-3.5 h-3.5" />}
                              >
                                Process
                              </Button>
                            )}

                            {/* Processing -> Dispatch */}
                            {ord.status === 'PROCESSING' && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => setSelectedOrderForDispatch(ord)}
                                disabled={!isAuthorized}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] py-1 px-2.5"
                                leftIcon={<Truck className="w-3.5 h-3.5" />}
                              >
                                Dispatch
                              </Button>
                            )}

                            {/* Shipped -> Deliver */}
                            {ord.status === 'SHIPPED' && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => setOrderToDeliver(ord)}
                                disabled={!isAuthorized}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] py-1 px-2.5"
                                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                              >
                                Deliver
                              </Button>
                            )}

                            {/* View Detail Modal */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedOrderIdForDetail(ord.id)}
                              className="text-slate-600 hover:text-slate-900 text-[11px] py-1 px-2"
                              title="View Order Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="p-4 border-t border-slate-200">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalRecords={pagination.totalRecords}
                limit={pagination.limit}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Process Modal */}
      <Modal
        isOpen={Boolean(orderToProcess)}
        onClose={() => setOrderToProcess(null)}
        title="Start Order Fulfilment Processing"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Move order <strong className="text-slate-900">{orderToProcess?.orderNumber}</strong> into{' '}
            <strong className="text-indigo-700">PROCESSING</strong> status. This notifies warehouse staff
            to initiate picking and packing.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Picking / Warehouse Notes (Optional)
            </label>
            <input
              type="text"
              value={processNotes}
              onChange={(e) => setProcessNotes(e.target.value)}
              placeholder="e.g. Assigned to packing station B."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOrderToProcess(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmProcess}
              isLoading={isProcessing}
              className="bg-indigo-600 hover:bg-indigo-700"
              leftIcon={<PlayCircle className="w-4 h-4" />}
            >
              Start Processing
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dispatch Modal */}
      <DispatchModal
        isOpen={Boolean(selectedOrderForDispatch)}
        onClose={() => setSelectedOrderForDispatch(null)}
        order={selectedOrderForDispatch}
        onSuccess={() => {
          setActionFeedback({
            type: 'success',
            message: `Order ${selectedOrderForDispatch?.orderNumber} has been dispatched! Physical stock was deducted.`,
          });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }}
        userRole={userRole}
        accessibleWarehouseIds={accessibleWarehouseIds}
      />

      {/* Quick Deliver Modal */}
      <Modal
        isOpen={Boolean(orderToDeliver)}
        onClose={() => setOrderToDeliver(null)}
        title="Confirm Order Delivery"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Mark order <strong className="text-slate-900">{orderToDeliver?.orderNumber}</strong> as{' '}
            <strong className="text-emerald-700">DELIVERED</strong>. This completes the fulfilment lifecycle.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Delivery Notes (Optional)
            </label>
            <input
              type="text"
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="e.g. Delivered to reception / dock."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOrderToDeliver(null)}
              disabled={isDelivering}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmDeliver}
              isLoading={isDelivering}
              className="bg-emerald-600 hover:bg-emerald-700"
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Confirm Delivery
            </Button>
          </div>
        </div>
      </Modal>

      {/* Complete Order Detail Modal */}
      <OrderDetailModal
        isOpen={Boolean(selectedOrderIdForDetail)}
        onClose={() => setSelectedOrderIdForDetail(null)}
        orderId={selectedOrderIdForDetail}
        userRole={userRole}
        accessibleWarehouseIds={accessibleWarehouseIds}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
      />
    </div>
  );
}
