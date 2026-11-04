import request from 'supertest';
import {
  ApprovalStatus,
  CustomerDecision,
  OrderStatus,
  ReservationStatus,
  TicketPriority,
  TicketStatus,
  TicketType,
  UserRole,
} from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { prisma } from '../src/database/prisma';
import { orderService } from '../src/modules/orders/order.service';
import { thresholdEvaluationService } from '../src/modules/inventory/threshold-evaluation.service';
import { notificationService } from '../src/modules/notifications/notification.service';

describe('Phase 2 — Intelligent Ticket Management System', () => {
  let adminToken: string;
  let adminUser: any;

  let managerAToken: string;
  let managerAUser: any;

  let managerBToken: string;
  let managerBUser: any;

  let staffToken: string;
  let staffUser: any;

  let customer1Token: string;
  let customer1User: any;

  let customer2Token: string;
  let customer2User: any;

  let warehouseDelhiId: string;
  let warehouseGurgaonId: string;
  let warehouseJaipurId: string;

  let monitorProductId: string;
  let laptopProductId: string;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    const managerA = await createTestUser(UserRole.WAREHOUSE_MANAGER);
    const managerB = await createTestUser(UserRole.WAREHOUSE_MANAGER);
    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
    const customer1 = await createTestUser(UserRole.CUSTOMER);
    const customer2 = await createTestUser(UserRole.CUSTOMER);

    adminToken = admin.token;
    adminUser = admin.user;

    managerAToken = managerA.token;
    managerAUser = managerA.user;

    managerBToken = managerB.token;
    managerBUser = managerB.user;

    staffToken = staff.token;
    staffUser = staff.user;

    customer1Token = customer1.token;
    customer1User = customer1.user;

    customer2Token = customer2.token;
    customer2User = customer2.user;

    // 1. Create 3 warehouses: Delhi, Gurgaon, Jaipur
    const whDelhi = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-DEL',
        name: 'Delhi Central Depot',
        address: '10 Connaught Place',
        city: 'Delhi',
        country: 'India',
      });
    warehouseDelhiId = whDelhi.body.data.id;

    const whGurgaon = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-GGN',
        name: 'Gurgaon Fulfillment Center',
        address: '20 Cyber Hub',
        city: 'Gurgaon',
        country: 'India',
      });
    warehouseGurgaonId = whGurgaon.body.data.id;

    const whJaipur = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-JPR',
        name: 'Jaipur Logistics Hub',
        address: '30 MI Road',
        city: 'Jaipur',
        country: 'India',
      });
    warehouseJaipurId = whJaipur.body.data.id;

    // 2. Assign Manager A to Delhi & Gurgaon; Manager B to Jaipur only
    await prisma.userWarehouseAssignment.createMany({
      data: [
        { userId: managerAUser.id, warehouseId: warehouseDelhiId, role: UserRole.WAREHOUSE_MANAGER },
        { userId: managerAUser.id, warehouseId: warehouseGurgaonId, role: UserRole.WAREHOUSE_MANAGER },
        { userId: managerBUser.id, warehouseId: warehouseJaipurId, role: UserRole.WAREHOUSE_MANAGER },
        { userId: staffUser.id, warehouseId: warehouseDelhiId, role: UserRole.WAREHOUSE_STAFF },
      ],
    });

    // 3. Create Products
    const monitorProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '4K UltraSharp Monitor',
        sku: 'SKU-MONITOR-4K',
        description: 'Professional color-accurate 27-inch 4K IPS display',
        priceCents: 35000,
      });
    monitorProductId = monitorProd.body.data.id;

    const laptopProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Enterprise Developer Laptop',
        sku: 'SKU-LAPTOP-PRO',
        description: 'High-performance developer workstation',
        priceCents: 150000,
      });
    laptopProductId = laptopProd.body.data.id;
  });

  describe('1. Sufficient Inventory (Scenario A)', () => {
    it('should create order and reserve stock without creating shortage tickets when sufficient stock is available', async () => {
      // Seed Delhi with 10 units
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          quantity: 10,
        });

      // Customer orders 5 units
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: '123 Customer Road, Delhi',
          items: [{ productId: monitorProductId, quantity: 5 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(OrderStatus.RESERVED);
      expect(res.body.data.isShortage).toBeUndefined();

      // Confirm zero tickets created
      const ticketCount = await prisma.ticket.count();
      expect(ticketCount).toBe(0);

      // Confirm active reservation created
      const reservations = await prisma.inventoryReservation.findMany({
        where: { orderId: res.body.data.id },
      });
      expect(reservations.length).toBe(1);
      expect(reservations[0].quantity).toBe(5);
      expect(reservations[0].status).toBe(ReservationStatus.ACTIVE);
    });
  });

  describe('2. Insufficient Inventory & Linked Tickets (Scenario B)', () => {
    beforeEach(async () => {
      // Seed Delhi: 4, Gurgaon: 2, Jaipur: 1 (Total available = 7)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseDelhiId, quantity: 4 });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseGurgaonId, quantity: 2 });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseJaipurId, quantity: 1 });
    });

    it('should identify shortage of 3 units, create order in PENDING status, and generate two linked tickets', async () => {
      // Customer requests 10 monitors (Only 7 available)
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: '456 Business Park, Gurgaon',
          items: [{ productId: monitorProductId, quantity: 10 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(OrderStatus.PENDING);
      expect(res.body.data.isShortage).toBe(true);
      expect(res.body.data.shortages[0].requestedQuantity).toBe(10);
      expect(res.body.data.shortages[0].availableQuantity).toBe(7);
      expect(res.body.data.shortages[0].shortageQuantity).toBe(3);
      expect(res.body.data.shortages[0].quantityOffered).toBe(7);

      // Verify NO stock reserved yet
      const initialReservations = await prisma.inventoryReservation.findMany({
        where: { orderId: res.body.data.id },
      });
      expect(initialReservations.length).toBe(0);

      // Verify two linked tickets in database
      const tickets = await prisma.ticket.findMany({
        where: { orderId: res.body.data.id },
        orderBy: { type: 'asc' },
      });

      expect(tickets.length).toBe(2);

      const decisionTicket = tickets.find((t) => t.type === TicketType.CUSTOMER_DECISION)!;
      const shortageTicket = tickets.find((t) => t.type === TicketType.ORDER_SHORTAGE)!;

      expect(decisionTicket).toBeDefined();
      expect(shortageTicket).toBeDefined();

      // Check ORDER_SHORTAGE details
      expect(shortageTicket.status).toBe(TicketStatus.OPEN);
      expect(shortageTicket.priority).toBe(TicketPriority.HIGH);
      expect(shortageTicket.approvalStatus).toBe(ApprovalStatus.PENDING);
      expect(shortageTicket.requestedQuantity).toBe(10);
      expect(shortageTicket.availableQuantity).toBe(7);
      expect(shortageTicket.shortageQuantity).toBe(3);
      expect(shortageTicket.quantityOffered).toBe(7);

      // Check CUSTOMER_DECISION details
      expect(decisionTicket.status).toBe(TicketStatus.PENDING);
      expect(decisionTicket.customerDecision).toBe(CustomerDecision.PENDING);
      expect(decisionTicket.parentTicketId).toBe(shortageTicket.id);
      expect(decisionTicket.quantityOffered).toBe(7);

      // Verify in-app notifications created
      const notifs = await prisma.notification.findMany({
        where: { orderId: res.body.data.id },
      });
      expect(notifs.length).toBeGreaterThanOrEqual(2);

      const customerNotif = notifs.find((n) => n.userId === customer1User.id);
      expect(customerNotif).toBeDefined();
      expect(customerNotif?.type).toBe('CUSTOMER_DECISION_REQUIRED');
    });

    it('should reject order immediately with HTTP 409 Conflict if allowPartial is explicitly false', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: '456 Business Park, Gurgaon',
          items: [{ productId: monitorProductId, quantity: 10 }],
          allowPartial: false,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('Insufficient stock available');
    });
  });

  describe('3. Customer Decision & Manager Approval Lifecycles', () => {
    let orderId: string;
    let shortageTicketId: string;
    let decisionTicketId: string;

    beforeEach(async () => {
      // Seed Delhi: 4, Gurgaon: 2, Jaipur: 1 (Total = 7)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseDelhiId, quantity: 4 });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseGurgaonId, quantity: 2 });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseJaipurId, quantity: 1 });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: '789 Tech Road, Delhi',
          items: [{ productId: monitorProductId, quantity: 10 }],
        });

      orderId = res.body.data.id;

      const tickets = await prisma.ticket.findMany({ where: { orderId } });
      shortageTicketId = tickets.find((t) => t.type === TicketType.ORDER_SHORTAGE)!.id;
      decisionTicketId = tickets.find((t) => t.type === TicketType.CUSTOMER_DECISION)!.id;
    });

    it('Scenario 1: Customer accepts partial offer, Admin approves -> Atomic reservation commits 7 units', async () => {
      // 1. Customer accepts 7 units
      const acceptRes = await request(app)
        .post(`/api/v1/tickets/${decisionTicketId}/customer-decision`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ action: 'ACCEPT_PARTIAL', notes: 'Accepting 7 units for now' });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.customerDecision).toBe(CustomerDecision.ACCEPTED_PARTIAL);
      expect(acceptRes.body.data.status).toBe(TicketStatus.ACCEPTED);

      // Stock is NOT reserved yet because internal manager approval is still PENDING
      let currentOrder = await prisma.order.findUnique({ where: { id: orderId } });
      expect(currentOrder?.status).toBe(OrderStatus.PENDING);

      // 2. Admin approves internal shortage ticket
      const approveRes = await request(app)
        .post(`/api/v1/tickets/${shortageTicketId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Approved multi-warehouse allocation across Delhi, Gurgaon, and Jaipur' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.approvalStatus).toBe(ApprovalStatus.APPROVED);

      // 3. Both conditions met -> Order transitions to RESERVED, and exactly 7 units reserved across facilities!
      const finalizedOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true, inventoryReservations: true },
      });

      expect(finalizedOrder?.status).toBe(OrderStatus.RESERVED);
      expect(finalizedOrder?.totalAmountCents).toBe(7 * 35000); // Only charged for 7 units!

      const totalReserved = finalizedOrder!.inventoryReservations.reduce((sum: number, r: any) => sum + r.quantity, 0);
      expect(totalReserved).toBe(7);

      // Internal shortage ticket remains open for inventory tracking
      const finalShortageTicket = await prisma.ticket.findUnique({ where: { id: shortageTicketId } });
      expect(finalShortageTicket?.status).toBe(TicketStatus.OPEN);
      expect(finalShortageTicket?.approvalStatus).toBe(ApprovalStatus.APPROVED);
    });

    it('Scenario 2: Customer rejects partial offer -> Order cancelled and tickets closed', async () => {
      const rejectRes = await request(app)
        .post(`/api/v1/tickets/${decisionTicketId}/customer-decision`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ action: 'REJECT_PARTIAL', notes: 'Need complete 10 units at once' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.customerDecision).toBe(CustomerDecision.REJECTED);
      expect(rejectRes.body.data.status).toBe(TicketStatus.REJECTED);

      // Confirm order is cancelled
      const cancelledOrder = await prisma.order.findUnique({ where: { id: orderId } });
      expect(cancelledOrder?.status).toBe(OrderStatus.CANCELLED);

      // Confirm shortage ticket cancelled
      const cancelledTicket = await prisma.ticket.findUnique({ where: { id: shortageTicketId } });
      expect(cancelledTicket?.status).toBe(TicketStatus.CANCELLED);
    });

    it('Scenario 3: Internal manager rejection cancels order and expires customer decision', async () => {
      const rejectRes = await request(app)
        .post(`/api/v1/tickets/${shortageTicketId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Logistics constraints prevent multi-warehouse split shipping' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.approvalStatus).toBe(ApprovalStatus.REJECTED);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.CANCELLED);

      const decisionTicket = await prisma.ticket.findUnique({ where: { id: decisionTicketId } });
      expect(decisionTicket?.status).toBe(TicketStatus.CANCELLED);
      expect(decisionTicket?.customerDecision).toBe(CustomerDecision.EXPIRED);
    });
  });

  describe('4. Security & RBAC Scoping on Tickets', () => {
    let orderId: string;
    let shortageTicketId: string;
    let decisionTicketId: string;

    beforeEach(async () => {
      // Seed Delhi: 5
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseDelhiId, quantity: 5 });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: 'Security Test Street',
          items: [{ productId: monitorProductId, quantity: 8 }],
        });

      orderId = res.body.data.id;
      const tickets = await prisma.ticket.findMany({ where: { orderId } });
      shortageTicketId = tickets.find((t) => t.type === TicketType.ORDER_SHORTAGE)!.id;
      decisionTicketId = tickets.find((t) => t.type === TicketType.CUSTOMER_DECISION)!.id;
    });

    it('should forbid customer from accessing or responding to another customer ticket with HTTP 403', async () => {
      // Customer 2 attempts to read Customer 1's decision ticket
      const viewRes = await request(app)
        .get(`/api/v1/tickets/${decisionTicketId}`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(viewRes.status).toBe(403);
      expect(viewRes.body.error.code).toBe('FORBIDDEN_TICKET_ACCESS');

      // Customer 2 attempts to respond to Customer 1's ticket
      const actRes = await request(app)
        .post(`/api/v1/tickets/${decisionTicketId}/customer-decision`)
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ action: 'ACCEPT_PARTIAL' });

      expect(actRes.status).toBe(403);
      expect(actRes.body.error.code).toBe('FORBIDDEN_TICKET_ACCESS');
    });

    it('should deny manager from approving tickets involving unauthorized warehouses with HTTP 403', async () => {
      // Manager B is assigned ONLY to Jaipur. The shortage ticket involves Delhi.
      const approveRes = await request(app)
        .post(`/api/v1/tickets/${shortageTicketId}/approve`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .send({ notes: 'Attempting unauthorized approval' });

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error.code).toBe('FORBIDDEN_FACILITY_ACCESS');
    });

    it('should forbid ordinary staff from approving tickets with HTTP 403', async () => {
      const approveRes = await request(app)
        .post(`/api/v1/tickets/${shortageTicketId}/approve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'Staff approval attempt' });

      expect(approveRes.status).toBe(403);
    });

    it('should allow assigned manager to approve ticket within their warehouse scope', async () => {
      // Manager A is assigned to Delhi
      const approveRes = await request(app)
        .post(`/api/v1/tickets/${shortageTicketId}/approve`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({ notes: 'Manager A approval within Delhi scope' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.approvalStatus).toBe(ApprovalStatus.APPROVED);
    });
  });

  describe('5. Stale Inventory Protection (Race Conditions After Approval)', () => {
    it('should fail cleanly without reserving stale stock if inventory changes before reservation commits', async () => {
      // Seed Delhi with 5 units
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseDelhiId, quantity: 5 });

      // Customer 1 places order for 8 units -> 5 offered, 3 shortage
      const o1Res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: 'Stale Check St',
          items: [{ productId: monitorProductId, quantity: 8 }],
        });

      const order1Id = o1Res.body.data.id;
      const tickets = await prisma.ticket.findMany({ where: { orderId: order1Id } });
      const decTicket = tickets.find((t) => t.type === TicketType.CUSTOMER_DECISION)!;
      const shortTicket = tickets.find((t) => t.type === TicketType.ORDER_SHORTAGE)!;

      // Customer accepts 5 units
      await request(app)
        .post(`/api/v1/tickets/${decTicket.id}/customer-decision`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ action: 'ACCEPT_PARTIAL' });

      // Concurrent event: Another customer purchases and reserves all 5 units from Delhi!
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          shippingAddress: 'Concurrent Customer St',
          items: [{ productId: monitorProductId, quantity: 5 }],
        });

      // Now available stock in Delhi is 0!
      // Admin attempts to approve Customer 1's shortage ticket:
      const approveRes = await request(app)
        .post(`/api/v1/tickets/${shortTicket.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Approve after concurrent depletion' });

      // System rejects reservation with 409 Conflict due to stale stock!
      expect(approveRes.status).toBe(409);
      expect(approveRes.body.error.message).toContain('Stale stock detected');
    });
  });

  describe('6. Automated Low-Stock Ticket Lifecycle', () => {
    it('should automatically create a LOW_STOCK ticket when inventory falls below threshold and resolve it when replenished', async () => {
      // 1. Configure threshold of 15 units at Delhi
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          minQuantity: 15,
        });

      // 2. Restock 10 units (10 < 15 -> Low stock!)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          quantity: 10,
        });

      // 3. Confirm LOW_STOCK ticket automatically created
      const lowStockTicket = await prisma.ticket.findFirst({
        where: {
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          type: TicketType.LOW_STOCK,
          status: TicketStatus.OPEN,
        },
      });

      expect(lowStockTicket).toBeDefined();
      expect(lowStockTicket?.availableQuantity).toBe(10);
      expect(lowStockTicket?.thresholdQuantity).toBe(15);
      expect(lowStockTicket?.deficitQuantity).toBe(5);

      // 4. Repeated evaluation must NOT create duplicate tickets
      await thresholdEvaluationService.evaluateStockAfterChange(monitorProductId, warehouseDelhiId);
      const ticketCount = await prisma.ticket.count({
        where: {
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          type: TicketType.LOW_STOCK,
        },
      });
      expect(ticketCount).toBe(1);

      // 5. Restock additional 10 units (Total available: 20 >= 15 -> Stock recovered!)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          quantity: 10,
        });

      // 6. Confirm ticket is automatically resolved!
      const resolvedTicket = await prisma.ticket.findUnique({
        where: { id: lowStockTicket!.id },
      });
      expect(resolvedTicket?.status).toBe(TicketStatus.RESOLVED);
      expect(resolvedTicket?.resolvedAt).not.toBeNull();
      expect(resolvedTicket?.resolutionNotes).toContain('Stock verified and recovered');
    });

    it('should prevent manually resolving a LOW_STOCK ticket if stock has not recovered with HTTP 400', async () => {
      // Configure threshold 20
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          minQuantity: 20,
        });

      // Restock only 5
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: monitorProductId,
          warehouseId: warehouseDelhiId,
          quantity: 5,
        });

      const ticket = await prisma.ticket.findFirst({
        where: { productId: monitorProductId, warehouseId: warehouseDelhiId, type: TicketType.LOW_STOCK },
      });

      // Manager attempts to manually resolve ticket without restocking
      const res = await request(app)
        .post(`/api/v1/tickets/${ticket!.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolutionNotes: 'Attempting premature resolution' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('STOCK_NOT_RECOVERED');
    });
  });

  describe('7. Payment Safety Rules', () => {
    it('should reject payment for an order in PENDING status awaiting shortage decision with HTTP 422', async () => {
      // Seed Delhi with 2 units
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: monitorProductId, warehouseId: warehouseDelhiId, quantity: 2 });

      // Customer orders 5 units -> enters PENDING status
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: 'Payment Safety St',
          items: [{ productId: monitorProductId, quantity: 5 }],
        });

      const orderId = orderRes.body.data.id;

      // Customer attempts to pay before shortage approval & decision
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderId,
          amountCents: orderRes.body.data.totalAmountCents,
          paymentMethod: 'MOCK_CARD',
          simulateOutcome: 'SUCCESS',
        });

      expect(payRes.status).toBe(422);
      expect(payRes.body.error.message).toContain('awaiting shortage approval');
    });
  });

  describe('8. In-App Notifications & Deduplication', () => {
    it('should list user notifications, allow marking as read, and prevent duplicate notifications via dedupKey', async () => {
      // Create notification with dedupKey
      const notif1 = await notificationService.createNotification({
        userId: customer1User.id,
        type: 'CUSTOMER_DECISION_REQUIRED',
        title: 'Decision Required',
        message: 'Please review your order shortage',
        dedupKey: 'notif:test:dedup:1',
      });

      // Attempt duplicate notification with same dedupKey
      const notif2 = await notificationService.createNotification({
        userId: customer1User.id,
        type: 'CUSTOMER_DECISION_REQUIRED',
        title: 'Decision Required Duplicate',
        message: 'Duplicate message',
        dedupKey: 'notif:test:dedup:1',
      });

      expect(notif1.id).toBe(notif2.id);

      // Verify list endpoint
      const listRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.notifications.length).toBe(1);
      expect(listRes.body.data.unreadCount).toBe(1);

      // Mark single notification as read
      const readRes = await request(app)
        .post(`/api/v1/notifications/${notif1.id}/read`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.isRead).toBe(true);

      // Mark all read
      const markAllRes = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(markAllRes.status).toBe(200);
    });
  });
});
