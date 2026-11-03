import { OrderStatus, PaginationMeta } from './index';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  product?: {
    id: string;
    sku: string;
    name: string;
    priceCents: number;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface InventoryReservationInfo {
  id: string;
  status: 'ACTIVE' | 'COMMITTED' | 'RELEASED' | 'EXPIRED';
  quantity: number;
  expiresAt: string;
}

export interface PaymentRecord {
  id: string;
  amountCents: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  paymentMethod: string;
  transactionReference: string;
  failureReason?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  totalAmountCents: number;
  shippingAddress: string;
  createdAt: string;
  updatedAt: string;
  orderItems: OrderItem[];
  inventoryReservations?: InventoryReservationInfo[];
  payments?: PaymentRecord[];
}

export interface CreateOrderItemInput {
  productId: string;
  warehouseId?: string;
  quantity: number;
}

export interface CreateOrderInput {
  shippingAddress: string;
  items: CreateOrderItemInput[];
}

export interface PaginatedOrdersResponse {
  orders: Order[];
  pagination: PaginationMeta;
}

export interface ProcessPaymentInput {
  orderId: string;
  amountCents: number;
  paymentMethod?: string;
  simulateOutcome?: 'SUCCESS' | 'FAIL';
}

export interface PaymentProcessResult {
  payment: PaymentRecord;
  orderId: string;
  orderStatus: OrderStatus;
  message: string;
}
