import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { fetchProducts } from '../../api/products';
import { restockInventory } from '../../api/inventory';
import { Warehouse, RestockResult, Product } from '../../types';
import { Boxes, Package } from 'lucide-react';

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: Warehouse | null;
  onSuccess: (result: RestockResult) => void;
}

export function RestockModal({
  isOpen,
  onClose,
  warehouse,
  onSuccess,
}: RestockModalProps) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(100);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch available products to restock
  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products-for-restock'],
    queryFn: () => fetchProducts({ limit: 100 }),
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  const products = productsData?.products ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!warehouse) {
      setSubmitError('No active warehouse selected.');
      return;
    }

    if (!selectedProductId) {
      setSubmitError('Please select a product to restock.');
      return;
    }

    if (!quantity || quantity <= 0) {
      setSubmitError('Quantity must be a positive integer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await restockInventory({
        productId: selectedProductId,
        warehouseId: warehouse.id,
        quantity: Math.floor(quantity),
        notes: notes.trim() || undefined,
      });

      // Reset form
      setSelectedProductId('');
      setQuantity(100);
      setNotes('');
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to restock inventory.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!warehouse) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Restock Warehouse Inventory"
      subtitle={`Replenish product stock directly at ${warehouse.code} (${warehouse.name}).`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <ErrorMessage
            title="Restock Request Failed"
            message={submitError}
            onRetry={() => setSubmitError(null)}
          />
        )}

        {/* Selected Facility Display */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-brand-600" />
            <span className="text-xs font-medium text-slate-700">Target Facility:</span>
          </div>
          <span className="font-mono text-xs font-bold text-slate-900">
            {warehouse.code} — {warehouse.city}
          </span>
        </div>

        {/* Product Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Product SKU & Catalog Item <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={isLoadingProducts || isSubmitting}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            >
              <option value="">
                {isLoadingProducts ? 'Loading catalog products...' : '-- Select a product --'}
              </option>
              {products.map((p: Product) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quantity Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Quantity to Add (Units) <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            required
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Stock will be added to the physical on-hand inventory ledger and logged as an immutable movement.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Replenishment Notes (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Weekly replenishment PO-4091"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            leftIcon={<Package className="w-4 h-4" />}
          >
            Confirm Restock
          </Button>
        </div>
      </form>
    </Modal>
  );
}
