import { OrderStatus, PaginationMeta } from './index';
import { InventoryMovementRecord } from './inventory';

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
  inventoryId?: string;
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



export interface OrderCustomerInfo {
  id: string;
  email: string;
  fullName: string;
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
  user?: OrderCustomerInfo;
  inventoryReservations?: InventoryReservationInfo[];
  payments?: PaymentRecord[];
  inventoryMovements?: InventoryMovementRecord[];
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

export interface ListOrdersQueryParams {
  page?: number;
  limit?: number;
  status?: OrderStatus | 'ALL';
  search?: string;
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
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

export interface ProcessOrderInput {
  notes?: string;
}

export interface DispatchOrderInput {
  warehouseId?: string;
  trackingNumber?: string;
  notes?: string;
}

export interface DeliverOrderInput {
  notes?: string;
  deliveryNotes?: string;
  deliveredAt?: string;
}

export interface FulfilmentActionResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  message: string;
}
