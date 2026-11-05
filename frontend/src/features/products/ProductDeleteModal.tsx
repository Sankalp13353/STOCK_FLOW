import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Product } from '../../types';
import { deleteProduct, updateProduct } from '../../api/products';
import { AlertTriangle, Archive, ShieldAlert } from 'lucide-react';

interface ProductDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: (deletedProduct: Product) => void;
  onDeactivateSuccess?: (updatedProduct: Product) => void;
}

export function ProductDeleteModal({
  isOpen,
  onClose,
  product,
  onSuccess,
  onDeactivateSuccess,
}: ProductDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!product) return null;

  async function handleDelete() {
    if (!product) return;
    setIsDeleting(true);
    setError(null);

    try {
      const deleted = await deleteProduct(product.id);
      onSuccess(deleted);
      onClose();
    } catch (err: any) {
      const isReferential =
        err.code === 'FOREIGN_KEY_VIOLATION' ||
        err.code === 'CONFLICT' ||
        err.status === 409 ||
        err.status === 400 ||
        err.message?.includes('foreign key') ||
        err.message?.includes('Related record') ||
        err.message?.includes('stock') ||
        err.message?.includes('inventory') ||
        err.message?.includes('ledger') ||
        err.message?.includes('order');

      const message =
        err.message ||
        (isReferential
          ? `Cannot delete product "${product.sku}" because it is referenced by existing warehouse inventory allocations or customer order records. In StockFlow, products with active relations cannot be removed to prevent orphaned ledger records. To prevent further orders, edit the product and set its status to Inactive.`
          : 'An error occurred while attempting to delete the product.');

      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeactivate() {
    if (!product) return;
    setIsDeactivating(true);
    setError(null);

    try {
      const updated = await updateProduct(product.id, { isActive: false });
      if (onDeactivateSuccess) {
        onDeactivateSuccess(updated);
      } else {
        onSuccess(updated);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate product.');
    } finally {
      setIsDeactivating(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Product Deletion"
      maxWidth="md"
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isDeleting || isDeactivating}
          >
            Cancel
          </Button>
          {product.isActive && error && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDeactivate}
              isLoading={isDeactivating}
              disabled={isDeleting}
              leftIcon={<Archive className="w-4 h-4" />}
            >
              Deactivate Instead
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            isLoading={isDeleting}
            disabled={isDeactivating}
            leftIcon={<AlertTriangle className="w-4 h-4" />}
          >
            Permanently Delete
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">
              Are you sure you want to delete this product?
            </p>
            <p>
              You are about to delete <span className="font-mono font-semibold">{product.sku}</span>{' '}
              — <strong>{product.name}</strong>.
            </p>
            {!product.isActive && (
              <p className="text-slate-600 font-medium">
                (Current status: <span className="text-amber-800">Inactive / Archived</span>)
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex flex-col gap-2.5 text-xs text-rose-800">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <strong>Referential Integrity Constraint:</strong> {error}
              </div>
            </div>
            {product.isActive && (
              <div className="pt-2 border-t border-rose-200/70 flex items-center justify-between gap-2">
                <span className="text-[11px] text-rose-700">
                  Recommended action: Archive this SKU to preserve historical ledgers while preventing new orders.
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleDeactivate}
                  isLoading={isDeactivating}
                  leftIcon={<Archive className="w-3.5 h-3.5" />}
                  className="bg-white border-rose-300 text-rose-900 hover:bg-rose-100 shrink-0"
                >
                  Deactivate SKU Now
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-slate-500">
          StockFlow maintains strict data consistency across distributed inventory and outbox ledgers.
          Deletion will immediately fail if this SKU has any associated stock balance or purchase history.
        </p>
      </div>
    </Modal>
  );
}

