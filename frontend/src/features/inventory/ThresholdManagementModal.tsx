import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { useAuth } from '../../hooks/useAuth';
import { fetchProducts } from '../../api/products';
import { fetchWarehouses } from '../../api/warehouses';
import {
  fetchThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,
} from '../../api/inventory';
import {
  MinimumStockThresholdItem,
  CreateThresholdPayload,
  UpdateThresholdPayload,
} from '../../types/inventory';
import { Product, Warehouse } from '../../types';
import {
  Sliders,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Globe,
} from 'lucide-react';

interface ThresholdManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export function ThresholdManagementModal({
  isOpen,
  onClose,
  onSuccessToast,
}: ThresholdManagementModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  // Mode: 'list' | 'create' | 'edit'
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingThreshold, setEditingThreshold] = useState<MinimumStockThresholdItem | null>(null);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('GLOBAL');
  const [minQuantity, setMinQuantity] = useState<number>(10);
  const [reorderQuantity, setReorderQuantity] = useState<number>(20);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // 1. Fetch Thresholds
  const {
    data: thresholds = [],
    isLoading: isLoadingThresholds,
  } = useQuery<MinimumStockThresholdItem[]>({
    queryKey: ['thresholds'],
    queryFn: () => fetchThresholds(),
    enabled: isOpen,
  });

  // 2. Fetch Products for selection
  const { data: productsData } = useQuery<{ products: Product[] }>({
    queryKey: ['products', 'dropdown'],
    queryFn: () => fetchProducts({ limit: 100 }),
    enabled: isOpen && (viewMode === 'create' || viewMode === 'edit'),
  });
  const products = productsData?.products || [];

  // 3. Fetch Accessible Warehouses for selection
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['assigned-warehouses'],
    queryFn: () => fetchWarehouses(),
    enabled: isOpen && (viewMode === 'create' || viewMode === 'edit'),
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateThresholdPayload) => createThreshold(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setViewMode('list');
      setFormError(null);
      if (onSuccessToast) onSuccessToast('Minimum stock threshold created successfully');
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || 'Failed to create threshold');
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateThresholdPayload }) =>
      updateThreshold(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setViewMode('list');
      setEditingThreshold(null);
      setFormError(null);
      if (onSuccessToast) onSuccessToast('Minimum stock threshold updated successfully');
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || 'Failed to update threshold');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteThreshold(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (onSuccessToast) onSuccessToast('Minimum stock threshold deleted');
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || 'Failed to delete threshold');
    },
  });

  function startCreate() {
    setFormError(null);
    setSelectedProductId(products[0]?.id || '');
    setSelectedWarehouseId(isAdmin ? 'GLOBAL' : warehouses[0]?.id || '');
    setMinQuantity(10);
    setReorderQuantity(20);
    setViewMode('create');
  }

  function startEdit(t: MinimumStockThresholdItem) {
    setFormError(null);
    setEditingThreshold(t);
    setSelectedProductId(t.productId);
    setSelectedWarehouseId(t.warehouseId || 'GLOBAL');
    setMinQuantity(t.minQuantity);
    setReorderQuantity(t.reorderQuantity || 0);
    setViewMode('edit');
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (minQuantity < 0) {
      setFormError('Minimum threshold quantity cannot be negative.');
      return;
    }

    if (viewMode === 'create') {
      if (!selectedProductId) {
        setFormError('Please select a product.');
        return;
      }

      const payload: CreateThresholdPayload = {
        productId: selectedProductId,
        warehouseId: selectedWarehouseId === 'GLOBAL' ? null : selectedWarehouseId,
        minQuantity: Number(minQuantity),
        reorderQuantity: Number(reorderQuantity) || 0,
        isActive: true,
      };

      createMutation.mutate(payload);
    } else if (viewMode === 'edit' && editingThreshold) {
      updateMutation.mutate({
        id: editingThreshold.id,
        payload: {
          minQuantity: Number(minQuantity),
          reorderQuantity: Number(reorderQuantity) || 0,
        },
      });
    }
  }

  const filteredThresholds = useMemo(() => {
    if (!searchFilter.trim()) return thresholds;
    const q = searchFilter.toLowerCase();
    return thresholds.filter(
      (t) =>
        t.product?.name?.toLowerCase().includes(q) ||
        t.product?.sku?.toLowerCase().includes(q) ||
        t.warehouse?.name?.toLowerCase().includes(q) ||
        t.warehouse?.code?.toLowerCase().includes(q)
    );
  }, [thresholds, searchFilter]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setViewMode('list');
        onClose();
      }}
      title="Minimum Stock Thresholds"
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-500">
              Configure automated reorder triggers per warehouse facility or enterprise-wide defaults.
            </p>
          </div>
          {viewMode === 'list' && (
            <Button
              onClick={startCreate}
              size="sm"
              variant="primary"
              className="inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Configure Threshold</span>
            </Button>
          )}
        </div>

        {formError && (
          <ErrorMessage
            title="Threshold Error"
            message={formError}
            className="p-3 text-xs"
          />
        )}

        {/* View Mode: Form (Create or Edit) */}
        {(viewMode === 'create' || viewMode === 'edit') && (
          <form onSubmit={handleSave} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                {viewMode === 'create' ? 'Add Minimum Stock Threshold' : 'Edit Minimum Stock Threshold'}
              </h3>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Back to List
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product
                </label>
                {viewMode === 'create' ? (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800">
                    {editingThreshold?.product?.sku} — {editingThreshold?.product?.name}
                  </div>
                )}
              </div>

              {/* Scope / Warehouse Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scope / Warehouse Facility
                </label>
                {viewMode === 'create' ? (
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {isAdmin && (
                      <option value="GLOBAL">🌐 All Facilities (Organization Default)</option>
                    )}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        🏢 {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center gap-2">
                    {editingThreshold?.warehouseId ? (
                      <>
                        <Building2 className="w-4 h-4 text-brand-600" />
                        <span>{editingThreshold?.warehouse?.code} — {editingThreshold?.warehouse?.name}</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 text-purple-600" />
                        <span>All Facilities (Organization Default)</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Min Quantity Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimum Stock Threshold (Reorder Point)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(parseInt(e.target.value, 10) || 0)}
                  required
                  placeholder="e.g. 15"
                />
                <span className="text-[11px] text-slate-400">Trigger alert when available stock falls strictly below this.</span>
              </div>

              {/* Reorder Quantity Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Suggested Reorder Quantity (Optional)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={reorderQuantity}
                  onChange={(e) => setReorderQuantity(parseInt(e.target.value, 10) || 0)}
                  placeholder="e.g. 50"
                />
                <span className="text-[11px] text-slate-400">Standard batch quantity for replenishment orders.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setViewMode('list')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                {viewMode === 'create' ? 'Save Threshold' : 'Update Threshold'}
              </Button>
            </div>
          </form>
        )}

        {/* View Mode: List */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {/* Search filter input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search threshold by product, SKU, or warehouse..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {isLoadingThresholds ? (
              <div className="py-12 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : filteredThresholds.length === 0 ? (
              <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <Sliders className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No thresholds configured</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Add product thresholds so the platform can detect low stock and alert managers.
                </p>
                <Button
                  onClick={startCreate}
                  size="sm"
                  variant="primary"
                  className="mt-4"
                >
                  Configure First Threshold
                </Button>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Product / SKU</th>
                      <th className="py-2.5 px-3">Scope / Facility</th>
                      <th className="py-2.5 px-3 text-right">Min Qty</th>
                      <th className="py-2.5 px-3 text-right">Reorder Qty</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredThresholds.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-900">{t.product?.name || 'Unknown'}</p>
                          <p className="font-mono text-[11px] text-slate-500">{t.product?.sku}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          {t.warehouseId ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px]">
                              <Building2 className="w-3 h-3" />
                              <span>{t.warehouse?.code}</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[11px]">
                              <Globe className="w-3 h-3" />
                              <span>Global Default</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {t.minQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {t.reorderQuantity || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => startEdit(t)}
                              className="p-1 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded"
                              title="Edit Threshold"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Delete this minimum stock threshold?')) {
                                  deleteMutation.mutate(t.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="Delete Threshold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
