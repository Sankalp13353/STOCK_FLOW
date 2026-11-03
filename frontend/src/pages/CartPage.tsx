import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useCart } from '../context/CartContext';
import { formatCurrencyCents } from '../utils/formatters';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  Package,
  ShieldCheck,
  Truck,
  ArrowLeft,
} from 'lucide-react';

export function CartPage() {
  const {
    items,
    updateQuantity,
    removeFromCart,
    clearCart,
    totalItems,
    totalAmountCents,
  } = useCart();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your Shopping Cart"
        description="Review selected wholesale products, adjust quantities, and proceed to secure order checkout."
        actions={
          items.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={clearCart}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Clear Cart
            </Button>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        /* Empty Cart State */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-4">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Your Shopping Cart is Empty</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            You haven't added any wholesale catalog items yet. Explore our verified products and add items to your cart.
          </p>
          <div className="mt-6">
            <Link to="/products">
              <Button size="sm" variant="primary" leftIcon={<Package className="w-4 h-4" />}>
                Browse Product Catalog
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        /* Cart Content Grid */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Cart Items List */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Cart Items ({totalItems} {totalItems === 1 ? 'unit' : 'units'})
              </span>
              <Link
                to="/products"
                className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Continue Shopping
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map(({ product, quantity }) => {
                const itemSubtotal = product.priceCents * quantity;

                return (
                  <div
                    key={product.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Product Basic Info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {product.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-600">
                            {product.sku}
                          </span>
                          <span>•</span>
                          <span>Unit Price: {formatCurrencyCents(product.priceCents)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quantity Selector & Subtotal */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                      {/* Quantity Controller */}
                      <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) =>
                            updateQuantity(product.id, parseInt(e.target.value) || 1)
                          }
                          className="w-11 text-center text-xs font-bold text-slate-900 border-none focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Subtotal */}
                      <div className="text-right min-w-[80px]">
                        <span className="text-[10px] text-slate-400 block uppercase">Subtotal</span>
                        <span className="font-bold text-sm text-slate-900">
                          {formatCurrencyCents(itemSubtotal)}
                        </span>
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remove item"
                        aria-label={`Remove ${product.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart Summary Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Order Summary
            </h3>

            <div className="space-y-3 text-xs border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between text-slate-600">
                <span>Items Subtotal ({totalItems} units)</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrencyCents(totalAmountCents)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Estimated Shipping</span>
                <span className="text-emerald-700 font-medium">Calculated at Checkout</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Inventory Reservation Hold</span>
                <span className="text-emerald-700 font-medium">Guaranteed 15 min</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-base font-bold text-slate-900">
              <span>Total Value:</span>
              <span className="text-xl text-brand-600 font-extrabold">
                {formatCurrencyCents(totalAmountCents)}
              </span>
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={() => navigate('/checkout')}
              className="w-full justify-center"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Proceed to Checkout
            </Button>

            <div className="space-y-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                <span>Smart distributed warehouse fulfillment allocation</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Backend revalidates authoritative pricing and live stock</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

