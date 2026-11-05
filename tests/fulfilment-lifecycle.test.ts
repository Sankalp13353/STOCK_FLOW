import request from 'supertest';
import { UserRole, OrderStatus, ReservationStatus, MovementType } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { EVENT_TYPES } from '../src/config/constants';
import { reservationService } from '../src/modules/reservations/reservation.service';
import { outboxService } from '../src/modules/outbox/outbox.service';

describe('Phase 1 — Fulfilment Lifecycle & Physical Stock Correction API', () => {
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
  let productAId: string;
  let productBId: string;

  beforeEach(async () => {
    await clearDatabase();

    // 1. Create Users
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
    const whResA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-FULFIL-A',
        name: 'Fulfilment Warehouse Alpha',
        address: '100 Distribution Way',
        city: 'Atlanta',
        country: 'USA',
      });
    warehouseAId = whResA.body.data.id;

    const whResB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-FULFIL-B',
        name: 'Fulfilment Warehouse Beta',
        address: '200 Logistics Blvd',
        city: 'Dallas',
        country: 'USA',
      });
    warehouseBId = whResB.body.data.id;

    // 3. Assign Staff and Manager via userWarehouseAssignment
    // Staff A assigned to Warehouse A
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: staffWarehouseAUser.id,
        warehouseId: warehouseAId,
        role: UserRole.WAREHOUSE_STAFF,
      },
    });

    // Staff B assigned to Warehouse B
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: staffWarehouseBUser.id,
        warehouseId: warehouseBId,
        role: UserRole.WAREHOUSE_STAFF,
      },
    });

    // Manager assigned to both Warehouse A and B
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: managerUser.id,
        warehouseId: warehouseAId,
        role: UserRole.WAREHOUSE_MANAGER,
      },
    });
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: managerUser.id,
        warehouseId: warehouseBId,
        role: UserRole.WAREHOUSE_MANAGER,
      },
    });

    // 4. Create Products
    const prodResA = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-PROD-A',
        name: 'Industrial Widget A',
        priceCents: 5000,
      });
    productAId = prodResA.body.data.id;

    const prodResB = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-PROD-B',
        name: 'Commercial Widget B',
        priceCents: 8000,
      });
    productBId = prodResB.body.data.id;

    // 5. Restock Inventory:
    // Warehouse A: 20 units of Product A, 10 units of Product B
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productAId, warehouseId: warehouseAId, quantity: 20 });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productBId, warehouseId: warehouseAId, quantity: 10 });

    // Warehouse B: 15 units of Product B
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productBId, warehouseId: warehouseBId, quantity: 15 });
  });

  // Helper to place an order and optionally pay for it
  async function createAndPayOrder(items: Array<{ productId: string; warehouseId: string; quantity: number }>, autoPay = true) {
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '789 Fulfilment Road, Atlanta, GA',
        items,
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;

    if (!autoPay) {
      return order;
    }

    const payRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: order.id,
        amountCents: order.totalAmountCents,
        paymentMethod: 'TEST_CARD',
        simulateOutcome: 'SUCCESS',
      });
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.orderStatus).toBe(OrderStatus.CONFIRMED);

    const updatedOrder = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    return updatedOrder.body.data;
  }

  // --------------------------------------------------------------------------
  // Scenario 1 & 2: Payment Preservation & Stock Integrity
  // --------------------------------------------------------------------------
  it('1. Successful payment does NOT deduct physical stock (quantityOnHand remains intact)', async () => {
    // Before order: WH A Prod A -> onHand = 20, reserved = 0
    const initialInv = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(initialInv?.quantityOnHand).toBe(20);
    expect(initialInv?.quantityReserved).toBe(0);

    // Place and pay order for 4 units
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 4 }]);
    expect(order.status).toBe(OrderStatus.CONFIRMED);

    // After payment: physical stock must STILL BE 20; reserved must be 4; available is 16
    const postPayInv = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(postPayInv?.quantityOnHand).toBe(20);
    expect(postPayInv?.quantityReserved).toBe(4);

    // Verify NO DISPATCH movement was recorded
    const dispatchMovement = await prisma.inventoryMovement.findFirst({
      where: {
        productId: productAId,
        warehouseId: warehouseAId,
        movementType: MovementType.DISPATCH,
      },
    });
    expect(dispatchMovement).toBeNull();
  });

  it('2. Successful payment preserves active reservations (ReservationStatus.ACTIVE)', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 3 }]);
    expect(order.status).toBe(OrderStatus.CONFIRMED);

    const reservation = await prisma.inventoryReservation.findFirst({
      where: { orderId: order.id },
    });
    expect(reservation).not.toBeNull();
    expect(reservation?.status).toBe(ReservationStatus.ACTIVE);

    // Reservation sweeper should NOT expire reservations for CONFIRMED orders even if timestamp expired
    await prisma.inventoryReservation.update({
      where: { id: reservation!.id },
      data: { expiresAt: new Date(Date.now() - 60000) }, // in the past
    });

    const expiredCount = await reservationService.expireStaleReservations();
    expect(expiredCount.expiredReservationsCount).toBe(0);

    const recheckReservation = await prisma.inventoryReservation.findUnique({
      where: { id: reservation!.id },
    });
    expect(recheckReservation?.status).toBe(ReservationStatus.ACTIVE);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Confirmed order enters PROCESSING
  // --------------------------------------------------------------------------
  it('3. Confirmed order can enter PROCESSING via authorized staff and emit outbox event', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);

    const processRes = await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ notes: 'Picking items from aisle 4' });

    expect(processRes.status).toBe(200);
    expect(processRes.body.success).toBe(true);
    expect(processRes.body.data.status).toBe(OrderStatus.PROCESSING);

    // Verify Outbox Event order.processing_started
    const event = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_PROCESSING_STARTED,
      },
    });
    expect(event).not.toBeNull();

    // Verify Idempotency of /process
    const repeatRes = await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ notes: 'Picking again' });

    expect(repeatRes.status).toBe(200);
    expect(repeatRes.body.data.status).toBe(OrderStatus.PROCESSING);
  });

  // --------------------------------------------------------------------------
  // Scenario 4, 5, 6, 7: Order Dispatch & Physical Stock Deduction
  // --------------------------------------------------------------------------
  it('4-7. Dispatch deducts physical stock, marks reservation COMMITTED, and records DISPATCH movement', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 5 }]);

    // Move to PROCESSING first
    await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // Prior to dispatch: onHand = 20, reserved = 5
    const preInv = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(preInv?.quantityOnHand).toBe(20);
    expect(preInv?.quantityReserved).toBe(5);

    // Dispatch order
    const dispatchRes = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({
        carrier: 'FedEx Express',
        trackingNumber: 'FDX-99887766',
        notes: 'Loaded on dock bay 3',
      });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.success).toBe(true);
    expect(dispatchRes.body.data.status).toBe(OrderStatus.SHIPPED);

    // 5. Verify physical stock deducted: onHand = 15, reserved = 0
    const postInv = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(postInv?.quantityOnHand).toBe(15);
    expect(postInv?.quantityReserved).toBe(0);

    // 6. Verify reservation marked COMMITTED
    const reservation = await prisma.inventoryReservation.findFirst({
      where: { orderId: order.id },
    });
    expect(reservation?.status).toBe(ReservationStatus.COMMITTED);

    // 7. Verify DISPATCH inventory movement recorded
    const movement = await prisma.inventoryMovement.findFirst({
      where: {
        productId: productAId,
        warehouseId: warehouseAId,
        movementType: MovementType.DISPATCH,
        referenceId: order.id,
      },
    });
    expect(movement).not.toBeNull();
    expect(movement?.quantityDelta).toBe(-5);
    expect(movement?.notes).toContain(`dispatched 5 unit(s)`);

    // Verify Outbox Event order.shipped
    const shipEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_SHIPPED,
      },
    });
    expect(shipEvent).not.toBeNull();
    expect((shipEvent?.payload as any).trackingNumber).toBe('FDX-99887766');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Idempotency of Dispatch
  // --------------------------------------------------------------------------
  it('8. Repeated dispatch requests cannot deduct stock twice (idempotent)', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);

    await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // First dispatch
    const firstRes = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ trackingNumber: 'TRK-001' });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.status).toBe(OrderStatus.SHIPPED);

    const invAfterFirst = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(invAfterFirst?.quantityOnHand).toBe(18);
    expect(invAfterFirst?.quantityReserved).toBe(0);

    // Second dispatch (repeat)
    const secondRes = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ trackingNumber: 'TRK-001' });
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.status).toBe(OrderStatus.SHIPPED);

    // Inventory must remain exactly 18!
    const invAfterSecond = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(invAfterSecond?.quantityOnHand).toBe(18);
    expect(invAfterSecond?.quantityReserved).toBe(0);

    // Only one DISPATCH movement must exist for this order
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        productId: productAId,
        warehouseId: warehouseAId,
        movementType: MovementType.DISPATCH,
        referenceId: order.id,
      },
    });
    expect(movements.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Invalid Order Transitions Rejected
  // --------------------------------------------------------------------------
  it('9. Invalid order status transitions are rejected with 409 or 422', async () => {
    // A: Unpaid order (RESERVED) cannot be processed or dispatched
    const unpaidOrder = await createAndPayOrder(
      [{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }],
      false
    );
    expect(unpaidOrder.status).toBe(OrderStatus.RESERVED);

    const invalidProcess = await request(app)
      .post(`/api/v1/orders/${unpaidOrder.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect([409, 422]).toContain(invalidProcess.status);

    const invalidDispatch = await request(app)
      .post(`/api/v1/orders/${unpaidOrder.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect([409, 422]).toContain(invalidDispatch.status);

    // B: Confirmed order cannot be delivered directly (must be SHIPPED)
    const confirmedOrder = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }]);
    const directDeliver = await request(app)
      .post(`/api/v1/orders/${confirmedOrder.id}/deliver`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect([409, 422]).toContain(directDeliver.status);

    // C: Customer cannot access fulfilment transition endpoints (403 Forbidden)
    const customerAttempt = await request(app)
      .post(`/api/v1/orders/${confirmedOrder.id}/process`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send();
    expect(customerAttempt.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Missing or Non-Active Reservations Cannot Be Dispatched
  // --------------------------------------------------------------------------
  it('10. Expired or released reservations cannot be dispatched', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);

    await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // Artificially change reservation status to RELEASED
    await prisma.inventoryReservation.updateMany({
      where: { orderId: order.id },
      data: { status: ReservationStatus.RELEASED },
    });

    const dispatchRes = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    expect([409, 422]).toContain(dispatchRes.status);
    expect(dispatchRes.body.error.message).toContain('reservation');
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Cancelled Orders Cannot Be Dispatched & Shipped Cannot Be Cancelled
  // --------------------------------------------------------------------------
  it('11. Cancelled orders cannot be dispatched and Shipped orders cannot be cancelled', async () => {
    // 1. Cancel a confirmed order
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);
    const cancelRes = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind' });
    expect(cancelRes.status).toBe(200);

    // Attempt to dispatch cancelled order
    const dispatchCancelled = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect([409, 422]).toContain(dispatchCancelled.status);

    // 2. Shipped order cannot be cancelled
    const shipOrder = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);
    await request(app)
      .post(`/api/v1/orders/${shipOrder.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    await request(app)
      .post(`/api/v1/orders/${shipOrder.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    const cancelShipped = await request(app)
      .post(`/api/v1/orders/${shipOrder.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send();
    expect([409, 422]).toContain(cancelShipped.status);
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Warehouse Boundary Authorization Checks
  // --------------------------------------------------------------------------
  it('12. Unauthorised warehouse staff cannot process or dispatch another warehouse stock', async () => {
    // Order strictly in Warehouse B
    const orderB = await createAndPayOrder([{ productId: productBId, warehouseId: warehouseBId, quantity: 2 }]);

    // Staff A (assigned only to Warehouse A) attempts to process Order B
    const processFail = await request(app)
      .post(`/api/v1/orders/${orderB.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect(processFail.status).toBe(403);

    // Staff B (assigned to Warehouse B) can process it
    const processOk = await request(app)
      .post(`/api/v1/orders/${orderB.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseBToken}`)
      .send();
    expect(processOk.status).toBe(200);

    // Staff A attempts to dispatch Order B
    const dispatchFail = await request(app)
      .post(`/api/v1/orders/${orderB.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect(dispatchFail.status).toBe(403);

    // Staff B can dispatch it
    const dispatchOk = await request(app)
      .post(`/api/v1/orders/${orderB.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseBToken}`)
      .send();
    expect(dispatchOk.status).toBe(200);
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Admin Organization-Wide Access Across All Warehouses
  // --------------------------------------------------------------------------
  it('13. Admin organization-wide access works across all warehouses without explicit assignment', async () => {
    const order = await createAndPayOrder([{ productId: productBId, warehouseId: warehouseBId, quantity: 1 }]);

    // Admin processes
    const procRes = await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Admin override processing' });
    expect(procRes.status).toBe(200);

    // Admin dispatches
    const dispRes = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carrier: 'DHL', trackingNumber: 'DHL-112233' });
    expect(dispRes.status).toBe(200);

    // Admin delivers
    const delivRes = await request(app)
      .post(`/api/v1/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deliveryNotes: 'Left at reception' });
    expect(delivRes.status).toBe(200);
    expect(delivRes.body.data.status).toBe(OrderStatus.DELIVERED);
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Multi-Warehouse Orders Dispatch from Correct Allocations
  // --------------------------------------------------------------------------
  it('14. Multi-warehouse orders dispatch from correct warehouse allocations', async () => {
    // Order spanning Warehouse A (Product A x 3) and Warehouse B (Product B x 2)
    const multiOrder = await createAndPayOrder([
      { productId: productAId, warehouseId: warehouseAId, quantity: 3 },
      { productId: productBId, warehouseId: warehouseBId, quantity: 2 },
    ]);

    // Pre-dispatch inventory counts
    const invA_pre = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    const invB_pre = await prisma.inventory.findFirst({
      where: { productId: productBId, warehouseId: warehouseBId },
    });
    expect(invA_pre?.quantityOnHand).toBe(20);
    expect(invA_pre?.quantityReserved).toBe(3);
    expect(invB_pre?.quantityOnHand).toBe(15);
    expect(invB_pre?.quantityReserved).toBe(2);

    // Manager (assigned to both A and B) processes and dispatches
    await request(app)
      .post(`/api/v1/orders/${multiOrder.id}/process`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send();

    const dispatchRes = await request(app)
      .post(`/api/v1/orders/${multiOrder.id}/dispatch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ carrier: 'MultiFreight', trackingNumber: 'MF-MULTI-01' });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.data.status).toBe(OrderStatus.SHIPPED);

    // Post-dispatch counts
    const invA_post = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    const invB_post = await prisma.inventory.findFirst({
      where: { productId: productBId, warehouseId: warehouseBId },
    });

    // WH A deducted 3: onHand = 17, reserved = 0
    expect(invA_post?.quantityOnHand).toBe(17);
    expect(invA_post?.quantityReserved).toBe(0);

    // WH B deducted 2: onHand = 13, reserved = 0
    expect(invB_post?.quantityOnHand).toBe(13);
    expect(invB_post?.quantityReserved).toBe(0);

    // Both reservations COMMITTED
    const reservations = await prisma.inventoryReservation.findMany({
      where: { orderId: multiOrder.id },
    });
    expect(reservations.length).toBe(2);
    expect(reservations.every((r) => r.status === ReservationStatus.COMMITTED)).toBe(true);

    // Movements recorded in both warehouses
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        movementType: MovementType.DISPATCH,
        referenceId: multiOrder.id,
      },
    });
    expect(movements.length).toBe(2);
    const movA = movements.find((m) => m.warehouseId === warehouseAId);
    const movB = movements.find((m) => m.warehouseId === warehouseBId);
    expect(movA?.quantityDelta).toBe(-3);
    expect(movB?.quantityDelta).toBe(-2);
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Concurrent Dispatch Protection
  // --------------------------------------------------------------------------
  it('15. Concurrent dispatch requests cannot double-deduct inventory', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 4 }]);

    await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // Fire 3 concurrent dispatch calls
    const results = await Promise.all([
      request(app)
        .post(`/api/v1/orders/${order.id}/dispatch`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`)
        .send({ trackingNumber: 'CONCURRENT-1' }),
      request(app)
        .post(`/api/v1/orders/${order.id}/dispatch`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`)
        .send({ trackingNumber: 'CONCURRENT-2' }),
      request(app)
        .post(`/api/v1/orders/${order.id}/dispatch`)
        .set('Authorization', `Bearer ${staffWarehouseAToken}`)
        .send({ trackingNumber: 'CONCURRENT-3' }),
    ]);

    // All should return status 200 (either performing dispatch or returning idempotent response)
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(OrderStatus.SHIPPED);
    }

    // Physical stock must only be deducted once (20 - 4 = 16)
    const inv = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(inv?.quantityOnHand).toBe(16);
    expect(inv?.quantityReserved).toBe(0);

    // Exactly one DISPATCH movement exists for this order
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        referenceId: order.id,
        movementType: MovementType.DISPATCH,
      },
    });
    expect(movements.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Delivery Tracking & Outbox
  // --------------------------------------------------------------------------
  it('16. Delivery is permitted only after shipment and records order.delivered event', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }]);

    await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // Cannot deliver while in PROCESSING
    const prematureDeliver = await request(app)
      .post(`/api/v1/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect([409, 422]).toContain(prematureDeliver.status);

    // Dispatch
    await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // Now deliver
    const deliverRes = await request(app)
      .post(`/api/v1/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ deliveryNotes: 'Signed by recipient John Doe', deliveredAt: new Date().toISOString() });

    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.data.status).toBe(OrderStatus.DELIVERED);

    // Verify Outbox Event order.delivered
    const delivEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_DELIVERED,
      },
    });
    expect(delivEvent).not.toBeNull();

    // Repeated deliver call is idempotent
    const repeatDeliver = await request(app)
      .post(`/api/v1/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();
    expect(repeatDeliver.status).toBe(200);
    expect(repeatDeliver.body.data.status).toBe(OrderStatus.DELIVERED);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Transaction Rollback on Unexpected Failure
  // --------------------------------------------------------------------------
  it('17. Transaction rollback ensures stock and status are preserved if dispatch fails midway', async () => {
    const order = await createAndPayOrder([{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);

    await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    // Spy on outboxService.recordEvent to throw an artificial error during transaction
    const spy = jest.spyOn(outboxService, 'recordEvent').mockImplementationOnce(() => {
      throw new Error('Simulated database outbox crash');
    });

    const failedDispatch = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send();

    expect(failedDispatch.status).toBe(500);

    spy.mockRestore();

    // Verify atomic rollback: Order remains in PROCESSING, stock is NOT decremented, reservation remains ACTIVE
    const orderAfterFail = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(orderAfterFail?.status).toBe(OrderStatus.PROCESSING);

    const invAfterFail = await prisma.inventory.findFirst({
      where: { productId: productAId, warehouseId: warehouseAId },
    });
    expect(invAfterFail?.quantityOnHand).toBe(20);
    expect(invAfterFail?.quantityReserved).toBe(2);

    const reservationAfterFail = await prisma.inventoryReservation.findFirst({
      where: { orderId: order.id },
    });
    expect(reservationAfterFail?.status).toBe(ReservationStatus.ACTIVE);
  });
});
