import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../hooks/useAuth';
import { createOrder } from '../api/orders';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { formatCurrencyCents } from '../utils/formatters';
import {
  ShieldCheck,
  Package,
  ShoppingCart,
  ArrowLeft,
  Truck,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export function CheckoutPage() {
  const { user } = useAuth();
  const { items, totalItems, totalAmountCents, clearCart } = useCart();
  const navigate = useNavigate();

  // Shipping form fields
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center max-w-md mx-auto my-12">
        <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900">Your Cart is Empty</h3>
        <p className="text-xs text-slate-500 mt-1">
          You must have at least one product in your cart to proceed with checkout.
        </p>
        <Link to="/products" className="inline-block mt-4">
          <Button size="sm" variant="primary">
            Explore Products
          </Button>
        </Link>
      </div>
    );
  }

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!street.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setErrorMsg('Please complete all required shipping address fields.');
      return;
    }

    // Format shipping address cleanly into shippingAddress field
    const formattedShippingAddress = [
      fullName.trim() ? `Recipient: ${fullName.trim()}` : '',
      street.trim(),
      `${city.trim()}, ${state.trim()} ${postalCode.trim()}`,
      phone.trim() ? `Phone: ${phone.trim()}` : '',
      deliveryNotes.trim() ? `Notes: ${deliveryNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    setIsSubmitting(true);
    try {
      // Generate unique idempotency key
      const idempotencyKey = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const orderPayload = {
        shippingAddress: formattedShippingAddress,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
      };

      const createdOrder = await createOrder(orderPayload, idempotencyKey);

      // Successfully created and reserved! Clear local cart
      clearCart();

      // Navigate to order tracking & confirmation page
      navigate(`/orders/${createdOrder.id}`, {
        state: { isNewOrder: true },
      });
    } catch (err: any) {
      setErrorMsg(
        err.message || 'Failed to place order. A product may have insufficient available stock.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order Checkout"
        description="Provide your delivery destination. Inventory reservations will be held automatically upon placement."
        actions={
          <Link to="/cart">
            <Button size="sm" variant="outline" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
              Back to Cart
            </Button>
          </Link>
        }
      />

      {errorMsg && (
        <ErrorMessage
          title="Checkout Submission Issue"
          message={errorMsg}
          onRetry={() => setErrorMsg(null)}
        />
      )}

      <form onSubmit={handleSubmitOrder}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Shipping Form (Left 2 columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Truck className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Shipping Destination
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Johnathan Doe"
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +1 555-0199"
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* Street Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Street Address & Suite/Unit <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="e.g. 742 Evergreen Terrace, Suite 100"
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Springfield"
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* State & Postal Code */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      State / Region <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="e.g. OR"
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Postal Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="e.g. 97477"
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* Delivery Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Delivery Instructions (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="e.g. Leave package with receiving loading dock or call upon arrival."
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Security Guarantee Notice */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
              <Lock className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-slate-900 block">Atomic Two-Phase Inventory Commitment:</span>
                Submitting this order immediately locks stock across the optimal fulfillment warehouse.
                A 15-minute guaranteed reservation is placed while payment is confirmed.
              </div>
            </div>
          </div>

          {/* Order Summary & Submit (Right column) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Order Items ({totalItems})
            </h3>

            {/* Mini Items List */}
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-slate-900 truncate">{product.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Qty: {quantity} × {formatCurrencyCents(product.priceCents)}
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 shrink-0">
                    {formatCurrencyCents(product.priceCents * quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Calculations */}
            <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrencyCents(totalAmountCents)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Fulfillment Fee</span>
                <span className="text-emerald-700 font-medium">Free (B2B Promotion)</span>
              </div>
              <div className="flex items-center justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                <span>Grand Total:</span>
                <span className="text-xl text-brand-600 font-extrabold">
                  {formatCurrencyCents(totalAmountCents)}
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              className="w-full justify-center"
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Confirm & Place Order
            </Button>

            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Backend authoritative price verification enforced</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                <span>Deterministic warehouse allocation</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

