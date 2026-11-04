import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Ticket } from '../../types/ticket';
import { useAuth } from '../../hooks/useAuth';
import {
  approveTicket,
  rejectTicket,
  resolveTicket,
  submitCustomerDecision,
} from '../../api/tickets';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Warehouse,
  Package,
  Layers,
} from 'lucide-react';

interface TicketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  onTicketUpdated: () => void;
}

export function TicketDetailModal({
  isOpen,
  onClose,
  ticket,
  onTicketUpdated,
}: TicketDetailModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Approval / Rejection / Resolve dialog states
  const [actionType, setActionType] = useState<
    'approve' | 'reject' | 'resolve' | 'customer_accept' | 'customer_reject' | null
  >(null);
  const [actionNotes, setActionNotes] = useState('');

  if (!ticket) return null;

  const isCustomer = user?.role === 'CUSTOMER';
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE_MANAGER';

  const typeBadgeVariant: Record<string, BadgeVariant> = {
    ORDER_SHORTAGE: 'warning',
    CUSTOMER_DECISION: 'brand',
    LOW_STOCK: 'danger',
  };

  const statusBadgeVariant: Record<string, BadgeVariant> = {
    OPEN: 'warning',
    ASSIGNED: 'brand',
    IN_PROGRESS: 'purple',
    RESOLVED: 'success',
    CANCELLED: 'neutral',
    CLOSED: 'neutral',
    PENDING: 'warning',
    ACCEPTED: 'success',
    REJECTED: 'danger',
    EXPIRED: 'neutral',
  };

  const priorityBadgeVariant: Record<string, BadgeVariant> = {
    LOW: 'neutral',
    MEDIUM: 'brand',
    HIGH: 'warning',
    CRITICAL: 'danger',
  };

  const allocations = ticket.metadata?.allocations || [];

  const handleExecuteAction = async () => {
    if (!ticket) return;
    setLoading(true);
    setActionError(null);

    try {
      if (actionType === 'approve') {
        await approveTicket(ticket.id, actionNotes.trim() || undefined);
      } else if (actionType === 'reject') {
        if (!actionNotes.trim()) {
          setActionError('Please provide a rejection reason');
          setLoading(false);
          return;
        }
        await rejectTicket(ticket.id, actionNotes.trim());
      } else if (actionType === 'resolve') {
        if (!actionNotes.trim()) {
          setActionError('Please provide resolution notes');
          setLoading(false);
          return;
        }
        await resolveTicket(ticket.id, actionNotes.trim());
      } else if (actionType === 'customer_accept') {
        await submitCustomerDecision(ticket.id, 'ACCEPT_PARTIAL', actionNotes.trim() || undefined);
      } else if (actionType === 'customer_reject') {
        await submitCustomerDecision(ticket.id, 'REJECT_PARTIAL', actionNotes.trim() || undefined);
      }

      setActionType(null);
      setActionNotes('');
      onTicketUpdated();
      onClose();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setActionType(null);
        setActionError(null);
        onClose();
      }}
      title={
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-slate-900">{ticket.ticketNumber}</span>
          <Badge variant={typeBadgeVariant[ticket.type] || 'neutral'}>{ticket.type.replace('_', ' ')}</Badge>
          <Badge variant={statusBadgeVariant[ticket.status] || 'neutral'}>{ticket.status}</Badge>
          <Badge variant={priorityBadgeVariant[ticket.priority] || 'neutral'}>{ticket.priority}</Badge>
        </div>
      }
      subtitle={
        <span className="text-xs text-slate-500">
          Created on {new Date(ticket.createdAt).toLocaleString()}
          {ticket.resolvedAt && ` • Resolved on ${new Date(ticket.resolvedAt).toLocaleString()}`}
        </span>
      }
      maxWidth="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            onClick={() => {
              setActionType(null);
              setActionError(null);
              onClose();
            }}
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            {/* Customer Decision Buttons */}
            {ticket.type === 'CUSTOMER_DECISION' &&
              ticket.status === 'PENDING' &&
              (isCustomer || user?.role === 'ADMIN') && (
                <>
                  <Button
                    variant="outline"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    onClick={() => setActionType('customer_reject')}
                  >
                    Reject Partial Order
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setActionType('customer_accept')}
                  >
                    Accept Partial Offer ({ticket.quantityOffered || 0} units)
                  </Button>
                </>
              )}

            {/* Manager / Admin Shortage Approval Buttons */}
            {ticket.type === 'ORDER_SHORTAGE' &&
              ticket.approvalStatus === 'PENDING' &&
              isAdminOrManager && (
                <>
                  <Button
                    variant="outline"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    onClick={() => setActionType('reject')}
                  >
                    Reject Shortage
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setActionType('approve')}
                  >
                    Approve Fulfillment
                  </Button>
                </>
              )}

            {/* Resolve Ticket Button */}
            {(ticket.type === 'LOW_STOCK' || ticket.type === 'ORDER_SHORTAGE') &&
              ticket.status !== 'RESOLVED' &&
              ticket.status !== 'CANCELLED' &&
              ticket.status !== 'CLOSED' &&
              isAdminOrManager && (
                <Button variant="outline" onClick={() => setActionType('resolve')}>
                  Resolve Ticket
                </Button>
              )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {actionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Failed</p>
              <p>{actionError}</p>
            </div>
          </div>
        )}

        {/* Action Confirmation Banner */}
        {actionType && (
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              {actionType === 'approve' && <CheckCircle className="w-4 h-4 text-emerald-600" />}
              {actionType === 'reject' && <XCircle className="w-4 h-4 text-rose-600" />}
              {actionType === 'resolve' && <CheckCircle className="w-4 h-4 text-blue-600" />}
              {actionType === 'customer_accept' && <CheckCircle className="w-4 h-4 text-emerald-600" />}
              {actionType === 'customer_reject' && <XCircle className="w-4 h-4 text-rose-600" />}
              Confirm Action:{' '}
              {actionType === 'approve'
                ? 'Approve Shortage Fulfillment'
                : actionType === 'reject'
                ? 'Reject Shortage (Cancels Order)'
                : actionType === 'resolve'
                ? 'Mark Ticket as Resolved'
                : actionType === 'customer_accept'
                ? 'Accept Partial Order'
                : 'Reject Partial Order'}
            </h4>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {actionType === 'reject'
                  ? 'Rejection Reason (Required)'
                  : actionType === 'resolve'
                  ? 'Resolution Notes (Required)'
                  : 'Notes / Comments (Optional)'}
              </label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder={
                  actionType === 'reject'
                    ? 'State reason for rejecting shortage fulfillment...'
                    : actionType === 'resolve'
                    ? 'Explain how inventory issue was resolved...'
                    : 'Add optional notes...'
                }
                rows={3}
                className="w-full text-xs rounded-lg border-slate-300 focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setActionType(null)} disabled={loading}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleExecuteAction} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}

        {/* Shortage Metrics Card */}
        {(ticket.type === 'ORDER_SHORTAGE' || ticket.type === 'CUSTOMER_DECISION') && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Requested</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{ticket.requestedQuantity || 0}</p>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Available</p>
              <p className="text-xl font-bold text-emerald-900 mt-1">{ticket.availableQuantity || 0}</p>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-[11px] font-medium text-rose-700 uppercase tracking-wider">Shortage</p>
              <p className="text-xl font-bold text-rose-900 mt-1">{ticket.shortageQuantity || 0}</p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">Offered</p>
              <p className="text-xl font-bold text-blue-900 mt-1">{ticket.quantityOffered || 0}</p>
            </div>
          </div>
        )}

        {/* Low Stock Metrics Card */}
        {ticket.type === 'LOW_STOCK' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Available Stock</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{ticket.availableQuantity || 0}</p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">Min Threshold</p>
              <p className="text-xl font-bold text-blue-900 mt-1">{ticket.thresholdQuantity || 0}</p>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-[11px] font-medium text-rose-700 uppercase tracking-wider">Deficit</p>
              <p className="text-xl font-bold text-rose-900 mt-1">{ticket.deficitQuantity || 0}</p>
            </div>
          </div>
        )}

        {/* Proposed Warehouse Allocations Table */}
        {allocations.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-slate-500" />
                Proposed Warehouse Allocations
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Total Allocated: {allocations.reduce((sum, a) => sum + a.quantity, 0)} units
              </span>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Warehouse Code</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Warehouse Name</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-500">Units Allocated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {allocations.map((alloc) => (
                  <tr key={alloc.warehouseId}>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{alloc.warehouseCode}</td>
                    <td className="px-4 py-2 text-slate-600">{alloc.warehouseName}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{alloc.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Associated Entity Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {ticket.product && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> Product Information
              </span>
              <p className="font-semibold text-slate-900 text-sm">{ticket.product.name}</p>
              <p className="font-mono text-slate-600">SKU: {ticket.product.sku}</p>
              <p className="text-slate-500">Price: ${(ticket.product.priceCents / 100).toFixed(2)}</p>
            </div>
          )}

          {ticket.order && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> Order Information
              </span>
              <p className="font-mono font-semibold text-slate-900 text-sm">{ticket.order.orderNumber}</p>
              <p className="text-slate-600">Status: <span className="font-semibold uppercase">{ticket.order.status}</span></p>
              <p className="text-slate-500">Total: ${(ticket.order.totalAmountCents / 100).toFixed(2)}</p>
            </div>
          )}

          {ticket.customer && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customer</span>
              <p className="font-medium text-slate-900">{ticket.customer.fullName}</p>
              <p className="text-slate-500">{ticket.customer.email}</p>
            </div>
          )}

          {ticket.assignedToUser && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assigned To</span>
              <p className="font-medium text-slate-900">{ticket.assignedToUser.fullName}</p>
              <p className="text-slate-500 capitalize">{ticket.assignedToUser.role.replace('_', ' ')}</p>
            </div>
          )}
        </div>

        {/* Governance & Status Breakdown */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Internal Manager Approval:</span>
            <Badge
              variant={
                ticket.approvalStatus === 'APPROVED'
                  ? 'success'
                  : ticket.approvalStatus === 'REJECTED'
                  ? 'danger'
                  : 'warning'
              }
            >
              {ticket.approvalStatus}
            </Badge>
          </div>
          {ticket.customerDecision && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Customer Response:</span>
              <Badge
                variant={
                  ticket.customerDecision === 'ACCEPTED_PARTIAL'
                    ? 'success'
                    : ticket.customerDecision === 'REJECTED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {ticket.customerDecision.replace('_', ' ')}
              </Badge>
            </div>
          )}
        </div>

        {/* Resolution Notes / Log */}
        {ticket.resolutionNotes && (
          <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg space-y-1 text-xs">
            <span className="font-semibold text-amber-900">Resolution & Audit Log:</span>
            <p className="text-amber-800 whitespace-pre-line">{ticket.resolutionNotes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
