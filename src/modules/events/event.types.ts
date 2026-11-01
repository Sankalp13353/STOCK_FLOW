export interface EventEnvelope<T = any> {
  id: string; // Corresponds directly to outbox_events.id (UUID)
  type: string; // e.g., 'order.created', 'order.confirmed'
  aggregateType: string; // 'Order'
  aggregateId: string; // orderId
  payload: T;
  timestamp: string; // ISO-8601 string
  version: number; // e.g., 1
}

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  totalAmountCents: number;
  shippingAddress: string;
  items: Array<{
    productId: string;
    warehouseId: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }>;
  createdAt: string;
}

export interface OrderConfirmedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  paymentId: string;
  amountCents: number;
  confirmedAt: string;
}

export interface OrderCancelledPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  reason: string;
  stockReleased: boolean;
  cancelledAt: string;
}

export interface OrderPaymentFailedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  paymentId: string;
  amountCents: number;
  failureReason: string;
  failedAt: string;
}

export interface OrderReservationExpiredPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  expiredAt: string;
}

