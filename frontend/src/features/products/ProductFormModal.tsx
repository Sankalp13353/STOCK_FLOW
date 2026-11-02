import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Product, CreateProductInput, UpdateProductInput } from '../../types';
import { createProduct, updateProduct } from '../../api/products';
import { AlertCircle, DollarSign, Tag, FileText } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSuccess: (savedProduct: Product, isNew: boolean) => void;
}

export function ProductFormModal({
  isOpen,
  onClose,
  product,
  onSuccess,
}: ProductFormModalProps) {
  const isEditing = Boolean(product);

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setSku(product.sku);
      setName(product.name);
      setPriceDollars((product.priceCents / 100).toFixed(2));
      setDescription(product.description || '');
      setIsActive(product.isActive);
    } else {
      setSku('');
      setName('');
      setPriceDollars('');
      setDescription('');
      setIsActive(true);
    }
    setErrors({});
    setApiError(null);
  }, [product, isOpen]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    const cleanSku = sku.trim();
    if (!cleanSku) {
      newErrors.sku = 'SKU is required';
    } else if (cleanSku.length < 2) {
      newErrors.sku = 'SKU must be at least 2 characters';
    } else if (cleanSku.length > 100) {
      newErrors.sku = 'SKU cannot exceed 100 characters';
    }

    const cleanName = name.trim();
    if (!cleanName) {
      newErrors.name = 'Product name is required';
    } else if (cleanName.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (cleanName.length > 200) {
      newErrors.name = 'Name cannot exceed 200 characters';
    }

    if (!priceDollars.trim()) {
      newErrors.price = 'Price is required';
    } else {
      const num = parseFloat(priceDollars);
      if (isNaN(num) || num < 0) {
        newErrors.price = 'Price must be a valid non-negative number';
      }
    }

    if (description.trim().length > 2000) {
      newErrors.description = 'Description cannot exceed 2000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    setIsSubmitting(true);

    try {
      if (isEditing && product) {
        const updatePayload: UpdateProductInput = {
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          priceCents,
          isActive,
        };
        const updated = await updateProduct(product.id, updatePayload);
        onSuccess(updated, false);
      } else {
        const createPayload: CreateProductInput = {
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          priceCents,
          isActive,
        };
        const created = await createProduct(createPayload);
        onSuccess(created, true);
      }
      onClose();
    } catch (err: any) {
      if (err.status === 409 || err.code === 'DUPLICATE_RESOURCE' || err.message?.includes('already exists')) {
        setApiError(`A product with SKU "${sku.trim().toUpperCase()}" already exists in the catalog.`);
      } else {
        setApiError(err.message || 'Failed to save product. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Product' : 'Create New Product'}
      subtitle={
        isEditing
          ? `Update catalog specifications for SKU ${product?.sku}`
          : 'Add a new product definition to the StockFlow master catalog.'
      }
      maxWidth="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
          >
            {isEditing ? 'Save Changes' : 'Create Product'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{apiError}</div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Stock Keeping Unit (SKU)"
            placeholder="e.g. SF-ELEC-001"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            error={errors.sku}
            leftIcon={<Tag className="w-4 h-4" />}
            required
            autoFocus={!isEditing}
          />

          <Input
            label="Unit Price (USD)"
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            error={errors.price}
            leftIcon={<DollarSign className="w-4 h-4" />}
            required
          />
        </div>

        <Input
          label="Product Name"
          placeholder="e.g. Ergonomic Office Chair"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          leftIcon={<FileText className="w-4 h-4" />}
          required
        />

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Description <span className="text-slate-400 font-normal lowercase">(optional)</span>
          </label>
          <textarea
            rows={3}
            placeholder="Provide technical specifications, dimensions, or material details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors ${
              errors.description
                ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500'
            }`}
          />
          {errors.description && (
            <p className="mt-1 text-xs text-rose-600">{errors.description}</p>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-800">Operational Status</span>
            <p className="text-xs text-slate-500">
              Active products are available for stock reservations and customer orders.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ml-2.5 text-xs font-medium text-slate-700">
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}

