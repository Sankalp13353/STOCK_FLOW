import request from 'supertest';
import {
  ApprovalStatus,
  CustomerDecision,
  MovementType,
  OrderStatus,
  ReservationStatus,
  TicketPriority,
  TicketStatus,
  TicketType,
  UserRole,
} from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Phase 6 — Full-Platform End-to-End Business Workflows', () => {
  let adminToken: string;
  let adminUser: any;
  let managerToken: string;
  let managerUser: any;
  let staffWarehouseAToken: string;
  let staffWarehouseAUser: any;
  let staffWarehouseBToken: string;
  let staffWarehouseBUser: any;
  let customerToken: string;
  let customerUser: any;

  let warehouseAId: string;
  let warehouseBId: string;
  let product1Id: string;
  let product2Id: string;

  beforeEach(async () => {
    await clearDatabase();

    // 1. Create Baseline Users
    const admin = await createTestUser(UserRole.ADMIN);
    adminToken = admin.token;
    adminUser = admin.user;

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);
    managerToken = manager.token;
    managerUser = manager.user;

    const staffA = await createTestUser(UserRole.WAREHOUSE_STAFF);
    staffWarehouseAToken = staffA.token;
    staffWarehouseAUser = staffA.user;

    const staffB = await createTestUser(UserRole.WAREHOUSE_STAFF);
    staffWarehouseBToken = staffB.token;
    staffWarehouseBUser = staffB.user;

    const customer = await createTestUser(UserRole.CUSTOMER);
    customerToken = customer.token;
    customerUser = customer.user;

    // 2. Create Warehouses
    const whA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-ALPHA-01',
        name: 'Alpha Fulfillment Hub',
        address: '100 Alpha Way',
        city: 'Austin',
        country: 'USA',
      });
    warehouseAId = whA.body.data.id;

    const whB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-BETA-02',
        name: 'Beta Regional Facility',
        address: '200 Beta Blvd',
        city: 'Seattle',
        country: 'USA',
      });
    warehouseBId = whB.body.data.id;

    // 3. Assign Staff to Warehouses
    // Manager assigned to both A and B
    await prisma.userWarehouseAssignment.createMany({
      data: [
        { userId: managerUser.id, warehouseId: warehouseAId, role: UserRole.WAREHOUSE_MANAGER },
        { userId: managerUser.id, warehouseId: warehouseBId, role: UserRole.WAREHOUSE_MANAGER },
        { userId: staffWarehouseAUser.id, warehouseId: warehouseAId, role: UserRole.WAREHOUSE_STAFF },
        { userId: staffWarehouseBUser.id, warehouseId: warehouseBId, role: UserRole.WAREHOUSE_STAFF },
      ],
    });

    // 4. Create Products
    const prod1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-PRO-DRONE',
        name: 'Enterprise Survey Drone',
        description: 'Autonomous multi-rotor survey drone',
        priceCents: 150000,
      });
    product1Id = prod1.body.data.id;

    const prod2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-BATTERY-PACK',
        name: 'High Capacity LiPo Battery',
        description: 'Fast-charging high discharge battery pack',
        priceCents: 15000,
      });
    product2Id = prod2.body.data.id;
  });

  // =========================================================================
  // WORKFLOW A: Successful Order Fulfilment Lifecycle
  // =========================================================================
  describe('Workflow A: Successful Order Fulfilment Lifecycle', () => {
    it('executes full 16-step end-to-end fulfilment lifecycle from checkout to delivery and dashboard verification', async () => {
      // Step 1: Restock Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product1Id, warehouseId: warehouseAId, quantity: 20 });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product2Id, warehouseId: warehouseAId, quantity: 50 });

      // Step 2: Customer places a multi-item order (2 drones, 5 batteries)
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '450 Tech Parkway, Austin, TX 78701',
          items: [
            { productId: product1Id, warehouseId: warehouseAId, quantity: 2 },
            { productId: product2Id, warehouseId: warehouseAId, quantity: 5 },
          ],
        });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.status).toBe(OrderStatus.RESERVED);

      // Step 3: Inventory is reserved: on-hand is intact, reserved is incremented
      const invProd1BeforePay = await prisma.inventory.findUnique({
        where: { productId_warehouseId: { productId: product1Id, warehouseId: warehouseAId } },
      });
      expect(invProd1BeforePay?.quantityOnHand).toBe(20); // Not decremented
      expect(invProd1BeforePay?.quantityReserved).toBe(2);

      // Step 4 & 5: Payment succeeds; physical stock remains UNCHANGED
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: order.id,
          amountCents: order.totalAmountCents,
          paymentMethod: 'VISA_CORPORATE',
          simulateOutcome: 'SUCCESS',
        });
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.orderStatus).toBe(OrderStatus.CONFIRMED);

      const invProd1AfterPay = await prisma.inventory.findUnique({
        where: { productId_warehouseId: { productId: product1Id, warehouseId: warehouseAId } },
      });
      expect(invProd1AfterPay?.quantityOnHand).toBe(20); // Critical invariant preserved!
      expect(invProd1AfterPay?.quantityReserved).toBe(2); // Reservation preserved

      // Step 6 & 7: Warehouse staff sees the order in confirmed state
      const staffListRes = await request(app)
        .get(`/api/v1/orders?warehouseId=${warehouseAId}&status=CONFIRMED`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`);
      expect(staffListRes.status).toBe(200);
      const matchingOrder = staffListRes.body.data.find((o: any) => o.id === order.id);
      expect(matchingOrder).toBeDefined();

      // Step 8: Staff starts PROCESSING
      const processRes = await request(app)
        .post(`/api/v1/orders/${order.id}/process`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`);
      expect(processRes.status).toBe(200);
      expect(processRes.body.data.status).toBe(OrderStatus.PROCESSING);

      // Step 9 & 10: Staff dispatches the order -> physical stock decreases exactly once
      const dispatchRes = await request(app)
        .post(`/api/v1/orders/${order.id}/dispatch`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`)
        .send({
          carrier: 'FedEx Priority',
          trackingNumber: 'FDX-AUSTIN-99001',
          notes: 'Packed in reinforced flight cases',
        });
      expect(dispatchRes.status).toBe(200);
      expect(dispatchRes.body.data.status).toBe(OrderStatus.SHIPPED);

      // Step 11: Physical stock is now decremented: 20 - 2 = 18; reservations consumed: 0
      const invProd1AfterDispatch = await prisma.inventory.findUnique({
        where: { productId_warehouseId: { productId: product1Id, warehouseId: warehouseAId } },
      });
      expect(invProd1AfterDispatch?.quantityOnHand).toBe(18);
      expect(invProd1AfterDispatch?.quantityReserved).toBe(0);

      // Step 12: DISPATCH movement is recorded
      const movements = await prisma.inventoryMovement.findMany({
        where: { referenceId: order.id, movementType: MovementType.DISPATCH },
      });
      expect(movements.length).toBe(2); // One per line item
      expect(movements.some((m) => m.productId === product1Id && Math.abs(m.quantityDelta) === 2)).toBe(true);
      expect(movements.some((m) => m.productId === product2Id && Math.abs(m.quantityDelta) === 5)).toBe(true);

      // Step 13 & 14: Staff marks order DELIVERED
      const deliverRes = await request(app)
        .post(`/api/v1/orders/${order.id}/deliver`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`);
      expect(deliverRes.status).toBe(200);
      expect(deliverRes.body.data.status).toBe(OrderStatus.DELIVERED);

      // Step 15: Customer sees updated DELIVERED status
      const customerOrderRes = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(customerOrderRes.status).toBe(200);
      expect(customerOrderRes.body.data.status).toBe(OrderStatus.DELIVERED);

      // Step 16: Dashboard metrics reflect the completed order
      const dashRes = await request(app)
        .get(`/api/v1/analytics/dashboard?warehouseId=${warehouseAId}&timeRange=7d`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(dashRes.status).toBe(200);
      expect(dashRes.body.data.orders.deliveredCount).toBe(1);
      expect(dashRes.body.data.kpis.ordersAwaitingProcessing).toBe(0);
      expect(dashRes.body.data.kpis.ordersAwaitingDispatch).toBe(0);
      expect(dashRes.body.data.kpis.totalPhysicalInventory).toBe(18 + 45); // 18 drones + 45 batteries
    });
  });

  // =========================================================================
  // WORKFLOW B: Insufficient Inventory & Shortage Decision Lifecycle
  // =========================================================================
  describe('Workflow B: Insufficient Inventory & Shortage Decision Lifecycle', () => {
    it('handles stock shortage: tickets created, customer accepts partial, manager approves, atomic reservation commits', async () => {
      // 1. Restock only 4 units of Drone in Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product1Id, warehouseId: warehouseAId, quantity: 4 });

      // 2. Customer places order requesting 10 units (allowPartial=true by default)
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '900 Capitol Ave, Austin, TX',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 10 }],
          allowPartial: true,
        });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.status).toBe(OrderStatus.PENDING); // Awaiting shortage resolution

      // 3. Verify shortage ticket and customer decision ticket were generated
      const ticketsRes = await request(app)
        .get(`/api/v1/tickets?orderId=${order.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ticketsRes.status).toBe(200);
      const tickets = ticketsRes.body.data;
      expect(tickets.length).toBe(2);

      const shortageTicket = tickets.find((t: any) => t.type === TicketType.ORDER_SHORTAGE);
      const decisionTicket = tickets.find((t: any) => t.type === TicketType.CUSTOMER_DECISION);
      expect(shortageTicket).toBeDefined();
      expect(decisionTicket).toBeDefined();
      expect(decisionTicket.quantityOffered).toBe(4); // 4 units available
      expect(shortageTicket.shortageQuantity).toBe(6); // 10 - 4 = 6

      // 4. Customer accepts partial offer of 4 units
      const decisionRes = await request(app)
        .post(`/api/v1/tickets/${decisionTicket.id}/decision`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          action: 'ACCEPT_PARTIAL',
          notes: 'Customer agreed to take 4 units now',
        });
      expect(decisionRes.status).toBe(200);
      expect(decisionRes.body.data.customerDecision).toBe(CustomerDecision.ACCEPTED_PARTIAL);

      // 5. Manager approves the shortage resolution
      const approveRes = await request(app)
        .post(`/api/v1/tickets/${shortageTicket.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ notes: 'Manager approved partial allocation of 4 units' });
      expect(approveRes.status).toBe(200);

      // 6 & 7: Availability rechecked and accepted quantity (4 units) reserved atomically
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { orderItems: true, inventoryReservations: true },
      });
      expect(updatedOrder?.status).toBe(OrderStatus.RESERVED);
      expect(updatedOrder?.orderItems[0].quantity).toBe(4); // Adjusted to 4
      expect(updatedOrder?.inventoryReservations[0].quantity).toBe(4);

      // 8. Payment uses accepted quantity (4 units * $1,500 = $6,000 = 600,000 cents)
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: order.id,
          amountCents: updatedOrder!.totalAmountCents,
          paymentMethod: 'MASTERCARD_TEST',
          simulateOutcome: 'SUCCESS',
        });
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.orderStatus).toBe(OrderStatus.CONFIRMED);
    });

    it('rejects order immediately if allowPartial is explicitly false', async () => {
      // Restock 2 units
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product1Id, warehouseId: warehouseAId, quantity: 2 });

      // Request 10 with allowPartial: false -> HTTP 409 Conflict
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '123 No Partial St',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 10 }],
          allowPartial: false,
        });
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('cancels order when customer rejects partial fulfillment', async () => {
      // Restock 1 unit
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product1Id, warehouseId: warehouseAId, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '123 Reject St',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 5 }],
        });
      const order = orderRes.body.data;

      const tickets = (
        await request(app)
          .get(`/api/v1/tickets?orderId=${order.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).body.data;
      const decisionTicket = tickets.find((t: any) => t.type === TicketType.CUSTOMER_DECISION);

      // Customer rejects
      const decRes = await request(app)
        .post(`/api/v1/tickets/${decisionTicket.id}/decision`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ action: 'REJECT_PARTIAL', notes: 'Need all 5 units, canceling order' });
      expect(decRes.status).toBe(200);

      const cancelledOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(cancelledOrder?.status).toBe(OrderStatus.CANCELLED);
    });
  });

  // =========================================================================
  // WORKFLOW C: Low-Stock Management & Automatic Ticket Resolution
  // =========================================================================
  describe('Workflow C: Low-Stock Management & Automatic Ticket Resolution', () => {
    it('creates low-stock ticket when threshold breached and auto-resolves upon restock', async () => {
      // 1. Restock 15 units of Battery at Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product2Id, warehouseId: warehouseAId, quantity: 15 });

      // 2. Configure minimum threshold for Warehouse A: 20 units
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product2Id,
          warehouseId: warehouseAId,
          minQuantity: 20,
        });

      // 3. Consume stock: Customer buys 5 units (15 - 5 = 10 available < 20 minQuantity)
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: 'Low Stock Test Address',
          items: [{ productId: product2Id, warehouseId: warehouseAId, quantity: 5 }],
        });
      expect(orderRes.status).toBe(201);

      // 4. Verify low-stock ticket was generated
      const ticketsRes = await request(app)
        .get(`/api/v1/tickets?productId=${product2Id}&type=LOW_STOCK`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ticketsRes.status).toBe(200);
      const lowStockTickets = ticketsRes.body.data;
      expect(lowStockTickets.length).toBe(1);
      const lowStockTicket = lowStockTickets[0];
      expect(lowStockTicket.status).toBe(TicketStatus.OPEN);
      expect(lowStockTicket.deficitQuantity).toBe(10); // 20 - 10 = 10

      // 5. Replenish stock: Restock 30 units (available becomes 10 + 30 = 40 >= 20)
      const restockRes = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffWarehouseAToken}`)
        .send({ productId: product2Id, warehouseId: warehouseAId, quantity: 30 });
      expect(restockRes.status).toBe(200);

      // 6. Verify ticket is automatically resolved upon replenishment
      const resolvedTicket = await prisma.ticket.findUnique({
        where: { id: lowStockTicket.id },
      });
      expect(resolvedTicket?.status).toBe(TicketStatus.RESOLVED);
      expect(resolvedTicket?.resolutionNotes).toContain('Stock verified and recovered');
    });
  });

  // =========================================================================
  // WORKFLOW D: Multi-Warehouse Operations & Access Scoping
  // =========================================================================
  describe('Workflow D: Multi-Warehouse Operations & Access Scoping', () => {
    it('allocates multi-warehouse order, enforces warehouse-scoped dispatch, and records movements independently', async () => {
      // 1. Restock Warehouse A (10 drones) and Warehouse B (20 batteries)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product1Id, warehouseId: warehouseAId, quantity: 10 });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: product2Id, warehouseId: warehouseBId, quantity: 20 });

      // 2. Customer places multi-warehouse order: Drones from A, Batteries from B
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: 'Multi-Facility Delivery Address',
          items: [
            { productId: product1Id, warehouseId: warehouseAId, quantity: 2 },
            { productId: product2Id, warehouseId: warehouseBId, quantity: 5 },
          ],
        });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;

      // 3. Pay for order
      await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: order.id,
          amountCents: order.totalAmountCents,
          paymentMethod: 'VISA',
          simulateOutcome: 'SUCCESS',
        });

      // 4. Staff A attempts to dispatch from Warehouse B -> HTTP 403 Forbidden!
      await request(app)
        .post(`/api/v1/orders/${order.id}/process`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`);

      const invalidDispatch = await request(app)
        .post(`/api/v1/orders/${order.id}/dispatch`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`)
        .send({ warehouseId: warehouseBId });
      expect(invalidDispatch.status).toBe(403);

      // 5. Staff B can dispatch Warehouse B inventory, or Manager (assigned to both) dispatches all
      const validDispatch = await request(app)
        .post(`/api/v1/orders/${order.id}/dispatch`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ carrier: 'National Freight', trackingNumber: 'NF-MULTI-001' });
      expect(validDispatch.status).toBe(200);
      expect(validDispatch.body.data.status).toBe(OrderStatus.SHIPPED);

      // 6. Verify independent stock decrement in both facilities
      const invA = await prisma.inventory.findUnique({
        where: { productId_warehouseId: { productId: product1Id, warehouseId: warehouseAId } },
      });
      const invB = await prisma.inventory.findUnique({
        where: { productId_warehouseId: { productId: product2Id, warehouseId: warehouseBId } },
      });
      expect(invA?.quantityOnHand).toBe(8); // 10 - 2
      expect(invB?.quantityOnHand).toBe(15); // 20 - 5
    });
  });

  // =========================================================================
  // WORKFLOW E: Administration, RBAC & Security Boundaries
  // =========================================================================
  describe('Workflow E: Administration, RBAC & Security Boundaries', () => {
    it('verifies administrative provisioning, immediate deactivation, last admin defense, and registration lockdown', async () => {
      // 1. Admin creates warehouse manager and warehouse staff accounts
      const createManagerRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'new.branch.manager@stockflow.dev',
          password: 'SecureManagerPass123!',
          fullName: 'Branch Manager One',
          role: UserRole.WAREHOUSE_MANAGER,
          warehouseIds: [warehouseAId],
        });
      expect(createManagerRes.status).toBe(201);
      const newManagerId = createManagerRes.body.data.id;

      // 2. Reject attempt to create ADMIN via standard form
      const adminFormRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'illegal.admin@stockflow.dev',
          password: 'IllegalAdminPass123!',
          fullName: 'Illegal Administrator',
          role: UserRole.ADMIN,
        });
      expect(adminFormRes.status).toBe(400);
      expect(adminFormRes.body.error.code).toBe('ADMIN_CREATION_RESTRICTED');

      // 3. Staff cannot perform Admin operations (e.g. list all users or deactivate accounts)
      const staffForbiddenRes = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${staffWarehouseAToken}`);
      expect(staffForbiddenRes.status).toBe(403);

      // 4. Customer cannot access internal administrative endpoints
      const customerForbiddenRes = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(customerForbiddenRes.status).toBe(403);

      // 5. Last active Admin cannot be deactivated or demoted
      const deactAdminRes = await request(app)
        .patch(`/api/v1/users/${adminUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(deactAdminRes.status).toBe(400);
      expect(deactAdminRes.body.error.code).toBe('LAST_ADMIN_PROTECTION');

      // 6. Deactivated accounts lose access immediately
      await request(app)
        .patch(`/api/v1/users/${newManagerId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      // Even with a previously valid token, deactivated user is rejected with HTTP 401
      // Login attempt is also blocked
      const loginDeact = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'new.branch.manager@stockflow.dev', password: 'SecureManagerPass123!' });
      expect(loginDeact.status).toBe(401);
      expect(loginDeact.body.error.code).toBe('ACCOUNT_DEACTIVATED');

      // 7. Public registration cannot create internal roles
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'attacker@stockflow.dev',
          password: 'StrongPassword123!',
          fullName: 'Attacker Attempting Escalation',
          role: UserRole.ADMIN, // Payload tampering attempt
        });
      expect(regRes.status).toBe(201);
      expect(regRes.body.data.user.role).toBe(UserRole.CUSTOMER); // Strictly forced to CUSTOMER
    });
  });
});
