import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Order, OrderStatus } from '../../types';
import { Button } from '../ui/Button';
import { Badge, BadgeVariant } from '../ui/Badge';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { DispatchModal } from './DispatchModal';
import { processOrder, deliverOrder, cancelOrder } from '../../api/orders';
import { formatCurrencyCents, formatDate } from '../../utils/formatters';
import {
  Package,
  Building2,
  Clock,
  CreditCard,
  Truck,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Check,
  Ban,
  User,
  MapPin,
  Calendar,
  Layers,
  AlertCircle,
  Copy,
} from 'lucide-react';

interface OrderDetailViewProps {
  order: Order;
  onRefresh?: () => void;
  userRole?: string;
  accessibleWarehouseIds?: string[];
  isModal?: boolean;
}

export function OrderDetailView({
  order,
  onRefresh,
  userRole = 'ADMIN',
  accessibleWarehouseIds = [],
}: OrderDetailViewProps) {
  const queryClient = useQueryClient();

  // Modal states
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Form inputs
  const [processNotes, setProcessNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Submitting states
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'danger' | 'info';
    message: string;
  } | null>(null);

  const [copiedId, setCopiedId] = useState(false);

  function copyOrderId() {
    navigator.clipboard.writeText(order.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

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

  // Group line items by warehouse for multi-warehouse view
  const warehouseAllocations = useMemo(() => {
    if (!order.orderItems) return [];
    const map = new Map<
      string,
      {
        warehouseId: string;
        warehouseName: string;
        warehouseCode: string;
        itemsCount: number;
        totalUnits: number;
        isAuthorized: boolean;
      }
    >();

    for (const item of order.orderItems) {
      const wId = item.warehouseId;
      const wName = item.warehouse?.name || 'Warehouse Facility';
      const wCode = item.warehouse?.code || wId.slice(0, 8);
      const isAuth =
        userRole === 'ADMIN' || (accessibleWarehouseIds && accessibleWarehouseIds.includes(wId));

      if (!map.has(wId)) {
        map.set(wId, {
          warehouseId: wId,
          warehouseName: wName,
          warehouseCode: wCode,
          itemsCount: 0,
          totalUnits: 0,
          isAuthorized: isAuth,
        });
      }

      const entry = map.get(wId)!;
      entry.itemsCount += 1;
      entry.totalUnits += item.quantity;
    }

    return Array.from(map.values());
  }, [order.orderItems, userRole, accessibleWarehouseIds]);

  const isMultiWarehouse = warehouseAllocations.length > 1;

  const userHasAccessToAnyWarehouse = useMemo(() => {
    if (userRole === 'ADMIN') return true;
    return warehouseAllocations.some((w) => w.isAuthorized);
  }, [userRole, warehouseAllocations]);

  // Lifecycle steps
  const steps = [
    { label: 'Order Placed', desc: 'Reserved', icon: Clock, key: 'PENDING' },
    { label: 'Payment Confirmed', desc: 'Commercial Success', icon: CreditCard, key: 'CONFIRMED' },
    { label: 'Warehouse Processing', desc: 'Picking & Packing', icon: Package, key: 'PROCESSING' },
    { label: 'Physical Dispatch', desc: 'Stock Deducted', icon: Truck, key: 'SHIPPED' },
    { label: 'Delivered', desc: 'Fulfilment Complete', icon: CheckCircle2, key: 'DELIVERED' },
  ];

  const getStepStatus = (stepKey: string) => {
    if (
      order.status === 'CANCELLED' ||
      order.status === 'PAYMENT_FAILED' ||
      order.status === 'RESERVATION_EXPIRED'
    ) {
      return 'inactive';
    }

    const rankMap: Record<string, number> = {
      PENDING: 1,
      RESERVED: 1,
      PAYMENT_PENDING: 1,
      CONFIRMED: 2,
      PROCESSING: 3,
      SHIPPED: 4,
      DELIVERED: 5,
    };

    const currentRank = rankMap[order.status] ?? 0;
    const stepRank = rankMap[stepKey] ?? 0;

    if (currentRank > stepRank) return 'completed';
    if (currentRank === stepRank) return 'current';
    return 'upcoming';
  };

  // Actions
  async function handleStartProcessing() {
    setIsProcessing(true);
    setFeedback(null);
    try {
      await processOrder(order.id, { notes: processNotes.trim() || undefined });
      setShowProcessModal(false);
      setFeedback({
        type: 'success',
        message: 'Order moved to PROCESSING status. Warehouse picking and packing initiated.',
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      onRefresh?.();
    } catch (err: any) {
      setFeedback({
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

  async function handleConfirmDeliver() {
    setIsDelivering(true);
    setFeedback(null);
    try {
      await deliverOrder(order.id, {
        deliveryNotes: deliveryNotes.trim() || undefined,
        deliveredAt: new Date().toISOString(),
      });
      setShowDeliverModal(false);
      setFeedback({
        type: 'success',
        message: 'Order successfully marked as DELIVERED.',
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      onRefresh?.();
    } catch (err: any) {
      setFeedback({
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

  async function handleConfirmCancel() {
    setIsCancelling(true);
    setFeedback(null);
    try {
      await cancelOrder(order.id, cancelReason.trim() || 'Cancelled by warehouse operator');
      setShowCancelModal(false);
      setFeedback({
        type: 'info',
        message: 'Order cancelled. Active stock reservations were released.',
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      onRefresh?.();
    } catch (err: any) {
      setFeedback({
        type: 'danger',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed to cancel order.',
      });
    } finally {
      setIsCancelling(false);
    }
  }

  const isCancellable =
    order.status === 'PENDING' ||
    order.status === 'RESERVED' ||
    order.status === 'PAYMENT_PENDING' ||
    order.status === 'CONFIRMED' ||
    order.status === 'PROCESSING';

  return (
    <div className="space-y-6">
      {/* Top Banner / Order Metadata */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold font-mono tracking-tight text-white">
                {order.orderNumber}
              </h2>
              <Badge variant={getStatusBadgeVariant(order.status)} size="md">
                {order.status}
              </Badge>
              {isMultiWarehouse && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-900/60 text-purple-200 border border-purple-700">
                  <Layers className="w-3.5 h-3.5" /> Multi-Warehouse
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-mono">
                <span>ID: {order.id.slice(0, 8)}...</span>
                <button
                  onClick={copyOrderId}
                  className="hover:text-white transition-colors"
                  title="Copy Order UUID"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {copiedId && <span className="text-[10px] text-emerald-400">Copied!</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Placed: {formatDate(order.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Operational Fulfilment Action Trigger Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {order.status === 'CONFIRMED' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowProcessModal(true)}
                disabled={!userHasAccessToAnyWarehouse}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                leftIcon={<PlayCircle className="w-4 h-4" />}
              >
                Start Processing
              </Button>
            )}

            {order.status === 'PROCESSING' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowDispatchModal(true)}
                disabled={!userHasAccessToAnyWarehouse}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                leftIcon={<Truck className="w-4 h-4" />}
              >
                Dispatch Order
              </Button>
            )}

            {order.status === 'SHIPPED' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowDeliverModal(true)}
                disabled={!userHasAccessToAnyWarehouse}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Mark as Delivered
              </Button>
            )}

            {isCancellable && userRole === 'ADMIN' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelModal(true)}
                className="border-slate-700 text-rose-300 hover:bg-rose-950/40 hover:border-rose-600"
                leftIcon={<Ban className="w-4 h-4 text-rose-400" />}
              >
                Cancel Order
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs shadow-sm animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedback.type === 'danger'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {feedback.type === 'danger' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {feedback.type === 'info' && <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Fulfilment Lifecycle Progress Stepper */}
      <Card>
        <CardHeader
          title="Fulfilment Lifecycle Progression"
          subtitle={`Current Stage: ${order.status.replace('_', ' ')}`}
          action={<Badge variant={getStatusBadgeVariant(order.status)}>{order.status}</Badge>}
        />
        <CardContent>
          <div className="relative py-4">
            <div className="hidden sm:block absolute top-1/2 left-8 right-8 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 relative z-10">
              {steps.map((s, idx) => {
                const status = getStepStatus(s.key);
                const isCompleted = status === 'completed';
                const isCurrent = status === 'current';
                const Icon = s.icon;

                return (
                  <div key={idx} className="flex sm:flex-col items-center gap-3 sm:gap-2 sm:text-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                        isCompleted
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100'
                          : 'bg-white border-slate-300 text-slate-400'
                      }`}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <div>
                      <p
                        className={`text-xs font-semibold ${
                          isCompleted
                            ? 'text-slate-900'
                            : isCurrent
                            ? 'text-indigo-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {s.label}
                      </p>
                      <p className="text-[11px] text-slate-400">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Warehouse Allocation Overview */}
      <Card>
        <CardHeader
          title="Warehouse Allocation Breakdown"
          subtitle={`Items distributed across ${warehouseAllocations.length} facility allocation(s)`}
          action={
            isMultiWarehouse ? (
              <Badge variant="purple" size="sm">
                Split Fulfilment
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Single Facility
              </Badge>
            )
          }
        />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouseAllocations.map((alloc) => (
              <div
                key={alloc.warehouseId}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  alloc.isAuthorized
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50 border-slate-200 opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {alloc.warehouseCode}
                    </span>
                    {alloc.isAuthorized ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Authorized
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Restricted Scope
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-slate-900 text-sm">{alloc.warehouseName}</h4>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Allocated Items:</span>
                  <span className="font-bold text-slate-900">
                    {alloc.totalUnits} unit{alloc.totalUnits > 1 ? 's' : ''} ({alloc.itemsCount} SKU)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: Line Items & Customer Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Order Items Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Line Items & Sourced Stock"
              subtitle={`${order.orderItems?.length || 0} unique items in this order`}
            />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Warehouse</th>
                      <th className="py-3 px-4 text-center">Quantity</th>
                      <th className="py-3 px-4 text-right">Unit Price</th>
                      <th className="py-3 px-4 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.orderItems?.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {item.product?.name || 'Stock Item'}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                            SKU: {item.product?.sku || item.productId.slice(0, 8)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            {item.warehouse?.code || item.warehouseId.slice(0, 8)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">
                          {formatCurrencyCents(item.unitPriceCents)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {formatCurrencyCents(item.subtotalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50/50 border-t border-slate-200">
                    <tr>
                      <td colSpan={4} className="py-3 px-4 text-right font-semibold text-slate-700">
                        Total Order Amount:
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-sm text-indigo-700">
                        {formatCurrencyCents(order.totalAmountCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Physical Inventory Movements Ledger (if order has movements) */}
          {order.inventoryMovements && order.inventoryMovements.length > 0 && (
            <Card>
              <CardHeader
                title="Physical Inventory Movement Ledger"
                subtitle="Immutable stock transaction audit trail recorded for this order"
              />
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4">Warehouse</th>
                        <th className="py-2.5 px-4">Product / SKU</th>
                        <th className="py-2.5 px-4 text-right">Delta</th>
                        <th className="py-2.5 px-4">Notes</th>
                        <th className="py-2.5 px-4 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.inventoryMovements.map((mov) => (
                        <tr key={mov.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4">
                            <Badge
                              variant={mov.movementType === 'DISPATCH' || mov.movementType === 'FULFILMENT_DISPATCH' ? 'purple' : 'neutral'}
                              size="sm"
                            >
                              {mov.movementType}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-800">
                            {mov.warehouse?.code || mov.warehouseId.slice(0, 8)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-slate-900">
                              {mov.product?.name || 'Item'}
                            </span>
                            <span className="block font-mono text-[10px] text-slate-400">
                              {mov.product?.sku}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-bold font-mono ${
                              mov.quantityDelta < 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate" title={mov.notes || ''}>
                            {mov.notes || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-500">
                            {formatDate(mov.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment History */}
          {order.payments && order.payments.length > 0 && (
            <Card>
              <CardHeader
                title="Commercial Payment Records"
                subtitle="Transaction settlement events recorded from payment gateway"
              />
              <CardContent className="p-0">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Method</th>
                      <th className="py-2.5 px-4">Reference</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-medium text-slate-900">{p.paymentMethod}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">{p.transactionReference}</td>
                        <td className="py-2.5 px-4">
                          <Badge variant={p.status === 'SUCCESS' ? 'success' : 'danger'} size="sm">
                            {p.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-slate-900">
                          {formatCurrencyCents(p.amountCents)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500">
                          {formatDate(p.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 1 Col: Customer & Shipping & Reservations */}
        <div className="space-y-6">
          {/* Customer & Destination Card */}
          <Card>
            <CardHeader
              title="Customer & Shipping"
              subtitle="Recipient contact and destination"
            />
            <CardContent className="space-y-4 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <User className="w-4 h-4 text-slate-500" />
                  <span>{order.user?.fullName || 'Registered Customer'}</span>
                </div>
                <div className="text-slate-600 pl-6">
                  <p>{order.user?.email || 'Customer Email Protected'}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    User UUID: {order.userId.slice(0, 12)}...
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <span>Delivery Address</span>
                </div>
                <p className="text-slate-700 whitespace-pre-line leading-relaxed pl-6">
                  {order.shippingAddress}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Reservation Status Card */}
          {order.inventoryReservations && order.inventoryReservations.length > 0 && (
            <Card>
              <CardHeader
                title="Stock Reservations"
                subtitle="Active holds and committed allocations"
              />
              <CardContent className="space-y-3 text-xs">
                {order.inventoryReservations.map((res, i) => (
                  <div
                    key={res.id || i}
                    className="p-3 rounded-lg border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">{res.quantity} unit(s)</span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        Expires: {res.expiresAt ? formatDate(res.expiresAt) : 'Permanent'}
                      </span>
                    </div>
                    <Badge
                      variant={
                        res.status === 'COMMITTED'
                          ? 'success'
                          : res.status === 'ACTIVE'
                          ? 'brand'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {res.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Financial Breakdown */}
          <Card>
            <CardHeader title="Payment Overview" />
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal</span>
                <span className="font-medium text-slate-900">
                  {formatCurrencyCents(order.totalAmountCents)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Freight</span>
                <span className="text-emerald-600 font-medium">B2B Covered</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Amount</span>
                <span className="text-indigo-600">
                  {formatCurrencyCents(order.totalAmountCents)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Start Processing Modal */}
      <Modal
        isOpen={showProcessModal}
        onClose={() => setShowProcessModal(false)}
        title="Start Order Fulfilment Processing"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Transition order <strong className="text-slate-900">{order.orderNumber}</strong> to{' '}
            <strong className="text-indigo-700">PROCESSING</strong>. This notifies the assigned warehouse
            teams to begin picking, verifying, and packing the required SKUs.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Internal Picking / Packing Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={processNotes}
              onChange={(e) => setProcessNotes(e.target.value)}
              placeholder="e.g. Picking from Aisle 4, Fragile items require foam wrap."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProcessModal(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartProcessing}
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
        isOpen={showDispatchModal}
        onClose={() => setShowDispatchModal(false)}
        order={order}
        onSuccess={() => {
          setFeedback({
            type: 'success',
            message: 'Order successfully dispatched! Physical inventory was deducted from warehouse balances.',
          });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['order', order.id] });
          onRefresh?.();
        }}
        userRole={userRole}
        accessibleWarehouseIds={accessibleWarehouseIds}
      />

      {/* Mark Delivered Modal */}
      <Modal
        isOpen={showDeliverModal}
        onClose={() => setShowDeliverModal(false)}
        title="Confirm Order Delivery"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Confirm that order <strong className="text-slate-900">{order.orderNumber}</strong> has been
            successfully delivered to recipient destination.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Delivery Confirmation / Proof Notes (Optional)
            </label>
            <input
              type="text"
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="e.g. Signed by John Doe at loading dock bay 2."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeliverModal(false)}
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

      {/* Cancel Order Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Confirm Order Cancellation"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Are you sure you want to cancel order{' '}
            <strong className="text-slate-900">{order.orderNumber}</strong>? Any active reserved stock
            will be immediately released back to available inventory.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reason for Cancellation
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Warehouse damaged items, customer requested cancellation."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCancelModal(false)}
              disabled={isCancelling}
            >
              Keep Order
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmCancel}
              isLoading={isCancelling}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
