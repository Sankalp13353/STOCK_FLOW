import { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Order } from '../../types';
import { dispatchOrder } from '../../api/orders';
import {
  Truck,
  Building2,
  Package,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onSuccess: () => void;
  userRole?: string;
  accessibleWarehouseIds?: string[];
}

const COMMON_CARRIERS = [
  'FedEx Express',
  'FedEx Ground',
  'UPS Next Day Air',
  'UPS Ground',
  'DHL Express',
  'USPS Priority',
  'Internal Fleet / Courier',
  'Freight / LTL Carrier',
  'Other',
];

export function DispatchModal({
  isOpen,
  onClose,
  order,
  onSuccess,
  userRole = 'ADMIN',
  accessibleWarehouseIds = [],
}: DispatchModalProps) {
  const [carrier, setCarrier] = useState(COMMON_CARRIERS[0]);
  const [customCarrier, setCustomCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Group line items by warehouse
  const warehouseGroups = useMemo(() => {
    if (!order?.orderItems) return [];

    const map = new Map<
      string,
      {
        warehouseId: string;
        warehouseName: string;
        warehouseCode: string;
        isAuthorized: boolean;
        items: Array<{
          id: string;
          productName: string;
          sku: string;
          quantity: number;
        }>;
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
          isAuthorized: isAuth,
          items: [],
        });
      }

      map.get(wId)!.items.push({
        id: item.id,
        productName: item.product?.name || 'Product Item',
        sku: item.product?.sku || 'SKU-N/A',
        quantity: item.quantity,
      });
    }

    return Array.from(map.values());
  }, [order, userRole, accessibleWarehouseIds]);

  const isMultiWarehouse = warehouseGroups.length > 1;
  const hasUnauthorizedWarehouse = warehouseGroups.some((g) => !g.isAuthorized);

  async function handleConfirmDispatch() {
    if (!order) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const activeCarrier = carrier === 'Other' ? customCarrier.trim() || 'Other Carrier' : carrier;
    const combinedNotes = [
      activeCarrier ? `Carrier: ${activeCarrier}` : null,
      notes.trim() ? notes.trim() : null,
    ]
      .filter(Boolean)
      .join(' • ');

    try {
      await dispatchOrder(order.id, {
        warehouseId: selectedWarehouseId !== 'ALL' ? selectedWarehouseId : undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: combinedNotes || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to dispatch order. Check your warehouse permissions or order status.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-slate-900">
          <Truck className="w-5 h-5 text-indigo-600" />
          <span>Confirm Physical Order Dispatch</span>
        </div>
      }
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Order Identifier Summary */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-500 font-medium">Order Number:</span>
            <span className="ml-2 font-mono font-bold text-slate-900">{order.orderNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Status:</span>
            <Badge variant="warning">{order.status}</Badge>
            {isMultiWarehouse && (
              <Badge variant="purple" size="sm">
                Multi-Warehouse ({warehouseGroups.length} Facilities)
              </Badge>
            )}
          </div>
        </div>

        {/* Physical Inventory Deduction Notice */}
        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-900">
              Irreversible Physical Stock Deduction
            </h4>
            <p className="text-amber-800 leading-relaxed">
              Confirming this dispatch indicates that the goods have been packed and handed over to
              transportation. The system will <strong>atomically decrement physical stock</strong> (
              <code className="font-mono font-semibold">quantityOnHand</code>) and transition reserved
              stock to <strong>COMMITTED</strong>.
            </p>
          </div>
        </div>

        {/* Permission Notice for Warehouse Managers / Staff */}
        {hasUnauthorizedWarehouse && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 flex items-start gap-3 text-xs">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-rose-900">Warehouse Access Restriction</h4>
              <p className="text-rose-700 leading-relaxed">
                This order spans facilities you are not assigned to. You can only dispatch stock from
                warehouses within your authorized scope, or request an Administrator to dispatch the full order.
              </p>
            </div>
          </div>
        )}

        {/* Warehouse Allocations & SKU Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-slate-500" />
              <span>Allocations & SKUs to Dispatch</span>
            </h4>
            {isMultiWarehouse && (
              <span className="text-[11px] text-slate-500 font-medium">
                {warehouseGroups.length} allocation facilities
              </span>
            )}
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {warehouseGroups.map((group) => (
              <div
                key={group.warehouseId}
                className={`p-3.5 rounded-lg border text-xs ${
                  group.isAuthorized
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50/70 border-slate-200 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <span className="font-semibold text-slate-900">{group.warehouseName}</span>
                    <span className="font-mono text-[11px] text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded">
                      {group.warehouseCode}
                    </span>
                  </div>
                  {group.isAuthorized ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Authorized
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                      <AlertCircle className="w-3.5 h-3.5" /> Outside Assignment
                    </span>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="py-1.5 flex items-center justify-between text-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{item.productName}</span>
                        <span className="font-mono text-[11px] text-slate-400">({item.sku})</span>
                      </div>
                      <span className="font-semibold text-slate-900">
                        {item.quantity} unit{item.quantity > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Optional Multi-Warehouse Scope Selector */}
        {isMultiWarehouse && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Dispatch Scope
            </label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
            >
              <option value="ALL">Dispatch All Allocations (Entire Order)</option>
              {warehouseGroups.map((g) => (
                <option key={g.warehouseId} value={g.warehouseId}>
                  {g.warehouseName} ({g.warehouseCode}) only {g.isAuthorized ? '' : '⚠️ (Requires Admin)'}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Selecting a specific facility dispatches line items from that warehouse.
            </p>
          </div>
        )}

        {/* Carrier & Tracking Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Logistics Carrier
            </label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
            >
              {COMMON_CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {carrier === 'Other' && (
              <input
                type="text"
                placeholder="Enter carrier name"
                value={customCarrier}
                onChange={(e) => setCustomCarrier(e.target.value)}
                className="mt-2 w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tracking / Waybill Number
            </label>
            <input
              type="text"
              placeholder="e.g. FDX-9823471029"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Optional Dispatch Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Dispatch Notes (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Dispatched from Bay 4 via overnight freight pallet"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        {/* Error Display */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirmDispatch}
            isLoading={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700"
            leftIcon={<Truck className="w-4 h-4" />}
          >
            Confirm Physical Dispatch
          </Button>
        </div>
      </div>
    </Modal>
  );
}
