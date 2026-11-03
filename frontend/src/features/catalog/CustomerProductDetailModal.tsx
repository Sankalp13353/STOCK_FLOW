import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Product } from '../../types';
import { formatCurrencyCents } from '../../utils/formatters';
import { useCart } from '../../context/CartContext';
import {
  Package,
  ShoppingCart,
  CheckCircle2,
  ShieldCheck,
  Truck,
  Plus,
  Minus,
} from 'lucide-react';

interface CustomerProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export function CustomerProductDetailModal({
  isOpen,
  onClose,
  product,
}: CustomerProductDetailModalProps) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [addedNotice, setAddedNotice] = useState(false);

  if (!product) return null;

  function handleAddToCart() {
    if (!product) return;
    addToCart(product, quantity);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2500);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product.name}
      subtitle={`Catalog SKU: ${product.sku}`}
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Product Visual & Key Attributes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Visual Placeholder */}
          <div className="w-full h-56 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex flex-col items-center justify-center text-slate-400 p-6 shadow-inner">
            <Package className="w-16 h-16 text-slate-400 mb-2" />
            <span className="font-mono text-xs font-semibold uppercase text-slate-500 tracking-wider">
              {product.sku}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">Verified Wholesale Item</span>
          </div>

          {/* Pricing & Value Props */}
          <div className="space-y-4">
            <div>
              <span className="text-xs text-slate-500 font-medium block">Wholesale Unit Price</span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                {formatCurrencyCents(product.priceCents)}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="success" size="sm">
                  AVAILABLE IN STOCK
                </Badge>
                <span className="text-xs text-slate-500">Distributed multi-hub fulfillment</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-brand-600 shrink-0" />
                <span>Automated multi-warehouse allocation & dispatch</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>15-Minute guaranteed inventory reservation upon order</span>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
            Product Description
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            {product.description ||
              'High-grade commercial catalog product verified for distributed inventory allocation and prompt fulfillment.'}
          </p>
        </div>

        {/* Quantity Selection & Add to Cart Action */}
        <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">Quantity:</span>
            <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 text-center text-xs font-bold text-slate-900 border-none focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {addedNotice && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Added to cart!
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAddToCart}
              leftIcon={<ShoppingCart className="w-4 h-4" />}
            >
              Add to Shopping Cart
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

