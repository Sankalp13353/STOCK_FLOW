import {
  ApprovalStatus,
  CustomerDecision,
  NotificationType,
  Prisma,
  TicketPriority,
  TicketStatus,
  TicketType,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app-error';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { notificationService } from '../notifications/notification.service';
import { orderService } from '../orders/order.service';

export interface ListTicketsQuery {
  type?: TicketType;
  status?: TicketStatus;
  priority?: TicketPriority;
  warehouseId?: string;
  orderId?: string;
  productId?: string;
  page?: number;
  limit?: number;
}

export class TicketService {
  /**
   * Generates a human-readable unique ticket number.
   * e.g. TCK-SHORT-1730700000000-1234
   */
  public generateTicketNumber(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `TCK-${prefix}-${timestamp}-${random}`;
  }

  /**
   * Lists tickets enforcing role boundaries and warehouse isolation.
   */
  public async listTickets(
    user: { userId: string; role: UserRole },
    query: ListTicketsQuery = {}
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.TicketWhereInput = {};

    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.orderId) where.orderId = query.orderId;
    if (query.productId) where.productId = query.productId;

    // RBAC & Warehouse Scoping
    if (user.role === UserRole.CUSTOMER) {
      // Customers can only see their own tickets (primarily CUSTOMER_DECISION)
      where.customerId = user.userId;
    } else if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
      const assignedIds = Array.isArray(accessibleIds) ? accessibleIds : [];
      where.OR = [
        { warehouseId: { in: assignedIds } },
        { assignedToUserId: user.userId },
      ];
    }
    // ADMIN has unrestricted organisation-wide visibility

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          product: { select: { id: true, name: true, sku: true, priceCents: true } },
          warehouse: { select: { id: true, name: true, code: true, city: true } },
          customer: { select: { id: true, fullName: true, email: true } },
          assignedToUser: { select: { id: true, fullName: true, role: true } },
          approvedByUser: { select: { id: true, fullName: true, role: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmountCents: true,
            },
          },
          childTickets: {
            select: {
              id: true,
              ticketNumber: true,
              type: true,
              status: true,
              customerDecision: true,
            },
          },
        },
      }),
    ]);

    return {
      tickets,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves a single ticket by ID with RBAC check.
   */
  public async getTicketById(user: { userId: string; role: UserRole }, id: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, sku: true, priceCents: true } },
        warehouse: { select: { id: true, name: true, code: true, city: true } },
        customer: { select: { id: true, fullName: true, email: true } },
        assignedToUser: { select: { id: true, fullName: true, role: true } },
        approvedByUser: { select: { id: true, fullName: true, role: true } },
        parentTicket: true,
        childTickets: true,
        order: {
          include: {
            orderItems: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
                warehouse: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    }

    // Role-based authorization
    if (user.role === UserRole.CUSTOMER) {
      if (ticket.customerId !== user.userId) {
        throw new ForbiddenError('You can only view your own tickets', 'FORBIDDEN_TICKET_ACCESS');
      }
    } else if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      if (ticket.warehouseId) {
        const hasAccess = await warehouseAccessService.hasWarehouseAccess(user.userId, user.role, ticket.warehouseId);
        const isAssigned = ticket.assignedToUserId === user.userId;
        if (!hasAccess && !isAssigned) {
          throw new ForbiddenError(
            'You do not have access to tickets for this warehouse',
            'FORBIDDEN_FACILITY_ACCESS'
          );
        }
      }
    }

    return ticket;
  }

  /**
   * Creates linked ORDER_SHORTAGE and CUSTOMER_DECISION tickets during order creation.
   */
  public async createShortageTickets(
    params: {
      orderId: string;
      orderNumber: string;
      customerId: string;
      productId: string;
      requestedQuantity: number;
      availableQuantity: number;
      shortageQuantity: number;
      quantityOffered: number;
      allocations: Array<{ warehouseId: string; warehouseCode: string; warehouseName: string; quantity: number }>;
      productName: string;
      productSku: string;
    },
    tx: Prisma.TransactionClient
  ) {
    const primaryWarehouseId = params.allocations.length > 0 ? params.allocations[0].warehouseId : null;
    const warehouseIds = params.allocations.map((a) => a.warehouseId);

    // 1. Create Internal ORDER_SHORTAGE Ticket
    const shortageTicketNumber = this.generateTicketNumber('SHORT');
    const shortageTicket = await tx.ticket.create({
      data: {
        ticketNumber: shortageTicketNumber,
        type: TicketType.ORDER_SHORTAGE,
        status: TicketStatus.OPEN,
        priority: TicketPriority.HIGH,
        orderId: params.orderId,
        customerId: params.customerId,
        productId: params.productId,
        warehouseId: primaryWarehouseId,
        requestedQuantity: params.requestedQuantity,
        availableQuantity: params.availableQuantity,
        shortageQuantity: params.shortageQuantity,
        quantityOffered: params.quantityOffered,
        approvalStatus: ApprovalStatus.PENDING,
        metadata: {
          orderNumber: params.orderNumber,
          productName: params.productName,
          productSku: params.productSku,
          allocations: params.allocations,
        },
      },
    });

    // 2. Create Linked CUSTOMER_DECISION Ticket
    const decisionTicketNumber = this.generateTicketNumber('DEC');
    const decisionDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours deadline

    const decisionTicket = await tx.ticket.create({
      data: {
        ticketNumber: decisionTicketNumber,
        type: TicketType.CUSTOMER_DECISION,
        status: TicketStatus.PENDING,
        priority: TicketPriority.HIGH,
        orderId: params.orderId,
        customerId: params.customerId,
        productId: params.productId,
        warehouseId: primaryWarehouseId,
        requestedQuantity: params.requestedQuantity,
        availableQuantity: params.availableQuantity,
        shortageQuantity: params.shortageQuantity,
        quantityOffered: params.quantityOffered,
        customerDecision: CustomerDecision.PENDING,
        decisionDeadline,
        parentTicketId: shortageTicket.id,
        metadata: {
          orderNumber: params.orderNumber,
          productName: params.productName,
          productSku: params.productSku,
          allocations: params.allocations,
        },
      },
    });

    // 3. Send in-app notifications
    // A. Customer notification
    await notificationService.createNotification(
      {
        userId: params.customerId,
        ticketId: decisionTicket.id,
        orderId: params.orderId,
        type: NotificationType.CUSTOMER_DECISION_REQUIRED,
        title: `Action Required: Partial stock offer for Order ${params.orderNumber}`,
        message: `We can offer ${params.quantityOffered} of ${params.requestedQuantity} requested units for ${params.productName}. Please accept or reject this offer.`,
        dedupKey: `notif:cust_decision:${decisionTicket.id}`,
        metadata: {
          decisionTicketId: decisionTicket.id,
          orderId: params.orderId,
          quantityOffered: params.quantityOffered,
          requestedQuantity: params.requestedQuantity,
        },
      },
      tx
    );

    // B. Admin notification
    await notificationService.notifyAdmins(
      {
        ticketId: shortageTicket.id,
        orderId: params.orderId,
        type: NotificationType.ORDER_SHORTAGE,
        title: `Order Shortage: Order ${params.orderNumber}`,
        message: `Shortage of ${params.shortageQuantity} units for ${params.productName} (SKU: ${params.productSku}). Available: ${params.availableQuantity}/${params.requestedQuantity}.`,
        dedupKeyPrefix: `notif:shortage:${shortageTicket.id}`,
      },
      tx
    );

    // C. Warehouse Managers notification
    await notificationService.notifyWarehouseManagers(
      warehouseIds,
      {
        ticketId: shortageTicket.id,
        orderId: params.orderId,
        type: NotificationType.ORDER_SHORTAGE,
        title: `Order Shortage in Assigned Warehouse: Order ${params.orderNumber}`,
        message: `Inventory shortage for ${params.productName}. Please review and approve proposed fulfillment.`,
        dedupKeyPrefix: `notif:shortage:${shortageTicket.id}`,
      },
      tx
    );

    return {
      shortageTicket,
      decisionTicket,
    };
  }

  /**
   * Assigns a ticket to a staff member or manager.
   */
  public async assignTicket(
    user: { userId: string; role: UserRole },
    ticketId: string,
    assignedToUserId: string
  ) {
    const ticket = await this.getTicketById(user, ticketId);

    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Customers cannot assign tickets', 'FORBIDDEN_ACTION');
    }

    if (user.role === UserRole.WAREHOUSE_MANAGER && ticket.warehouseId) {
      const hasAccess = await warehouseAccessService.hasWarehouseAccess(user.userId, user.role, ticket.warehouseId);
      if (!hasAccess) {
        throw new ForbiddenError('Cannot assign tickets outside your assigned facility', 'FORBIDDEN_FACILITY_ACCESS');
      }
    }

    const assignedUser = await prisma.user.findUnique({
      where: { id: assignedToUserId },
    });

    if (!assignedUser) {
      throw new NotFoundError('Assigned user not found', 'USER_NOT_FOUND');
    }

    const nextStatus = ticket.status === TicketStatus.OPEN ? TicketStatus.ASSIGNED : ticket.status;

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedToUserId,
        status: nextStatus,
      },
    });

    // Notify assigned user
    await notificationService.createNotification({
      userId: assignedToUserId,
      ticketId: ticket.id,
      orderId: ticket.orderId,
      type: NotificationType.TICKET_ASSIGNED,
      title: `Ticket Assigned: ${ticket.ticketNumber}`,
      message: `You have been assigned to ticket ${ticket.ticketNumber} (${ticket.type}).`,
      dedupKey: `notif:assigned:${ticket.id}:${assignedToUserId}`,
    });

    return updated;
  }

  /**
   * Approves an internal ORDER_SHORTAGE ticket.
   */
  public async approveTicket(
    user: { userId: string; role: UserRole },
    ticketId: string,
    notes?: string
  ) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.WAREHOUSE_MANAGER) {
      throw new ForbiddenError('Only Admins and Warehouse Managers can approve shortage tickets', 'FORBIDDEN_ACTION');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        childTickets: true,
        order: true,
      },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    }

    if (ticket.type !== TicketType.ORDER_SHORTAGE) {
      throw new BadRequestError('Only ORDER_SHORTAGE tickets require internal approval', 'INVALID_TICKET_TYPE');
    }

    // Verify manager facility authorization
    if (user.role === UserRole.WAREHOUSE_MANAGER) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
      const assignedIds = Array.isArray(accessibleIds) ? accessibleIds : [];
      const allocations = (ticket.metadata as any)?.allocations || [];
      const ticketWarehouseIds: string[] = allocations.length > 0
        ? allocations.map((a: any) => a.warehouseId)
        : ticket.warehouseId ? [ticket.warehouseId] : [];

      const isAuthorized = ticketWarehouseIds.every((whId) => assignedIds.includes(whId));
      if (!isAuthorized) {
        throw new ForbiddenError(
          'A manager can only approve tickets within their authorized warehouse scope',
          'FORBIDDEN_FACILITY_ACCESS'
        );
      }
    }

    if (ticket.approvalStatus === ApprovalStatus.APPROVED) {
      throw new ConflictError('Ticket is already approved', 'TICKET_ALREADY_APPROVED');
    }

    const resolutionNotes = notes
      ? `${ticket.resolutionNotes || ''}\nApproved by ${user.userId}: ${notes}`.trim()
      : ticket.resolutionNotes;

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedByUserId: user.userId,
        approvedAt: new Date(),
        resolutionNotes,
      },
    });

    // Check if the linked customer decision ticket has already been accepted
    const customerDecisionTicket = ticket.childTickets.find(
      (c) => c.type === TicketType.CUSTOMER_DECISION
    ) || await prisma.ticket.findFirst({
      where: { parentTicketId: ticket.id, type: TicketType.CUSTOMER_DECISION },
    });

    if (customerDecisionTicket && customerDecisionTicket.customerDecision === CustomerDecision.ACCEPTED_PARTIAL && ticket.orderId) {
      // Both approvals met! Finalize reservation and adjust order!
      await orderService.finalizeShortageOrderReservation(ticket.orderId);
    }

    // Notify customer that approval was granted
    if (ticket.customerId) {
      await notificationService.createNotification({
        userId: ticket.customerId,
        ticketId: ticket.id,
        orderId: ticket.orderId,
        type: NotificationType.ORDER_APPROVED,
        title: `Partial Order Approved: Ticket ${ticket.ticketNumber}`,
        message: `Your partial order offer has been internally approved.`,
        dedupKey: `notif:approved:${ticket.id}`,
      });
    }

    return updated;
  }

  /**
   * Rejects an internal ORDER_SHORTAGE ticket.
   */
  public async rejectTicket(
    user: { userId: string; role: UserRole },
    ticketId: string,
    reason: string
  ) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.WAREHOUSE_MANAGER) {
      throw new ForbiddenError('Only Admins and Warehouse Managers can reject shortage tickets', 'FORBIDDEN_ACTION');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { childTickets: true, order: true },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    }

    if (ticket.type !== TicketType.ORDER_SHORTAGE) {
      throw new BadRequestError('Only ORDER_SHORTAGE tickets can be rejected via this endpoint', 'INVALID_TICKET_TYPE');
    }

    // Verify manager facility authorization
    if (user.role === UserRole.WAREHOUSE_MANAGER && ticket.warehouseId) {
      const hasAccess = await warehouseAccessService.hasWarehouseAccess(user.userId, user.role, ticket.warehouseId);
      if (!hasAccess) {
        throw new ForbiddenError(
          'A manager can only reject tickets within their authorized warehouse scope',
          'FORBIDDEN_FACILITY_ACCESS'
        );
      }
    }

    const resolutionNotes = `Rejected by ${user.userId}: ${reason}`;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update shortage ticket
      const t = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          approvalStatus: ApprovalStatus.REJECTED,
          status: TicketStatus.CANCELLED,
          resolutionNotes,
          resolvedAt: new Date(),
        },
      });

      // 2. Expire / Cancel linked customer decision ticket
      await tx.ticket.updateMany({
        where: { parentTicketId: ticketId, type: TicketType.CUSTOMER_DECISION },
        data: {
          customerDecision: CustomerDecision.EXPIRED,
          status: TicketStatus.CANCELLED,
          resolutionNotes: `Internal shortage was rejected: ${reason}`,
          resolvedAt: new Date(),
        },
      });

      // 3. Cancel order if present
      if (ticket.orderId) {
        await orderService.cancelOrder(
          ticket.orderId,
          user,
          `Shortage fulfillment rejected internally: ${reason}`
        );
      }

      return t;
    });

    // Notify customer
    if (ticket.customerId) {
      await notificationService.createNotification({
        userId: ticket.customerId,
        ticketId: ticket.id,
        orderId: ticket.orderId,
        type: NotificationType.ORDER_REJECTED,
        title: `Order Cancelled: Insufficient Stock`,
        message: `We regret that we cannot fulfill your order due to stock constraints: ${reason}`,
        dedupKey: `notif:rejected:${ticket.id}`,
      });
    }

    return updated;
  }

  /**
   * Resolves a ticket.
   * If LOW_STOCK, verifies that current available stock has genuinely recovered!
   */
  public async resolveTicket(
    user: { userId: string; role: UserRole },
    ticketId: string,
    resolutionNotes: string
  ) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Customers cannot resolve internal tickets', 'FORBIDDEN_ACTION');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    }

    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      throw new ConflictError('Ticket is already resolved or closed', 'TICKET_ALREADY_RESOLVED');
    }

    // Manager facility authorization
    if (user.role === UserRole.WAREHOUSE_MANAGER && ticket.warehouseId) {
      const hasAccess = await warehouseAccessService.hasWarehouseAccess(user.userId, user.role, ticket.warehouseId);
      if (!hasAccess) {
        throw new ForbiddenError('Cannot resolve ticket for unassigned warehouse', 'FORBIDDEN_FACILITY_ACCESS');
      }
    }

    // LOW_STOCK Verification: Stock must have genuinely recovered!
    if (ticket.type === TicketType.LOW_STOCK && ticket.productId && ticket.warehouseId) {
      const inv = await prisma.inventory.findUnique({
        where: {
          productId_warehouseId: {
            productId: ticket.productId,
            warehouseId: ticket.warehouseId,
          },
        },
      });

      const currentAvailable = (inv?.quantityOnHand || 0) - (inv?.quantityReserved || 0);
      const threshold = ticket.thresholdQuantity || 10;

      if (currentAvailable < threshold) {
        throw new BadRequestError(
          `Cannot resolve LOW_STOCK ticket: Available stock (${currentAvailable}) is still below threshold (${threshold}). Restock must be verified first.`,
          'STOCK_NOT_RECOVERED'
        );
      }
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(),
        resolutionNotes: resolutionNotes || ticket.resolutionNotes,
      },
    });

    return updated;
  }

  /**
   * Processes a customer decision on a CUSTOMER_DECISION ticket.
   */
  public async handleCustomerDecision(
    user: { userId: string; role: UserRole },
    ticketId: string,
    action: 'ACCEPT_PARTIAL' | 'REJECT_PARTIAL',
    notes?: string
  ) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        parentTicket: true,
        order: true,
      },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    }

    if (ticket.type !== TicketType.CUSTOMER_DECISION) {
      throw new BadRequestError('Customer decision can only be applied to CUSTOMER_DECISION tickets', 'INVALID_TICKET_TYPE');
    }

    // Ensure customer owns this ticket (or admin acting on customer's behalf)
    if (user.role === UserRole.CUSTOMER && ticket.customerId !== user.userId) {
      throw new ForbiddenError('You can only respond to your own decision tickets', 'FORBIDDEN_TICKET_ACCESS');
    }

    if (ticket.customerDecision !== CustomerDecision.PENDING) {
      throw new ConflictError(
        `Decision has already been recorded: ${ticket.customerDecision}`,
        'DECISION_ALREADY_RECORDED'
      );
    }

    // Check deadline
    if (ticket.decisionDeadline && new Date() > ticket.decisionDeadline) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          customerDecision: CustomerDecision.EXPIRED,
          status: TicketStatus.EXPIRED,
          resolvedAt: new Date(),
        },
      });
      throw new ConflictError('Decision deadline has expired', 'DEADLINE_EXPIRED');
    }

    if (action === 'ACCEPT_PARTIAL') {
      const updated = await prisma.$transaction(async (tx) => {
        const dec = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            customerDecision: CustomerDecision.ACCEPTED_PARTIAL,
            status: TicketStatus.ACCEPTED,
            resolutionNotes: notes || 'Customer accepted partial fulfillment offer',
            resolvedAt: new Date(),
          },
        });

        // Record customer's decision on the parent shortage ticket as well
        if (ticket.parentTicketId) {
          await tx.ticket.update({
            where: { id: ticket.parentTicketId },
            data: {
              resolutionNotes: `Customer accepted partial quantity (${ticket.quantityOffered} units).`,
            },
          });
        }

        return dec;
      });

      // Check if internal manager/admin approval is already granted
      const parentTicket = ticket.parentTicket || (ticket.parentTicketId
        ? await prisma.ticket.findUnique({ where: { id: ticket.parentTicketId } })
        : null);

      if (parentTicket && parentTicket.approvalStatus === ApprovalStatus.APPROVED && ticket.orderId) {
        // Both conditions met: atomically reserve and finalize order!
        await orderService.finalizeShortageOrderReservation(ticket.orderId);
      }

      // Notify admins and managers of acceptance
      await notificationService.notifyAdmins({
        ticketId: ticket.id,
        orderId: ticket.orderId,
        type: NotificationType.ORDER_SHORTAGE,
        title: `Customer Accepted Partial Order: ${ticket.ticketNumber}`,
        message: `Customer accepted partial order of ${ticket.quantityOffered} units. Internal Approval Status: ${parentTicket?.approvalStatus || 'PENDING'}.`,
        dedupKeyPrefix: `notif:cust_accept:${ticket.id}`,
      });

      return updated;
    } else {
      // REJECT_PARTIAL
      const updated = await prisma.$transaction(async (tx) => {
        // 1. Close decision ticket
        const dec = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            customerDecision: CustomerDecision.REJECTED,
            status: TicketStatus.REJECTED,
            resolutionNotes: notes || 'Customer rejected partial fulfillment offer',
            resolvedAt: new Date(),
          },
        });

        // 2. Update parent internal ticket
        if (ticket.parentTicketId) {
          await tx.ticket.update({
            where: { id: ticket.parentTicketId },
            data: {
              status: TicketStatus.CANCELLED,
              resolutionNotes: 'Customer rejected partial fulfillment offer. Order cancelled.',
              resolvedAt: new Date(),
            },
          });
        }

        return dec;
      });

      // 3. Cancel order and release any reservations
      if (ticket.orderId) {
        await orderService.cancelOrder(
          ticket.orderId,
          user,
          'Customer rejected partial fulfillment offer'
        );
      }

      // Notify admins
      await notificationService.notifyAdmins({
        ticketId: ticket.id,
        orderId: ticket.orderId,
        type: NotificationType.ORDER_SHORTAGE,
        title: `Customer Rejected Partial Order: ${ticket.ticketNumber}`,
        message: `Customer rejected partial offer of ${ticket.quantityOffered} units. Order cancelled.`,
        dedupKeyPrefix: `notif:cust_reject:${ticket.id}`,
      });

      return updated;
    }
  }
}

export const ticketService = new TicketService();
