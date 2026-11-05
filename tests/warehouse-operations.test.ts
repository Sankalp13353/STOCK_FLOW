import request from 'supertest';
import { UserRole, OrderStatus, ReservationStatus, MovementType } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { EVENT_TYPES } from '../src/config/constants';

describe('Phase 2 — Warehouse Operations & Order Management API', () => {
  let adminToken: string;
  let adminUser: any;
  let managerToken: string;
  let managerUser: any;
  let staffWarehouseAToken: string;
  let staffWarehouseAUser: any;
  let staffWarehouseBToken: string;
  let staffWarehouseBUser: any;
  let customer1Token: string;
  let customer1User: any;
  let customer2Token: string;
  let customer2User: any;

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

    const cust1 = await createTestUser(UserRole.CUSTOMER);
    customer1Token = cust1.token;
    customer1User = cust1.user;

    const cust2 = await createTestUser(UserRole.CUSTOMER);
    customer2Token = cust2.token;
    customer2User = cust2.user;

    // 2. Create Warehouses
    const whResA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-OPS-A',
        name: 'Atlanta Operational Hub',
        address: '100 Terminal Drive',
        city: 'Atlanta',
        country: 'USA',
      });
    warehouseAId = whResA.body.data.id;

    const whResB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-OPS-B',
        name: 'Dallas Logistics Center',
        address: '200 Cargo Parkway',
        city: 'Dallas',
        country: 'USA',
      });
    warehouseBId = whResB.body.data.id;

    // 3. Warehouse Assignments
    // Staff A assigned only to Warehouse A
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: staffWarehouseAUser.id,
        warehouseId: warehouseAId,
        role: UserRole.WAREHOUSE_STAFF,
      },
    });

    // Staff B assigned only to Warehouse B
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
        sku: 'SKU-OPS-ITEM-1',
        name: 'Industrial Valve Unit',
        priceCents: 15000,
      });
    productAId = prodResA.body.data.id;

    const prodResB = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-OPS-ITEM-2',
        name: 'Precision Pressure Sensor',
        priceCents: 8500,
      });
    productBId = prodResB.body.data.id;

    // 5. Restock Inventory
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productAId, warehouseId: warehouseAId, quantity: 50 });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productBId, warehouseId: warehouseAId, quantity: 30 });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productBId, warehouseId: warehouseBId, quantity: 40 });
  });

  // Helper to place and optionally confirm payment for an order
  async function placeOrder(
    customerToken: string,
    items: Array<{ productId: string; warehouseId?: string; quantity: number }>,
    autoPay = true
  ) {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: '123 Logistics Way, Suite 400',
        items,
      });
    expect(res.status).toBe(201);
    const order = res.body.data;

    if (!autoPay) return order;

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

    const updated = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return updated.body.data;
  }

  // --------------------------------------------------------------------------
  // 1. Orders Listing & Search / Filter Criteria
  // --------------------------------------------------------------------------
  it('1. GET /api/v1/orders supports pagination, customer info, item details, and status filters', async () => {
    // Create 3 orders: 2 paid (CONFIRMED), 1 unpaid (RESERVED)
    const order1 = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);
    const order2 = await placeOrder(customer1Token, [{ productId: productBId, warehouseId: warehouseAId, quantity: 1 }]);
    const order3 = await placeOrder(customer2Token, [{ productId: productBId, warehouseId: warehouseBId, quantity: 3 }], false);

    // List all orders as Admin
    const listRes = await request(app)
      .get('/api/v1/orders?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBe(3);
    expect(listRes.body.meta.pagination.totalRecords).toBe(3);

    // Verify order customer details are populated
    const first = listRes.body.data[0];
    expect(first.user).toBeDefined();
    expect(first.user.email).toBeDefined();
    expect(first.user.fullName).toBeDefined();
    expect(first.orderItems.length).toBeGreaterThan(0);
    expect(first.orderItems[0].product).toBeDefined();
    expect(first.orderItems[0].warehouse).toBeDefined();

    // Filter by status=CONFIRMED
    const confirmedRes = await request(app)
      .get('/api/v1/orders?status=CONFIRMED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(confirmedRes.status).toBe(200);
    expect(confirmedRes.body.data.length).toBe(2);
    expect(confirmedRes.body.data.every((o: any) => o.status === 'CONFIRMED')).toBe(true);

    // Filter by status=RESERVED
    const reservedRes = await request(app)
      .get('/api/v1/orders?status=RESERVED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reservedRes.status).toBe(200);
    expect(reservedRes.body.data.length).toBe(1);
    expect(reservedRes.body.data[0].id).toBe(order3.id);
  });

  it('2. Search filter matches by order number, customer email, customer full name, and product SKU', async () => {
    const order = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }]);

    // Search by Order Number
    const searchNumberRes = await request(app)
      .get(`/api/v1/orders?search=${order.orderNumber}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(searchNumberRes.status).toBe(200);
    expect(searchNumberRes.body.data.length).toBe(1);
    expect(searchNumberRes.body.data[0].id).toBe(order.id);

    // Search by Customer Email
    const searchEmailRes = await request(app)
      .get(`/api/v1/orders?search=${customer1User.email}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(searchEmailRes.status).toBe(200);
    expect(searchEmailRes.body.data.length).toBe(1);
    expect(searchEmailRes.body.data[0].id).toBe(order.id);

    // Search by SKU
    const searchSkuRes = await request(app)
      .get('/api/v1/orders?search=SKU-OPS-ITEM-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(searchSkuRes.status).toBe(200);
    expect(searchSkuRes.body.data.some((o: any) => o.id === order.id)).toBe(true);
  });

  it('3. Warehouse filtering returns only orders fulfilling from specified facility', async () => {
    // Order in Warehouse A
    const orderA = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 2 }]);
    // Order in Warehouse B
    const orderB = await placeOrder(customer2Token, [{ productId: productBId, warehouseId: warehouseBId, quantity: 1 }]);

    // Filter by Warehouse A
    const whARes = await request(app)
      .get(`/api/v1/orders?warehouseId=${warehouseAId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(whARes.status).toBe(200);
    const idsA = whARes.body.data.map((o: any) => o.id);
    expect(idsA).toContain(orderA.id);
    expect(idsA).not.toContain(orderB.id);

    // Filter by Warehouse B
    const whBRes = await request(app)
      .get(`/api/v1/orders?warehouseId=${warehouseBId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(whBRes.status).toBe(200);
    const idsB = whBRes.body.data.map((o: any) => o.id);
    expect(idsB).toContain(orderB.id);
    expect(idsB).not.toContain(orderA.id);
  });

  // --------------------------------------------------------------------------
  // 2. Role-Based Scoping & Permission Boundaries
  // --------------------------------------------------------------------------
  it('4. Warehouse Staff and Managers only see orders fulfilling from their assigned facilities', async () => {
    // Order strictly in Warehouse A
    const orderA = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }]);
    // Order strictly in Warehouse B
    const orderB = await placeOrder(customer2Token, [{ productId: productBId, warehouseId: warehouseBId, quantity: 1 }]);

    // Staff A (assigned only to Warehouse A)
    const staffAList = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${staffWarehouseAToken}`);
    expect(staffAList.status).toBe(200);
    const staffAIds = staffAList.body.data.map((o: any) => o.id);
    expect(staffAIds).toContain(orderA.id);
    expect(staffAIds).not.toContain(orderB.id);

    // Staff B (assigned only to Warehouse B)
    const staffBList = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${staffWarehouseBToken}`);
    expect(staffBList.status).toBe(200);
    const staffBIds = staffBList.body.data.map((o: any) => o.id);
    expect(staffBIds).toContain(orderB.id);
    expect(staffBIds).not.toContain(orderA.id);

    // Manager (assigned to both A and B) sees both
    const managerList = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(managerList.status).toBe(200);
    const managerIds = managerList.body.data.map((o: any) => o.id);
    expect(managerIds).toContain(orderA.id);
    expect(managerIds).toContain(orderB.id);
  });

  it('5. Customer role cannot list internal operational orders and only sees own orders', async () => {
    const orderCust1 = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }]);
    const orderCust2 = await placeOrder(customer2Token, [{ productId: productBId, warehouseId: warehouseAId, quantity: 1 }]);

    // Customer 1 queries /api/v1/orders -> receives strictly own orders
    const cust1List = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`);
    expect(cust1List.status).toBe(200);
    expect(cust1List.body.data.length).toBe(1);
    expect(cust1List.body.data[0].id).toBe(orderCust1.id);

    // Customer 1 attempts to query Customer 2 order by ID -> 403 Forbidden
    const forbiddenRes = await request(app)
      .get(`/api/v1/orders/${orderCust2.id}`)
      .set('Authorization', `Bearer ${customer1Token}`);
    expect(forbiddenRes.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 3. Complete Fulfilment Lifecycle Progression & Movement Recording
  // --------------------------------------------------------------------------
  it('6. Full operational lifecycle: Process -> Dispatch (Physical Stock Deduction) -> Deliver -> Inspect Ledger', async () => {
    const order = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 4 }]);
    expect(order.status).toBe(OrderStatus.CONFIRMED);

    // Step 1: Staff moves order to PROCESSING
    const processRes = await request(app)
      .post(`/api/v1/orders/${order.id}/process`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ notes: 'Picking 4 units of Industrial Valve Unit from Section B' });

    expect(processRes.status).toBe(200);
    expect(processRes.body.data.status).toBe(OrderStatus.PROCESSING);

    // Step 2: Staff dispatches order with carrier and tracking
    const dispatchRes = await request(app)
      .post(`/api/v1/orders/${order.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({
        carrier: 'FedEx Ground',
        trackingNumber: 'FDX-OPS-998811',
        notes: 'Dispatched on afternoon carrier sweep',
      });

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.data.status).toBe(OrderStatus.SHIPPED);

    // Step 3: Staff marks delivered
    const deliverRes = await request(app)
      .post(`/api/v1/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({
        deliveryNotes: 'Delivered to client reception, signed by Martha Wayne',
        deliveredAt: new Date().toISOString(),
      });

    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.data.status).toBe(OrderStatus.DELIVERED);

    // Step 4: GET order detail includes inventory movement records
    const detailRes = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`);

    expect(detailRes.status).toBe(200);
    const detail = detailRes.body.data;
    expect(detail.status).toBe(OrderStatus.DELIVERED);
    expect(detail.inventoryMovements).toBeDefined();

    const dispatchMovements = detail.inventoryMovements.filter(
      (m: any) => m.movementType === MovementType.DISPATCH
    );
    expect(dispatchMovements.length).toBe(1);

    const movement = dispatchMovements[0];
    expect(movement.movementType).toBe(MovementType.DISPATCH);
    expect(movement.quantityDelta).toBe(-4);
    expect(movement.warehouse.code).toBe('WH-OPS-A');
    expect(movement.product.sku).toBe('SKU-OPS-ITEM-1');
  });

  // --------------------------------------------------------------------------
  // 4. Multi-Warehouse Allocations Handling
  // --------------------------------------------------------------------------
  it('7. Multi-warehouse order shows both facility allocations and prevents unauthorized staff dispatch', async () => {
    // Place order spanning Warehouse A (2 units) and Warehouse B (3 units)
    const multiOrder = await placeOrder(customer1Token, [
      { productId: productAId, warehouseId: warehouseAId, quantity: 2 },
      { productId: productBId, warehouseId: warehouseBId, quantity: 3 },
    ]);

    // Inspect detailed order view: has line items from both warehouses
    const detailRes = await request(app)
      .get(`/api/v1/orders/${multiOrder.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.orderItems.length).toBe(2);

    const warehouseIds = detailRes.body.data.orderItems.map((i: any) => i.warehouseId);
    expect(warehouseIds).toContain(warehouseAId);
    expect(warehouseIds).toContain(warehouseBId);

    // Move to PROCESSING
    await request(app)
      .post(`/api/v1/orders/${multiOrder.id}/process`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send();

    // Staff A (assigned ONLY to Warehouse A) attempts to dispatch the whole multi-warehouse order
    // Should be rejected with 403 Forbidden because they lack access to Warehouse B
    const unauthDispatch = await request(app)
      .post(`/api/v1/orders/${multiOrder.id}/dispatch`)
      .set('Authorization', `Bearer ${staffWarehouseAToken}`)
      .send({ trackingNumber: 'TRK-UNAUTH-01' });

    expect(unauthDispatch.status).toBe(403);
    expect(unauthDispatch.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

    // Manager (assigned to both A and B) dispatches successfully
    const managerDispatch = await request(app)
      .post(`/api/v1/orders/${multiOrder.id}/dispatch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ trackingNumber: 'TRK-MANAGER-OK' });

    expect(managerDispatch.status).toBe(200);
    expect(managerDispatch.body.data.status).toBe(OrderStatus.SHIPPED);

    // Verify inventory movements were generated for both warehouses
    const movRes = await request(app)
      .get(`/api/v1/orders/${multiOrder.id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    const dispatchMovements = movRes.body.data.inventoryMovements.filter(
      (m: any) => m.movementType === MovementType.DISPATCH
    );
    expect(dispatchMovements.length).toBe(2);
  });

  // --------------------------------------------------------------------------
  // 5. Error Handling & Guardrails
  // --------------------------------------------------------------------------
  it('8. Status validation guards reject invalid lifecycle transitions', async () => {
    // Unpaid order in RESERVED
    const unpaidOrder = await placeOrder(customer1Token, [{ productId: productAId, warehouseId: warehouseAId, quantity: 1 }], false);

    // Cannot process unpaid order
    const invalidProcess = await request(app)
      .post(`/api/v1/orders/${unpaidOrder.id}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(invalidProcess.status).toBe(422);

    // Cannot dispatch unpaid order
    const invalidDispatch = await request(app)
      .post(`/api/v1/orders/${unpaidOrder.id}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect([409, 422]).toContain(invalidDispatch.status);

    // Cannot deliver un-shipped order
    const invalidDeliver = await request(app)
      .post(`/api/v1/orders/${unpaidOrder.id}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(invalidDeliver.status).toBe(422);

    // Customer cannot call operational endpoints (403 Forbidden)
    const custProcess = await request(app)
      .post(`/api/v1/orders/${unpaidOrder.id}/process`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send();
    expect(custProcess.status).toBe(403);
  });
});
