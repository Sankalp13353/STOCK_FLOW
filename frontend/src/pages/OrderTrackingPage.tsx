import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Modal } from '../components/ui/Modal';
import { fetchOrderById, cancelOrder } from '../api/orders';
import { processPayment } from '../api/payments';
import { useAuth } from '../hooks/useAuth';
import { formatCurrencyCents, formatDate } from '../utils/formatters';
import { OrderStatus } from '../types';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Package,
  Truck,
  CreditCard,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Building2,
  ShieldCheck,
  Check,
  Ban,
} from 'lucide-react';

export function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isCustomer = user?.role === 'CUSTOMER';

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'danger' | 'info';
    message: string;
  } | null>(null);

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrderById(id!),
    enabled: Boolean(id),
    staleTime: 10 * 1000,
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

  async function handleSimulatePayment(simulateOutcome: 'SUCCESS' | 'FAIL') {
    if (!order) return;
    setIsProcessingPayment(true);
    setFeedback(null);

    try {
      const res = await processPayment({
        orderId: order.id,
        amountCents: order.totalAmountCents,
        paymentMethod: 'MOCK_CARD',
        simulateOutcome,
      });

      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['customer-recent-orders'] });

      if (simulateOutcome === 'SUCCESS') {
        setFeedback({
          type: 'success',
          message: `Payment simulation successful! Order is now CONFIRMED. Transaction ref: ${res.payment.transactionReference}`,
        });
      } else {
        setFeedback({
          type: 'danger',
          message: 'Simulated payment was declined as requested. Order status marked as PAYMENT_FAILED.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'danger',
        message: err.message || 'Payment simulation request failed.',
      });
    } finally {
      setIsProcessingPayment(false);
    }
  }

  async function handleConfirmCancel() {
    if (!order) return;
    setIsCancellingOrder(true);
    try {
      await cancelOrder(order.id, cancelReason || 'Cancelled by customer');
      setShowCancelModal(false);
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['customer-recent-orders'] });
      setFeedback({
        type: 'info',
        message: 'Order has been successfully cancelled. Reserved inventory was released.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'danger',
        message: err.message || 'Failed to cancel order.',
      });
    } finally {
      setIsCancellingOrder(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-slate-500">Loading order tracking details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Order Not Found"
          description="Could not load the requested order details."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(isCustomer ? '/orders' : '/orders')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Orders
            </Button>
          }
        />
        <ErrorMessage
          message={
            (error as any)?.message ||
            'Order could not be found or you do not have permission to view it.'
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const isTerminalFailure =
    order.status === 'CANCELLED' ||
    order.status === 'PAYMENT_FAILED' ||
    order.status === 'RESERVATION_EXPIRED';

  const isActionablePayment =
    order.status === 'PENDING' ||
    order.status === 'RESERVED' ||
    order.status === 'PAYMENT_PENDING';

  const isCancellable =
    order.status === 'PENDING' ||
    order.status === 'RESERVED' ||
    order.status === 'PAYMENT_PENDING' ||
    order.status === 'CONFIRMED';

  // Standard fulfillment timeline steps
  const steps = [
    { label: 'Order Placed', desc: 'Stock Reserved (15m)', icon: Clock, key: 'PENDING' },
    { label: 'Payment Verified', desc: 'Order Confirmed', icon: CreditCard, key: 'CONFIRMED' },
    { label: 'Fulfillment', desc: 'Allocated & Packed', icon: Package, key: 'PROCESSING' },
    { label: 'Shipped', desc: 'In Transit', icon: Truck, key: 'SHIPPED' },
    { label: 'Delivered', desc: 'Fulfillment Complete', icon: CheckCircle2, key: 'DELIVERED' },
  ];

  const getStepStatus = (stepKey: string) => {
    if (isTerminalFailure) return 'inactive';

    const orderStatusRank: Record<string, number> = {
      PENDING: 1,
      RESERVED: 1,
      PAYMENT_PENDING: 1,
      CONFIRMED: 2,
      PROCESSING: 3,
      SHIPPED: 4,
      DELIVERED: 5,
    };

    const currentRank = orderStatusRank[order.status] ?? 0;
    const stepRank = orderStatusRank[stepKey] ?? 0;

    if (currentRank > stepRank) return 'completed';
    if (currentRank === stepRank) return 'current';
    return 'upcoming';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`Placed on ${formatDate(order.createdAt)} • Ref: ${order.id}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/orders')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              {isCustomer ? 'My Orders' : 'All Orders'}
            </Button>
            {isCancellable && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowCancelModal(true)}
                leftIcon={<Ban className="w-4 h-4" />}
              >
                Cancel Order
              </Button>
            )}
          </div>
        }
      />

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
            {feedback.type === 'danger' && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {feedback.type === 'info' && <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            <span className="sr-only">Dismiss</span>
            ✕
          </button>
        </div>
      )}

      {/* Terminal / Failed Alert Notice */}
      {isTerminalFailure && (
        <div className="p-4 rounded-xl border bg-rose-50/70 border-rose-200 text-rose-900 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-rose-950">
              {order.status === 'CANCELLED' && 'This order has been cancelled.'}
              {order.status === 'PAYMENT_FAILED' && 'Payment simulation failed for this order.'}
              {order.status === 'RESERVATION_EXPIRED' && 'The 15-minute stock reservation window expired.'}
            </h4>
            <p className="text-rose-700">
              {order.status === 'CANCELLED' &&
                'All allocated warehouse items were returned to available inventory.'}
              {order.status === 'PAYMENT_FAILED' &&
                'The payment could not be processed. You may place a new order from your shopping cart.'}
              {order.status === 'RESERVATION_EXPIRED' &&
                'The unconfirmed order was released by the automatic reservation worker to allow other buyers access to the items.'}
            </p>
          </div>
        </div>
      )}

      {/* Lifecycle Progress Stepper */}
      <Card>
        <CardHeader
          title="Fulfillment Timeline"
          subtitle={`Current Status: ${order.status}`}
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
                          ? 'bg-brand-600 border-brand-600 text-white ring-4 ring-brand-100'
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
                            ? 'text-brand-600'
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

      {/* Interactive Payment Simulation Box */}
      {isActionablePayment && (
        <Card className="border-brand-200 bg-brand-50/20">
          <CardHeader
            title="Payment Simulation Sandbox"
            subtitle="Test event-driven stock confirmation and outbox processing without a real payment provider."
            action={
              <Badge variant="purple" size="sm">
                Sandbox Mode
              </Badge>
            }
          />
          <CardContent className="space-y-4">
            <div className="p-3.5 rounded-lg bg-white border border-brand-100 flex items-start gap-3 text-xs text-slate-700">
              <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-900">
                  Total Due: {formatCurrencyCents(order.totalAmountCents)}
                </p>
                <p className="text-slate-500 mt-0.5">
                  Stock is currently held under an active 15-minute reservation. Successful payment converts reserved quantity into committed fulfillment stock.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => handleSimulatePayment('SUCCESS')}
                isLoading={isProcessingPayment}
                leftIcon={<CreditCard className="w-4 h-4" />}
              >
                Simulate Successful Payment
              </Button>
              <Button
                variant="outline"
                className="text-rose-700 border-rose-200 hover:bg-rose-50"
                onClick={() => handleSimulatePayment('FAIL')}
                disabled={isProcessingPayment}
                leftIcon={<XCircle className="w-4 h-4 text-rose-600" />}
              >
                Simulate Payment Failure
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Order Items */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Order Items & Warehouse Allocation"
              subtitle={`${order.orderItems.length} unique line items fulfilled across facilities`}
            />
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {order.orderItems.map((item) => (
                  <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        <Package className="w-6 h-6 text-slate-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">
                          {item.product?.name || 'StockFlow Product'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="font-mono text-xs text-slate-500">
                            SKU: {item.product?.sku || 'SKU-UNKNOWN'}
                          </span>
                          {item.warehouse && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              <Building2 className="w-3 h-3 text-slate-500" />
                              {item.warehouse.name} ({item.warehouse.code})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right sm:shrink-0">
                      <div className="text-xs text-slate-500">
                        {item.quantity} × {formatCurrencyCents(item.unitPriceCents)}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {formatCurrencyCents(item.subtotalCents)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payment History Log (if any) */}
          {order.payments && order.payments.length > 0 && (
            <Card>
              <CardHeader
                title="Transaction History"
                subtitle="Event-driven payment attempts and outcomes"
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
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {p.paymentMethod}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {p.transactionReference}
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge
                            variant={p.status === 'SUCCESS' ? 'success' : 'danger'}
                            size="sm"
                          >
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

        {/* Right 1 Col: Shipping & Summary */}
        <div className="space-y-6">
          {/* Shipping Details */}
          <Card>
            <CardHeader title="Shipping Destination" />
            <CardContent className="space-y-3 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                <p className="font-semibold text-slate-800 mb-1">Delivery Address</p>
                <p className="text-slate-600 whitespace-pre-line leading-relaxed">
                  {order.shippingAddress}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 text-slate-500 space-y-1.5">
                <div className="flex justify-between">
                  <span>Customer ID:</span>
                  <span className="font-mono text-slate-700">{order.userId.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span>Order Number:</span>
                  <span className="font-mono text-slate-700">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Updated:</span>
                  <span className="text-slate-700">{formatDate(order.updatedAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Breakdown */}
          <Card>
            <CardHeader title="Payment Summary" />
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal</span>
                <span className="font-medium text-slate-900">
                  {formatCurrencyCents(order.totalAmountCents)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Standard Delivery</span>
                <span className="text-emerald-600 font-medium">Free</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Taxes & Duties</span>
                <span className="text-slate-500">Included</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Amount</span>
                <span className="text-brand-600">
                  {formatCurrencyCents(order.totalAmountCents)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Order Cancellation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Confirm Order Cancellation"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to cancel order{' '}
            <strong className="text-slate-900">{order.orderNumber}</strong>?
            Any stock allocated or reserved for your items will be automatically returned to available warehouse inventory.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Cancellation Reason (Optional)
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Changed my mind, found another product"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCancelModal(false)}
              disabled={isCancellingOrder}
            >
              Keep Order
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmCancel}
              isLoading={isCancellingOrder}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
