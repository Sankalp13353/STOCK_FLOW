import request from 'supertest';
import { MovementType, OrderStatus, TicketPriority, TicketStatus, TicketType, UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Phase 5 — Operational Dashboard & Business Analytics', () => {
  let adminToken: string;
  let adminUser: any;
  let managerToken: string;
  let managerUser: any;
  let staffToken: string;
  let staffUser: any;
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

    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
    staffToken = staff.token;
    staffUser = staff.user;

    const customer = await createTestUser(UserRole.CUSTOMER);
    customerToken = customer.token;
    customerUser = customer.user;

    // 2. Create Warehouses
    const whResA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-DAL-01',
        name: 'Dallas Distribution Center',
        address: '100 Gateway Blvd',
        city: 'Dallas',
        country: 'USA',
      });
    warehouseAId = whResA.body.data.id;

    const whResB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-HOU-02',
        name: 'Houston Metro Hub',
        address: '200 Logistics Way',
        city: 'Houston',
        country: 'USA',
      });
    warehouseBId = whResB.body.data.id;

    // Assign Manager & Staff strictly to Warehouse A
    await prisma.userWarehouseAssignment.createMany({
      data: [
        { userId: managerUser.id, warehouseId: warehouseAId },
        { userId: staffUser.id, warehouseId: warehouseAId },
      ],
    });

    // 3. Create Products
    const prodRes1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-WIDGET-PRO',
        name: 'Widget Pro 2000',
        description: 'Industrial grade smart widget',
        priceCents: 5000,
      });
    product1Id = prodRes1.body.data.id;

    const prodRes2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-GADGET-MAX',
        name: 'Gadget Max Ultra',
        description: 'High capacity wireless sensor',
        priceCents: 12000,
      });
    product2Id = prodRes2.body.data.id;
  });

  describe('1. Access Control & Authorization (RBAC)', () => {
    it('1. Admin can access organization-wide dashboard analytics', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('kpis');
      expect(res.body.data).toHaveProperty('inventory');
      expect(res.body.data).toHaveProperty('orders');
      expect(res.body.data).toHaveProperty('warehouses');
      expect(res.body.data).toHaveProperty('alerts');
      expect(res.body.data.kpis.totalProducts).toBe(2);
      expect(res.body.data.kpis.activeWarehouses).toBe(2);
    });

    it('2. Manager can access analytics for assigned warehouse', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kpis.activeWarehouses).toBe(1); // Only Warehouse A
    });

    it('3. Staff can access analytics for assigned warehouse', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/kpis')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeWarehouses).toBe(1);
    });

    it('4. Customer is forbidden from accessing business analytics (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('5. Unauthenticated request is rejected (HTTP 401)', async () => {
      const res = await request(app).get('/api/v1/analytics/dashboard');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('6. Manager cannot access analytics of an unassigned warehouse (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/analytics/dashboard?warehouseId=${warehouseBId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Operational KPI Calculations & Non-Deduction Invariant', () => {
    it('7. Calculates physical, reserved, available inventory correctly without premature physical deductions', async () => {
      // Step A: Restock Warehouse A (100 units) and Warehouse B (50 units)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 100,
        });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseBId,
          quantity: 50,
        });

      // Step B: Customer places an order for 20 units at Warehouse A (creates reservation hold)
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '777 Commerce St, Dallas, TX',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 20 }],
        });
      expect(orderRes.status).toBe(201);

      // Verify KPIs across organization:
      // Physical = 150 (100 in A + 50 in B)
      // Reserved = 20 (held for customer order in A)
      // Available = 130 (150 - 20)
      const res = await request(app)
        .get('/api/v1/analytics/kpis')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalPhysicalInventory).toBe(150);
      expect(res.body.data.totalReservedInventory).toBe(20);
      expect(res.body.data.totalAvailableInventory).toBe(130);
      expect(res.body.data.totalProducts).toBe(2);

      // Verify that reservations do not deduct physical stock:
      // quantityOnHand remains 100 in warehouse A, not 80!
      const invA = await prisma.inventory.findUnique({
        where: { productId_warehouseId: { productId: product1Id, warehouseId: warehouseAId } },
      });
      expect(invA?.quantityOnHand).toBe(100);
      expect(invA?.quantityReserved).toBe(20);
    });

    it('8. Evaluates low-stock records correctly prioritizing warehouse overrides over global thresholds', async () => {
      // Restock 15 units of Product 2 in Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product2Id,
          warehouseId: warehouseAId,
          quantity: 15,
        });

      // Create Global Default Threshold: minQuantity = 10 (15 > 10, so not low stock globally)
      await prisma.minimumStockThreshold.create({
        data: {
          productId: product2Id,
          warehouseId: null,
          minQuantity: 10,
          isActive: true,
        },
      });

      // Verify initially not low stock
      let kpis = (await request(app).get('/api/v1/analytics/kpis').set('Authorization', `Bearer ${adminToken}`)).body.data;
      expect(kpis.lowStockCount).toBe(0);

      // Now create Warehouse Override Threshold for Warehouse A: minQuantity = 25 (15 < 25 -> Low Stock!)
      await prisma.minimumStockThreshold.create({
        data: {
          productId: product2Id,
          warehouseId: warehouseAId,
          minQuantity: 25,
          isActive: true,
        },
      });

      kpis = (await request(app).get('/api/v1/analytics/kpis').set('Authorization', `Bearer ${adminToken}`)).body.data;
      expect(kpis.lowStockCount).toBe(1);
    });
  });

  describe('3. Order Lifecycle Analytics & Backlog', () => {
    it('9. Correctly tracks order status counts, backlog, and cancellation trends', async () => {
      // 1. Restock inventory
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 100,
        });

      // 2. Create Order 1: Pay it so it reaches CONFIRMED (Awaiting Processing)
      const o1 = (
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            shippingAddress: '100 Main St',
            items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 5 }],
          })
      ).body.data;

      await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: o1.id,
          amountCents: o1.totalAmountCents,
          paymentMethod: 'VISA_TEST',
          simulateOutcome: 'SUCCESS',
        });

      // 3. Create Order 2: Pay it, then staff starts processing -> reaches PROCESSING (Awaiting Dispatch)
      const o2 = (
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            shippingAddress: '200 Oak St',
            items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 5 }],
          })
      ).body.data;

      await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: o2.id,
          amountCents: o2.totalAmountCents,
          paymentMethod: 'VISA_TEST',
          simulateOutcome: 'SUCCESS',
        });

      await request(app)
        .post(`/api/v1/orders/${o2.id}/process`)
        .set('Authorization', `Bearer ${staffToken}`);

      // 4. Create Order 3: Cancelled
      const o3 = (
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            shippingAddress: '300 Pine St',
            items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 5 }],
          })
      ).body.data;

      await request(app)
        .post(`/api/v1/orders/${o3.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      // Inspect Order Analytics
      const res = await request(app)
        .get('/api/v1/analytics/orders?timeRange=7d')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const orders = res.body.data;

      expect(orders.backlog.awaitingProcessingCount).toBe(1); // Order 1 (CONFIRMED)
      expect(orders.backlog.awaitingDispatchCount).toBe(1);   // Order 2 (PROCESSING)
      expect(orders.backlog.totalBacklog).toBe(2);
      expect(orders.cancellationTrends.cancelledCount).toBe(1); // Order 3 (CANCELLED)

      const statusMap = new Map(orders.byStatus.map((s: any) => [s.status, s.count]));
      expect(statusMap.get(OrderStatus.CONFIRMED)).toBe(1);
      expect(statusMap.get(OrderStatus.PROCESSING)).toBe(1);
      expect(statusMap.get(OrderStatus.CANCELLED)).toBe(1);
    });
  });

  describe('4. Physical Movement Trends (Restock vs Dispatch)', () => {
    it('10. Aggregates restock and physical dispatch movements over time', async () => {
      // 1. Restock 50 units
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 50,
        });

      // 2. Create order, pay, process, and dispatch 10 units
      const o = (
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            shippingAddress: '123 Test Rd',
            items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 10 }],
          })
      ).body.data;

      await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: o.id,
          amountCents: o.totalAmountCents,
          paymentMethod: 'VISA_TEST',
          simulateOutcome: 'SUCCESS',
        });

      await request(app)
        .post(`/api/v1/orders/${o.id}/process`)
        .set('Authorization', `Bearer ${staffToken}`);

      await request(app)
        .post(`/api/v1/orders/${o.id}/dispatch`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ warehouseId: warehouseAId });

      // Fetch inventory analytics movement trends
      const res = await request(app)
        .get('/api/v1/analytics/inventory?timeRange=7d')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const trends = res.body.data.movementTrends;
      expect(Array.isArray(trends)).toBe(true);

      const totalRestocked = trends.reduce((sum: number, t: any) => sum + t.restockQuantity, 0);
      const totalDispatched = trends.reduce((sum: number, t: any) => sum + t.dispatchQuantity, 0);

      expect(totalRestocked).toBe(50);
      expect(totalDispatched).toBe(10);
    });
  });

  describe('5. Operational Alerts & Bottlenecks Feed', () => {
    it('11. Generates actionable operational alerts for orders awaiting processing, dispatch, and shortages', async () => {
      // Restock Warehouse A
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 40,
        });

      // Create and pay an order -> leaves it in CONFIRMED
      const o = (
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            shippingAddress: '456 Alert Ln',
            items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 5 }],
          })
      ).body.data;

      await request(app)
        .post('/api/v1/payments/process')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: o.id,
          amountCents: o.totalAmountCents,
          paymentMethod: 'VISA_TEST',
          simulateOutcome: 'SUCCESS',
        });

      // Create an open shortage ticket
      await prisma.ticket.create({
        data: {
          ticketNumber: 'TCK-TEST-ALERT-01',
          type: TicketType.ORDER_SHORTAGE,
          status: TicketStatus.OPEN,
          priority: TicketPriority.HIGH,
          productId: product1Id,
          warehouseId: warehouseAId,
          shortageQuantity: 8,
        },
      });

      // Fetch alerts
      const res = await request(app)
        .get('/api/v1/analytics/alerts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalAlerts).toBeGreaterThanOrEqual(2);

      const alertTypes = res.body.data.alerts.map((a: any) => a.type);
      expect(alertTypes).toContain('AWAITING_PROCESSING');
      expect(alertTypes).toContain('SHORTAGE_TICKET');

      const procAlert = res.body.data.alerts.find((a: any) => a.type === 'AWAITING_PROCESSING');
      expect(procAlert.targetUrl).toContain('/orders/');
    });
  });

  describe('6. Warehouse Performance & Workload Comparison', () => {
    it('12. Accurately compares multi-facility throughput and inventory levels', async () => {
      // Add stock in Warehouse A and Warehouse B
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 100,
        });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseBId,
          quantity: 75,
        });

      const res = await request(app)
        .get('/api/v1/analytics/warehouses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);

      const whA = res.body.data.find((w: any) => w.warehouseId === warehouseAId);
      const whB = res.body.data.find((w: any) => w.warehouseId === warehouseBId);

      expect(whA.inventoryOnHand).toBe(100);
      expect(whA.warehouseCode).toBe('WH-DAL-01');
      expect(whB.inventoryOnHand).toBe(75);
      expect(whB.warehouseCode).toBe('WH-HOU-02');
    });
  });

  describe('7. Edge Cases & Empty Datasets', () => {
    it('13. Empty datasets return valid zero-value metrics without error', async () => {
      // Create a user with Manager role but no warehouse assignments
      const unassignedManager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${unassignedManager.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.kpis.totalPhysicalInventory).toBe(0);
      expect(res.body.data.kpis.totalReservedInventory).toBe(0);
      expect(res.body.data.kpis.totalAvailableInventory).toBe(0);
      expect(res.body.data.kpis.lowStockCount).toBe(0);
      expect(res.body.data.kpis.activeWarehouses).toBe(0);
      expect(res.body.data.warehouses).toEqual([]);
      expect(res.body.data.alerts.alerts).toEqual([]);
    });

    it('14. Warehouse filter query parameter scopes all dashboard metrics to the specified facility', async () => {
      // Restock Warehouse A (100) and Warehouse B (60)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 100,
        });

      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseBId,
          quantity: 60,
        });

      // Filter by Warehouse A
      const resA = await request(app)
        .get(`/api/v1/analytics/dashboard?warehouseId=${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.kpis.totalPhysicalInventory).toBe(100);
      expect(resA.body.data.warehouses.length).toBe(1);
      expect(resA.body.data.warehouses[0].warehouseId).toBe(warehouseAId);

      // Filter by Warehouse B
      const resB = await request(app)
        .get(`/api/v1/analytics/dashboard?warehouseId=${warehouseBId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.kpis.totalPhysicalInventory).toBe(60);
      expect(resB.body.data.warehouses.length).toBe(1);
      expect(resB.body.data.warehouses[0].warehouseId).toBe(warehouseBId);
    });
  });
});
