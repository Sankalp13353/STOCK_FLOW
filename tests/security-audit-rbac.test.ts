import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('StockFlow — Post-Implementation Security Audit', () => {
  let adminToken: string;
  let adminUser: any;
  let warehouseA: any;
  let warehouseB: any;
  let warehouseC: any;
  let product1: any;
  let product2: any;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    adminToken = admin.token;
    adminUser = admin.user;

    // Create 3 separate warehouses: A, B, and C
    const whResA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-SEC-A',
        name: 'Security Hub Alpha',
        address: '100 Alpha Way',
        city: 'New York',
        country: 'USA',
      });
    warehouseA = whResA.body.data;

    const whResB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-SEC-B',
        name: 'Security Hub Beta',
        address: '200 Beta Way',
        city: 'Austin',
        country: 'USA',
      });
    warehouseB = whResB.body.data;

    const whResC = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-SEC-C',
        name: 'Security Hub Gamma',
        address: '300 Gamma Way',
        city: 'Seattle',
        country: 'USA',
      });
    warehouseC = whResC.body.data;

    // Create 2 products
    const prodRes1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SEC-PROD-01',
        name: 'Secure Gateway Router',
        priceCents: 49900,
      });
    product1 = prodRes1.body.data;

    const prodRes2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SEC-PROD-02',
        name: 'Industrial Firewall Unit',
        priceCents: 89900,
      });
    product2 = prodRes2.body.data;

    // Stock inventory:
    // Product 1: 100 units at Warehouse A, 50 units at Warehouse B
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: product1.id, warehouseId: warehouseA.id, quantity: 100 });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: product1.id, warehouseId: warehouseB.id, quantity: 50 });

    // Product 2: 50 units at Warehouse B, 75 units at Warehouse C
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: product2.id, warehouseId: warehouseB.id, quantity: 50 });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: product2.id, warehouseId: warehouseC.id, quantity: 75 });
  });

  describe('1. Reservation Expiry Endpoint Authorization', () => {
    it('should allow ADMIN to trigger manual administrative reservation expiry', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/expire-reservations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('expiredReservationsCount');
      expect(res.body.data).toHaveProperty('expiredOrdersCount');
    });

    it('should forbid WAREHOUSE_MANAGER from triggering global reservation expiry', async () => {
      const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      await request(app)
        .post(`/api/v1/users/${manager.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      const res = await request(app)
        .post('/api/v1/inventory/expire-reservations')
        .set('Authorization', `Bearer ${manager.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should forbid WAREHOUSE_STAFF from triggering global reservation expiry', async () => {
      const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
      await request(app)
        .post(`/api/v1/users/${staff.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      const res = await request(app)
        .post('/api/v1/inventory/expire-reservations')
        .set('Authorization', `Bearer ${staff.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should forbid CUSTOMER from triggering global reservation expiry', async () => {
      const customer = await createTestUser(UserRole.CUSTOMER);

      const res = await request(app)
        .post('/api/v1/inventory/expire-reservations')
        .set('Authorization', `Bearer ${customer.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Order Authorization & Ownership Enforcements', () => {
    let customer1: any;
    let customer2: any;
    let orderWhA: any;
    let orderWhC: any;
    let multiWhOrder: any;

    beforeEach(async () => {
      customer1 = await createTestUser(UserRole.CUSTOMER);
      customer2 = await createTestUser(UserRole.CUSTOMER);

      // Order 1: Customer 1 orders Product 1 explicitly from Warehouse A
      const ord1Res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1.token}`)
        .send({
          shippingAddress: '123 Customer One Way, Boston',
          items: [{ productId: product1.id, warehouseId: warehouseA.id, quantity: 2 }],
        });
      orderWhA = ord1Res.body.data;

      // Order 2: Customer 2 orders Product 2 explicitly from Warehouse C
      const ord2Res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer2.token}`)
        .send({
          shippingAddress: '456 Customer Two Blvd, Seattle',
          items: [{ productId: product2.id, warehouseId: warehouseC.id, quantity: 5 }],
        });
      orderWhC = ord2Res.body.data;

      // Order 3 (Multi-Warehouse): Customer 1 orders spanning Warehouse A and Warehouse B
      const ord3Res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1.token}`)
        .send({
          shippingAddress: '123 Multi-Hub Way, Dallas',
          items: [
            { productId: product1.id, warehouseId: warehouseA.id, quantity: 1 },
            { productId: product2.id, warehouseId: warehouseB.id, quantity: 1 },
          ],
        });
      multiWhOrder = ord3Res.body.data;
    });

    it('Customers can ONLY see their own orders in list and detail; changing order ID fails with 403', async () => {
      // Customer 1 lists orders: sees Order 1 and Order 3, NOT Order 2
      const listRes1 = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1.token}`);

      expect(listRes1.status).toBe(200);
      const c1OrderIds = listRes1.body.data.map((o: any) => o.id);
      expect(c1OrderIds).toContain(orderWhA.id);
      expect(c1OrderIds).toContain(multiWhOrder.id);
      expect(c1OrderIds).not.toContain(orderWhC.id);

      // Customer 1 can view own order details
      const detailRes = await request(app)
        .get(`/api/v1/orders/${orderWhA.id}`)
        .set('Authorization', `Bearer ${customer1.token}`);
      expect(detailRes.status).toBe(200);

      // Changing order ID to Customer 2's order is rejected with 403 Forbidden
      const exploitRes = await request(app)
        .get(`/api/v1/orders/${orderWhC.id}`)
        .set('Authorization', `Bearer ${customer1.token}`);
      expect(exploitRes.status).toBe(403);
      expect(exploitRes.body.error.code).toBe('FORBIDDEN');
    });

    it('Managers only see orders associated with their assigned warehouses', async () => {
      const managerA = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      // Assign manager to Warehouse A only
      await request(app)
        .post(`/api/v1/users/${managerA.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      // Manager A lists orders: sees orderWhA and multiWhOrder (since it contains warehouse A item), NOT orderWhC
      const listRes = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${managerA.token}`);

      expect(listRes.status).toBe(200);
      const orderIds = listRes.body.data.map((o: any) => o.id);
      expect(orderIds).toContain(orderWhA.id);
      expect(orderIds).toContain(multiWhOrder.id);
      expect(orderIds).not.toContain(orderWhC.id);

      // Manager A detail check on assigned warehouse order
      const getA = await request(app)
        .get(`/api/v1/orders/${orderWhA.id}`)
        .set('Authorization', `Bearer ${managerA.token}`);
      expect(getA.status).toBe(200);

      // Manager A attempting to access unassigned warehouse C order is rejected with 403
      const getC = await request(app)
        .get(`/api/v1/orders/${orderWhC.id}`)
        .set('Authorization', `Bearer ${managerA.token}`);
      expect(getC.status).toBe(403);
      expect(getC.body.error.code).toBe('FORBIDDEN');
    });

    it('Staff only see orders associated with their assigned warehouses', async () => {
      const staffC = await createTestUser(UserRole.WAREHOUSE_STAFF);
      // Assign staff to Warehouse C only
      await request(app)
        .post(`/api/v1/users/${staffC.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseC.id });

      // Staff C lists orders: sees only orderWhC
      const listRes = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${staffC.token}`);

      expect(listRes.status).toBe(200);
      const orderIds = listRes.body.data.map((o: any) => o.id);
      expect(orderIds).toContain(orderWhC.id);
      expect(orderIds).not.toContain(orderWhA.id);
      expect(orderIds).not.toContain(multiWhOrder.id);

      // Staff C detail check on assigned warehouse order
      const getC = await request(app)
        .get(`/api/v1/orders/${orderWhC.id}`)
        .set('Authorization', `Bearer ${staffC.token}`);
      expect(getC.status).toBe(200);

      // Staff C attempting to access unassigned warehouse A order is rejected with 403
      const getA = await request(app)
        .get(`/api/v1/orders/${orderWhA.id}`)
        .set('Authorization', `Bearer ${staffC.token}`);
      expect(getA.status).toBe(403);
      expect(getA.body.error.code).toBe('FORBIDDEN');
    });

    it('Multi-warehouse order rule: Accessible if at least one item belongs to an assigned warehouse', async () => {
      // multiWhOrder contains items from Warehouse A and Warehouse B
      const managerB = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      await request(app)
        .post(`/api/v1/users/${managerB.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseB.id });

      const managerC = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      await request(app)
        .post(`/api/v1/users/${managerC.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseC.id });

      // Manager B (assigned to B) CAN view multiWhOrder
      const resB = await request(app)
        .get(`/api/v1/orders/${multiWhOrder.id}`)
        .set('Authorization', `Bearer ${managerB.token}`);
      expect(resB.status).toBe(200);

      // Manager C (assigned ONLY to C) CANNOT view multiWhOrder
      const resC = await request(app)
        .get(`/api/v1/orders/${multiWhOrder.id}`)
        .set('Authorization', `Bearer ${managerC.token}`);
      expect(resC.status).toBe(403);
      expect(resC.body.error.code).toBe('FORBIDDEN');
    });

    it('Manager cannot see their own order if it has no assigned-warehouse items', async () => {
      const managerA = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      await request(app)
        .post(`/api/v1/users/${managerA.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      // Manager A places an order fulfilled by unassigned Warehouse C
      const unassignedOrderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${managerA.token}`)
        .send({
          shippingAddress: '999 Manager Personal Residence, NY',
          items: [{ productId: product2.id, warehouseId: warehouseC.id, quantity: 1 }],
        });
      const unassignedOrder = unassignedOrderRes.body.data;

      // 1. Manager A lists operational orders: order does NOT appear
      const listRes = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${managerA.token}`);
      expect(listRes.status).toBe(200);
      const orderIds = listRes.body.data.map((o: any) => o.id);
      expect(orderIds).not.toContain(unassignedOrder.id);

      // 2. Manager A queries order details directly: rejected with 403 Forbidden
      const detailRes = await request(app)
        .get(`/api/v1/orders/${unassignedOrder.id}`)
        .set('Authorization', `Bearer ${managerA.token}`);
      expect(detailRes.status).toBe(403);
      expect(detailRes.body.error.code).toBe('FORBIDDEN');

      // 3. Manager A can still view their personal purchase history via /my-orders
      const myOrdersRes = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${managerA.token}`);
      expect(myOrdersRes.status).toBe(200);
      const myOrderIds = myOrdersRes.body.data.map((o: any) => o.id);
      expect(myOrderIds).toContain(unassignedOrder.id);
    });

    it('Staff cannot see their own order if it has no assigned-warehouse items', async () => {
      const staffA = await createTestUser(UserRole.WAREHOUSE_STAFF);
      await request(app)
        .post(`/api/v1/users/${staffA.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      // Staff A places an order fulfilled by unassigned Warehouse C
      const unassignedOrderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${staffA.token}`)
        .send({
          shippingAddress: '888 Staff Personal Residence, Boston',
          items: [{ productId: product2.id, warehouseId: warehouseC.id, quantity: 1 }],
        });
      const unassignedOrder = unassignedOrderRes.body.data;

      // 1. Staff A lists operational orders: order does NOT appear
      const listRes = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${staffA.token}`);
      expect(listRes.status).toBe(200);
      const orderIds = listRes.body.data.map((o: any) => o.id);
      expect(orderIds).not.toContain(unassignedOrder.id);

      // 2. Staff A queries order details directly: rejected with 403 Forbidden
      const detailRes = await request(app)
        .get(`/api/v1/orders/${unassignedOrder.id}`)
        .set('Authorization', `Bearer ${staffA.token}`);
      expect(detailRes.status).toBe(403);
      expect(detailRes.body.error.code).toBe('FORBIDDEN');

      // 3. Staff A can still view their personal purchase history via /my-orders
      const myOrdersRes = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${staffA.token}`);
      expect(myOrdersRes.status).toBe(200);
      const myOrderIds = myOrdersRes.body.data.map((o: any) => o.id);
      expect(myOrderIds).toContain(unassignedOrder.id);
    });
  });

  describe('3. Inventory Aggregation & Isolation (GET /api/v1/inventory)', () => {
    it('CUSTOMER cannot access internal inventory aggregation or product breakdown', async () => {
      const customer = await createTestUser(UserRole.CUSTOMER);

      // General inventory aggregation
      const genRes = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${customer.token}`);
      expect(genRes.status).toBe(403);
      expect(genRes.body.error.code).toBe('FORBIDDEN');

      // Product-specific breakdown
      const prodRes = await request(app)
        .get(`/api/v1/inventory?productId=${product1.id}`)
        .set('Authorization', `Bearer ${customer.token}`);
      expect(prodRes.status).toBe(403);
      expect(prodRes.body.error.code).toBe('FORBIDDEN');
    });

    it('ADMIN sees organization-wide inventory and complete multi-facility breakdown', async () => {
      const res = await request(app)
        .get(`/api/v1/inventory?productId=${product1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.productId).toBe(product1.id);
      // Product 1 has 100 at A and 50 at B = 150 total
      expect(res.body.data.totalOnHand).toBe(150);
      expect(res.body.data.breakdown).toHaveLength(2);
      const whCodes = res.body.data.breakdown.map((b: any) => b.warehouseCode);
      expect(whCodes).toContain('WH-SEC-A');
      expect(whCodes).toContain('WH-SEC-B');
    });

    it('WAREHOUSE_MANAGER product breakdown only includes assigned facilities and does not leak unauthorized stock', async () => {
      const managerA = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      await request(app)
        .post(`/api/v1/users/${managerA.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      // Product 1 exists in Warehouse A (100) and Warehouse B (50)
      const res = await request(app)
        .get(`/api/v1/inventory?productId=${product1.id}`)
        .set('Authorization', `Bearer ${managerA.token}`);

      expect(res.status).toBe(200);
      // Total must reflect ONLY assigned warehouse A (100), not warehouse B
      expect(res.body.data.totalOnHand).toBe(100);
      expect(res.body.data.breakdown).toHaveLength(1);
      expect(res.body.data.breakdown[0].warehouseId).toBe(warehouseA.id);
      expect(res.body.data.breakdown[0].warehouseCode).toBe('WH-SEC-A');
      expect(res.body.data.breakdown[0].quantityOnHand).toBe(100);
    });

    it('WAREHOUSE_STAFF general inventory aggregation only includes assigned facilities', async () => {
      const staffB = await createTestUser(UserRole.WAREHOUSE_STAFF);
      await request(app)
        .post(`/api/v1/users/${staffB.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseB.id });

      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${staffB.token}`);

      expect(res.status).toBe(200);
      // Staff B should only see items from Warehouse B
      for (const item of res.body.data) {
        expect(item.warehouseId).toBe(warehouseB.id);
      }
    });
  });

  describe('4. Assignment Revocation Immediate Enforcement', () => {
    it('revoking warehouse assignment immediately denies further access to warehouse and orders', async () => {
      const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
      const customer = await createTestUser(UserRole.CUSTOMER);

      // Assign staff to Warehouse A
      await request(app)
        .post(`/api/v1/users/${staff.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseA.id });

      // Create an order in Warehouse A
      const ordRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          shippingAddress: '789 Revoke Test Way',
          items: [{ productId: product1.id, warehouseId: warehouseA.id, quantity: 1 }],
        });
      const order = ordRes.body.data;

      // 1. Staff can access Warehouse A and Order
      const whBefore = await request(app)
        .get(`/api/v1/warehouses/${warehouseA.id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(whBefore.status).toBe(200);

      const ordBefore = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(ordBefore.status).toBe(200);

      // 2. Admin revokes assignment
      const delRes = await request(app)
        .delete(`/api/v1/users/${staff.user.id}/warehouses/${warehouseA.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);

      // 3. Immediate subsequent calls fail with 403 Forbidden
      const whAfter = await request(app)
        .get(`/api/v1/warehouses/${warehouseA.id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(whAfter.status).toBe(403);
      expect(whAfter.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

      const ordAfter = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(ordAfter.status).toBe(403);
      expect(ordAfter.body.error.code).toBe('FORBIDDEN');
    });
  });
});
