import request from 'supertest';
import { UserRole, OrderStatus, ReservationStatus, MovementType } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Phase 3 — Standalone Inventory Management & Movement Ledger', () => {
  let adminToken: string;
  let adminUser: any;
  let managerToken: string;
  let managerUser: any;
  let staffToken: string;
  let staffUser: any;
  let unassignedStaffToken: string;
  let unassignedStaffUser: any;
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

    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
    staffToken = staff.token;
    staffUser = staff.user;

    const unassignedStaff = await createTestUser(UserRole.WAREHOUSE_STAFF);
    unassignedStaffToken = unassignedStaff.token;
    unassignedStaffUser = unassignedStaff.user;

    const customer = await createTestUser(UserRole.CUSTOMER);
    customerToken = customer.token;
    customerUser = customer.user;

    // 2. Create Warehouses
    const whResA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-ATL-01',
        name: 'Atlanta Distribution Hub',
        address: '100 Gateway Blvd',
        city: 'Atlanta',
        country: 'USA',
      });
    warehouseAId = whResA.body.data.id;

    const whResB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-ORD-02',
        name: 'Chicago Regional Facility',
        address: '500 Cargo Way',
        city: 'Chicago',
        country: 'USA',
      });
    warehouseBId = whResB.body.data.id;

    // 3. Assign Staff and Manager to Warehouse A only
    await prisma.userWarehouseAssignment.createMany({
      data: [
        {
          userId: managerUser.id,
          warehouseId: warehouseAId,
          role: UserRole.WAREHOUSE_MANAGER,
        },
        {
          userId: staffUser.id,
          warehouseId: warehouseAId,
          role: UserRole.WAREHOUSE_STAFF,
        },
      ],
    });

    // 4. Create Products
    const prodResA = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-LAPTOP-PRO',
        name: 'Enterprise Laptop Pro 16',
        description: 'High-performance workstation laptop',
        priceCents: 199900,
      });
    productAId = prodResA.body.data.id;

    const prodResB = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-KEYBOARD-MECH',
        name: 'Mechanical Wireless Keyboard',
        description: 'Compact wireless mechanical keyboard',
        priceCents: 12900,
      });
    productBId = prodResB.body.data.id;
  });

  describe('1. Inventory Overview & Multi-Warehouse Granularity', () => {
    beforeEach(async () => {
      // Stock Product A in Warehouse A (50 units) and Warehouse B (30 units)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 50,
          notes: 'Initial stock WH-A',
        });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseBId,
          quantity: 30,
          notes: 'Initial stock WH-B',
        });

      // Stock Product B in Warehouse A (20 units)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productBId,
          warehouseId: warehouseAId,
          quantity: 20,
          notes: 'Initial stock Prod B WH-A',
        });

      // Set global threshold for Product A (minQuantity: 40)
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          minQuantity: 40,
          reorderQuantity: 80,
        });

      // Set warehouse-specific threshold override for Product A at Warehouse A (minQuantity: 60)
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          minQuantity: 60,
          reorderQuantity: 100,
        });
    });

    it('displays distinct multi-warehouse rows separately and does not collapse them', async () => {
      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(3); // Prod A in WH A, Prod A in WH B, Prod B in WH A

      const prodA_WhA = items.find(
        (i: any) => i.productId === productAId && i.warehouseId === warehouseAId
      );
      const prodA_WhB = items.find(
        (i: any) => i.productId === productAId && i.warehouseId === warehouseBId
      );

      expect(prodA_WhA).toBeDefined();
      expect(prodA_WhB).toBeDefined();
      expect(prodA_WhA.warehouseId).not.toBe(prodA_WhB.warehouseId);
      expect(prodA_WhA.quantityOnHand).toBe(50);
      expect(prodA_WhB.quantityOnHand).toBe(30);
    });

    it('verifies availableStock formula: quantityOnHand - quantityReserved', async () => {
      // Simulate 10 units reserved for Product A at Warehouse A
      await prisma.inventory.update({
        where: {
          productId_warehouseId: {
            productId: productAId,
            warehouseId: warehouseAId,
          },
        },
        data: { quantityReserved: 10 },
      });

      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`);

      const prodA_WhA = res.body.data.find(
        (i: any) => i.productId === productAId && i.warehouseId === warehouseAId
      );

      expect(prodA_WhA.quantityOnHand).toBe(50);
      expect(prodA_WhA.quantityReserved).toBe(10);
      expect(prodA_WhA.quantityAvailable).toBe(40); // 50 - 10
    });

    it('resolves effective threshold priority: warehouse override over global default', async () => {
      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`);

      const prodA_WhA = res.body.data.find(
        (i: any) => i.productId === productAId && i.warehouseId === warehouseAId
      );
      const prodA_WhB = res.body.data.find(
        (i: any) => i.productId === productAId && i.warehouseId === warehouseBId
      );
      const prodB_WhA = res.body.data.find(
        (i: any) => i.productId === productBId && i.warehouseId === warehouseAId
      );

      // Warehouse A has override threshold 60 (OnHand 50 < 60 -> low stock true)
      expect(prodA_WhA.thresholdType).toBe('WAREHOUSE_OVERRIDE');
      expect(prodA_WhA.minQuantity).toBe(60);
      expect(prodA_WhA.isLowStock).toBe(true);

      // Warehouse B has global default threshold 40 (OnHand 30 < 40 -> low stock true)
      expect(prodA_WhB.thresholdType).toBe('GLOBAL_DEFAULT');
      expect(prodA_WhB.minQuantity).toBe(40);
      expect(prodA_WhB.isLowStock).toBe(true);

      // Product B has no threshold
      expect(prodB_WhA.thresholdType).toBe('NONE');
      expect(prodB_WhA.minQuantity).toBeNull();
      expect(prodB_WhA.isLowStock).toBe(false);
    });

    it('filters inventory by search and lowStockOnly', async () => {
      // 1. Search by SKU
      const searchRes = await request(app)
        .get('/api/v1/inventory?search=KEYBOARD')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.length).toBe(1);
      expect(searchRes.body.data[0].product.sku).toBe('SKU-KEYBOARD-MECH');

      // 2. Filter lowStockOnly=true
      const lowStockRes = await request(app)
        .get('/api/v1/inventory?lowStockOnly=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(lowStockRes.status).toBe(200);
      // Both Prod A records are low stock; Prod B is not
      expect(lowStockRes.body.data.length).toBe(2);
      expect(lowStockRes.body.data.every((i: any) => i.isLowStock === true)).toBe(true);
    });

    it('enforces RBAC warehouse scoping: Staff only sees assigned warehouse inventory', async () => {
      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      const items = res.body.data;
      // Staff is assigned to Warehouse A only
      expect(items.length).toBe(2);
      expect(items.every((i: any) => i.warehouseId === warehouseAId)).toBe(true);
    });

    it('forbids Customer from inspecting internal inventory ledgers', async () => {
      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('2. Summary Metrics API (GET /api/v1/inventory/metrics)', () => {
    beforeEach(async () => {
      // Restock 100 units of Product A at Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 100,
        });

      // Restock 50 units of Product B at Warehouse B
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productBId,
          warehouseId: warehouseBId,
          quantity: 50,
        });

      // Set threshold for Product A (min: 150) -> will be low stock
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          minQuantity: 150,
        });
    });

    it('returns accurate organization-wide metrics for Admin', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        totalSkus: 2,
        totalOnHand: 150, // 100 + 50
        totalReserved: 0,
        totalAvailable: 150,
        lowStockCount: 1, // Product A (100 < 150)
      });
    });

    it('scopes metrics to assigned facility for Warehouse Staff', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/metrics')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        totalSkus: 1, // Only Product A in Warehouse A
        totalOnHand: 100,
        totalReserved: 0,
        totalAvailable: 100,
        lowStockCount: 1,
      });
    });
  });

  describe('3. Movement History Ledger (GET /api/v1/inventory/movements)', () => {
    beforeEach(async () => {
      // 1. Initial Restock
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 100,
          supplier: 'Acme Hardware Corp',
          notes: 'Batch shipment #492',
        });

      // 2. Second Restock at Warehouse B
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseBId,
          quantity: 40,
          supplier: 'Apex Logistics',
          notes: 'Regional transfer',
        });
    });

    it('returns paginated movement logs with pagination metadata', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/movements?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.movements).toBeDefined();
      expect(res.body.data.movements.length).toBe(2);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        totalRecords: 2,
        totalPages: 1,
      });

      const firstMovement = res.body.data.movements[0];
      expect(firstMovement.movementType).toBe('RESTOCK');
      expect(firstMovement.product).toBeDefined();
      expect(firstMovement.warehouse).toBeDefined();
      expect(firstMovement.quantityDelta).toBeGreaterThan(0);
    });

    it('filters movements by warehouseId and movementType', async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/movements?warehouseId=${warehouseAId}&movementType=RESTOCK`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.movements.length).toBe(1);
      expect(res.body.data.movements[0].warehouseId).toBe(warehouseAId);
      expect(res.body.data.movements[0].notes).toContain('Acme Hardware Corp');
    });

    it('enforces RBAC: Staff cannot view movements from unassigned facilities', async () => {
      // Staff assigned to WH A queries WH B -> Forbidden
      const res = await request(app)
        .get(`/api/v1/inventory/movements?warehouseId=${warehouseBId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('confirms movements are immutable: no update or delete routes exist', async () => {
      const listRes = await request(app)
        .get('/api/v1/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`);

      const movementId = listRes.body.data.movements[0].id;

      // Attempt PUT on movement -> 404
      const putRes = await request(app)
        .put(`/api/v1/inventory/movements/${movementId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantityDelta: 999 });

      expect(putRes.status).toBe(404);

      // Attempt DELETE on movement -> 404
      const delRes = await request(app)
        .delete(`/api/v1/inventory/movements/${movementId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(404);
    });
  });

  describe('4. Restock Workflow & Threshold Evaluation', () => {
    it('restocks inventory, updates physical stock, and evaluates threshold', async () => {
      // Configure threshold of 50
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          minQuantity: 50,
        });

      // Restock 60 units (now above threshold)
      const restockRes = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 60,
          supplier: 'Direct Tech Suppliers',
          notes: 'Restock order PO-1029',
        });

      expect(restockRes.status).toBe(200);
      expect(restockRes.body.data.quantityOnHand).toBe(60);
      expect(restockRes.body.data.quantityAvailable).toBe(60);

      // Inspect inventory detail
      const invRes = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${staffToken}`);

      const item = invRes.body.data[0];
      expect(item.quantityOnHand).toBe(60);
      expect(item.isLowStock).toBe(false); // 60 >= 50
    });

    it('rejects invalid restock inputs (zero or negative quantity)', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 0,
        });

      expect(res.status).toBe(400);
    });

    it('forbids unassigned staff from restocking a warehouse', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${unassignedStaffToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 10,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('5. Reservations Visibility & Paid Order Protection', () => {
    let orderPaidId: string;
    let orderUnpaidId: string;

    beforeEach(async () => {
      // Restock 100 units of Product A in Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: productAId,
          warehouseId: warehouseAId,
          quantity: 100,
        });

      // 1. Create a paid/confirmed order
      const orderPaidRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '123 Pine St, Atlanta, GA',
          items: [
            {
              productId: productAId,
              warehouseId: warehouseAId,
              quantity: 2,
            },
          ],
        });
      orderPaidId = orderPaidRes.body.data.id;

      // Simulate payment confirmation
      const payRes = await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: orderPaidId,
          amountCents: orderPaidRes.body.data.totalAmountCents,
          paymentMethod: 'TEST_CARD',
          simulateOutcome: 'SUCCESS',
        });
      expect(payRes.status).toBe(200);

      // 2. Create an unpaid pending order
      const orderUnpaidRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '456 Oak Ave, Atlanta, GA',
          items: [
            {
              productId: productAId,
              warehouseId: warehouseAId,
              quantity: 1,
            },
          ],
        });
      orderUnpaidId = orderUnpaidRes.body.data.id;

      // Force reservation expiry on the paid order's reservation to simulate TTL passage
      await prisma.inventoryReservation.updateMany({
        where: { orderId: orderPaidId },
        data: { expiresAt: new Date(Date.now() - 3600 * 1000) }, // 1 hour ago
      });

      // Force reservation expiry on unpaid order to simulate stale hold
      await prisma.inventoryReservation.updateMany({
        where: { orderId: orderUnpaidId },
        data: { expiresAt: new Date(Date.now() - 3600 * 1000) }, // 1 hour ago
      });
    });

    it('ensures paid confirmed order reservations do not appear as expired merely because TTL passed', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/reservations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const reservations = res.body.data.reservations;
      expect(reservations.length).toBe(2);

      const paidReservation = reservations.find((r: any) => r.orderId === orderPaidId);
      const unpaidReservation = reservations.find((r: any) => r.orderId === orderUnpaidId);

      // Paid order reservation: isPaid is true, displayStatus is COMMITTED, isExpired is false
      expect(paidReservation).toBeDefined();
      expect(paidReservation.isPaid).toBe(true);
      expect(paidReservation.isExpired).toBe(false);
      expect(paidReservation.displayStatus).toBe('COMMITTED');

      // Unpaid order reservation: isPaid is false, isExpired is true
      expect(unpaidReservation).toBeDefined();
      expect(unpaidReservation.isPaid).toBe(false);
      expect(unpaidReservation.isExpired).toBe(true);
      expect(unpaidReservation.displayStatus).toBe('EXPIRED');
    });

    it('enforces RBAC: Staff only inspects reservations for assigned facilities', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/reservations')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reservations.every((r: any) => r.warehouse.id === warehouseAId)).toBe(true);
    });

    it('forbids Customer from inspecting inventory reservations', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/reservations')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
