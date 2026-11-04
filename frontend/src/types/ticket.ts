export type TicketType = 'ORDER_SHORTAGE' | 'CUSTOMER_DECISION' | 'LOW_STOCK';

export type TicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'CLOSED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type CustomerDecision = 'PENDING' | 'ACCEPTED_PARTIAL' | 'REJECTED' | 'EXPIRED';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type NotificationType =
  | 'ORDER_SHORTAGE'
  | 'CUSTOMER_DECISION_REQUIRED'
  | 'LOW_STOCK_ALERT'
  | 'TICKET_ASSIGNED'
  | 'TICKET_RESOLVED'
  | 'ORDER_APPROVED'
  | 'ORDER_REJECTED';

export interface TicketAllocation {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
}

export interface TicketMetadata {
  orderNumber?: string;
  productName?: string;
  productSku?: string;
  warehouseCode?: string;
  warehouseName?: string;
  thresholdType?: string;
  allocations?: TicketAllocation[];
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  orderId?: string | null;
  customerId?: string | null;
  productId?: string | null;
  warehouseId?: string | null;
  requestedQuantity?: number | null;
  availableQuantity?: number | null;
  shortageQuantity?: number | null;
  quantityOffered?: number | null;
  thresholdQuantity?: number | null;
  deficitQuantity?: number | null;
  customerDecision?: CustomerDecision | null;
  decisionDeadline?: string | null;
  approvalStatus: ApprovalStatus;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  assignedToUserId?: string | null;
  parentTicketId?: string | null;
  resolutionNotes?: string | null;
  metadata?: TicketMetadata | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmountCents: number;
  } | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    priceCents: number;
  } | null;
  warehouse?: {
    id: string;
    name: string;
    code: string;
    city?: string;
  } | null;
  customer?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  assignedToUser?: {
    id: string;
    fullName: string;
    role: string;
  } | null;
  approvedByUser?: {
    id: string;
    fullName: string;
    role: string;
  } | null;
  childTickets?: Array<{
    id: string;
    ticketNumber: string;
    type: TicketType;
    status: TicketStatus;
    customerDecision?: CustomerDecision | null;
  }>;
  parentTicket?: Ticket | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  ticketId?: string | null;
  orderId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  ticket?: {
    id: string;
    ticketNumber: string;
    type: TicketType;
    status: TicketStatus;
    priority: TicketPriority;
  } | null;
}
