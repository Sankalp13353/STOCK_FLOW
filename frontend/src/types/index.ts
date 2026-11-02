export type UserRole = 'ADMIN' | 'WAREHOUSE_STAFF' | 'CUSTOMER';

export type OrderStatus =
  | 'PENDING'
  | 'RESERVED'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'PAYMENT_FAILED'
  | 'RESERVATION_EXPIRED';

export interface PaginationMeta {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    pagination?: PaginationMeta;
  };
}

