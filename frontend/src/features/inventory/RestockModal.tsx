import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { fetchProducts } from '../../api/products';
import { fetchWarehouses } from '../../api/warehouses';
import { restockInventory } from '../../api/inventory';
import { Warehouse, RestockResult, Product } from '../../types';
import { Package, Building2 } from 'lucide-react';

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse?: Warehouse | null;
  defaultProductId?: string;
  defaultWarehouseId?: string;
  onSuccess?: (result: RestockResult) => void;
}

export function RestockModal({
  isOpen,
  onClose,
  warehouse,
  defaultProductId,
  defaultWarehouseId,
  onSuccess,
}: RestockModalProps) {
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [quantity, setQuantity] = useState<number>(50);
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Accessible warehouses query
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery<Warehouse[]>({
    queryKey: ['assigned-warehouses'],
    queryFn: () => fetchWarehouses(),
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  // Available products to restock
  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products-for-restock'],
    queryFn: () => fetchProducts({ limit: 100 }),
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  const products = productsData?.products ?? [];

  useEffect(() => {
    if (isOpen) {
      setSelectedProductId(defaultProductId || '');
      setSelectedWarehouseId(warehouse?.id || defaultWarehouseId || '');
      setQuantity(50);
      setSupplier('');
      setNotes('');
      setSubmitError(null);
    }
  }, [isOpen, defaultProductId, defaultWarehouseId, warehouse?.id]);

  useEffect(() => {
    if (isOpen && !warehouse?.id && !selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [isOpen, warehouses, warehouse?.id, selectedWarehouseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const targetWarehouseId = warehouse?.id || selectedWarehouseId;

    if (!targetWarehouseId) {
      setSubmitError('Please select a target warehouse.');
      return;
    }

    if (!selectedProductId) {
      setSubmitError('Please select a product to restock.');
      return;
    }

    if (!quantity || quantity <= 0) {
      setSubmitError('Quantity must be a positive integer greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await restockInventory({
        productId: selectedProductId,
        warehouseId: targetWarehouseId,
        quantity: Math.floor(quantity),
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-evaluations'] });

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error?.message || err.message || 'Failed to restock inventory.');
    } finally {
      setIsSubmitting(false);
    }
  }


  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Restock Inventory"
      subtitle="Replenish physical stock, log immutable restock movements, and re-evaluate minimum thresholds."
      maxWidth="md"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <ErrorMessage
            title="Restock Request Failed"
            message={submitError}
            onRetry={() => setSubmitError(null)}
          />
        )}

        {/* Destination Warehouse Selector / Display */}
        {warehouse ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand-600" />
              <span className="text-xs font-medium text-slate-700">Target Facility:</span>
            </div>
            <span className="font-mono text-xs font-bold text-slate-900">
              {warehouse.code} — {warehouse.name} ({warehouse.city})
            </span>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Destination Warehouse <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              disabled={isLoadingWarehouses || isSubmitting}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            >
              <option value="">
                {isLoadingWarehouses ? 'Loading warehouses...' : '-- Select destination facility --'}
              </option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  [{w.code}] {w.name} — {w.city}, {w.country}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Product Selector */}
        <div>
          <label htmlFor="restock-product" className="block text-xs font-semibold text-slate-700 mb-1">
            Product SKU & Catalog Item <span className="text-rose-500">*</span>
          </label>
          <select
            id="restock-product"
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

        {/* Quantity Input */}
        <div>
          <label htmlFor="restock-quantity" className="block text-xs font-semibold text-slate-700 mb-1">
            Quantity to Add (Units) <span className="text-rose-500">*</span>
          </label>
          <input
            id="restock-quantity"
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
            Physical stock (quantity on hand) will increase immediately and available stock will be updated.
          </p>
        </div>

        {/* Supplier / Vendor (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Supplier / Vendor (Optional)
          </label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="e.g. Acme Industrial Supply, Apex Logistics"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        {/* Notes / Reference (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Replenishment Notes / PO Number (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Routine restock PO-9481, Seasonal bulk shipment"
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
