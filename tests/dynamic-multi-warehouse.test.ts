import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('StockFlow — Dynamic Multi-Warehouse Dashboard & Role Authorization', () => {
  let adminToken: string;
  let adminUser: any;
  let testProductId: string;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    adminToken = admin.token;
    adminUser = admin.user;

    // Create a product for restock and inventory verification
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'TEST-SKU-DYNAMIC-WH',
        name: 'Enterprise Fiber Router',
        priceCents: 129900,
      });
    testProductId = prodRes.body.data.id;
  });

  // Helper to create a warehouse facility
  async function createWarehouse(code: string, name: string) {
    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        name,
        address: `${code} Logistics Way`,
        city: 'Metropolis',
        country: 'USA',
      });
    return res.body.data;
  }

  // 1. Manager with one assigned warehouse
  it('Scenario 1: Manager with one assigned warehouse', async () => {
    const wh1 = await createWarehouse('WH-ONE-01', 'Facility One');
    const wh2 = await createWarehouse('WH-ONE-02', 'Facility Two');

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

    // Assign WH-ONE-01 only
    await request(app)
      .post(`/api/v1/users/${manager.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: wh1.id });

    // Manager lists warehouses: must receive exactly WH-ONE-01
    const listRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${manager.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(wh1.id);
    expect(listRes.body.data[0].code).toBe('WH-ONE-01');

    // Manager can access facility details for WH-ONE-01
    const getRes = await request(app)
      .get(`/api/v1/warehouses/${wh1.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(getRes.status).toBe(200);

    // Manager can access inventory for WH-ONE-01
    const invRes = await request(app)
      .get(`/api/v1/inventory/warehouse/${wh1.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(invRes.status).toBe(200);
  });

  // 2. Manager with multiple assigned warehouses
  it('Scenario 2: Manager with multiple assigned warehouses', async () => {
    const whA = await createWarehouse('WH-MULTI-A', 'Facility Multi A');
    const whB = await createWarehouse('WH-MULTI-B', 'Facility Multi B');
    const whC = await createWarehouse('WH-MULTI-C', 'Facility Multi C');
    const whUnassigned = await createWarehouse('WH-MULTI-X', 'Facility Unassigned');

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

    // Assign 3 warehouses (A, B, C)
    for (const wh of [whA, whB, whC]) {
      await request(app)
        .post(`/api/v1/users/${manager.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: wh.id });
    }

    // Manager lists warehouses: receives all 3 assigned warehouses
    const listRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${manager.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(3);
    const returnedIds = listRes.body.data.map((w: any) => w.id);
    expect(returnedIds).toContain(whA.id);
    expect(returnedIds).toContain(whB.id);
    expect(returnedIds).toContain(whC.id);
    expect(returnedIds).not.toContain(whUnassigned.id);
  });

  // 3. Manager with a large number of assigned warehouses (15+ facilities)
  it('Scenario 3: Manager with a large number of assigned warehouses (15+ facilities)', async () => {
    const totalFacilities = 16;
    const warehouseIds: string[] = [];

    for (let i = 1; i <= totalFacilities; i++) {
      const code = `WH-BULK-${String(i).padStart(2, '0')}`;
      const wh = await createWarehouse(code, `Bulk Logistics Hub ${i}`);
      warehouseIds.push(wh.id);
    }

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

    // Assign all 16 warehouses to manager
    for (const whId of warehouseIds) {
      await request(app)
        .post(`/api/v1/users/${manager.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: whId });
    }

    // Manager queries warehouses: must dynamically return all 16 without truncation
    const listRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${manager.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(totalFacilities);

    const receivedIds = listRes.body.data.map((w: any) => w.id);
    for (const id of warehouseIds) {
      expect(receivedIds).toContain(id);
    }
  });

  // 4. Staff with multiple assigned warehouses
  it('Scenario 4: Staff with multiple assigned warehouses', async () => {
    const wh1 = await createWarehouse('WH-STAFF-01', 'Staff Hub 1');
    const wh2 = await createWarehouse('WH-STAFF-02', 'Staff Hub 2');
    const whOther = await createWarehouse('WH-STAFF-03', 'Other Hub');

    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);

    // Assign staff to WH-STAFF-01 and WH-STAFF-02
    await request(app)
      .post(`/api/v1/users/${staff.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: wh1.id });

    await request(app)
      .post(`/api/v1/users/${staff.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: wh2.id });

    // Staff lists warehouses: receives exactly the 2 assigned
    const listRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${staff.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(2);
    const returnedIds = listRes.body.data.map((w: any) => w.id);
    expect(returnedIds).toContain(wh1.id);
    expect(returnedIds).toContain(wh2.id);
    expect(returnedIds).not.toContain(whOther.id);

    // Staff can restock on assigned warehouse
    const restockRes = await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({
        productId: testProductId,
        warehouseId: wh1.id,
        quantity: 50,
        notes: 'Staff replenishment',
      });
    expect(restockRes.status).toBe(200);
    expect(restockRes.body.data.quantityAvailable).toBe(50);
  });

  // 5. User with zero assignments
  it('Scenario 5: User with zero assignments receives empty list and graceful boundaries', async () => {
    await createWarehouse('WH-ZERO-01', 'Zero Test WH 1');
    await createWarehouse('WH-ZERO-02', 'Zero Test WH 2');

    const managerWithZero = await createTestUser(UserRole.WAREHOUSE_MANAGER);
    const staffWithZero = await createTestUser(UserRole.WAREHOUSE_STAFF);

    // Manager with 0 assignments
    const mgrList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${managerWithZero.token}`);
    expect(mgrList.status).toBe(200);
    expect(mgrList.body.data).toEqual([]);

    const mgrInv = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${managerWithZero.token}`);
    expect(mgrInv.status).toBe(200);
    expect(mgrInv.body.data).toEqual([]);

    // Staff with 0 assignments
    const staffList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${staffWithZero.token}`);
    expect(staffList.status).toBe(200);
    expect(staffList.body.data).toEqual([]);
  });

  // 6. Switching between assigned warehouses
  it('Scenario 6: Switching between assigned warehouses maintains isolated stock ledgers', async () => {
    const whAlpha = await createWarehouse('WH-SW-ALPHA', 'Switch Alpha');
    const whBeta = await createWarehouse('WH-SW-BETA', 'Switch Beta');

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

    await request(app)
      .post(`/api/v1/users/${manager.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whAlpha.id });

    await request(app)
      .post(`/api/v1/users/${manager.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whBeta.id });

    // Restock 100 units at Alpha
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        productId: testProductId,
        warehouseId: whAlpha.id,
        quantity: 100,
      });

    // Restock 250 units at Beta
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        productId: testProductId,
        warehouseId: whBeta.id,
        quantity: 250,
      });

    // Query Alpha
    const alphaInv = await request(app)
      .get(`/api/v1/inventory/warehouse/${whAlpha.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(alphaInv.status).toBe(200);
    expect(alphaInv.body.data[0].quantityOnHand).toBe(100);

    // Switch to Beta
    const betaInv = await request(app)
      .get(`/api/v1/inventory/warehouse/${whBeta.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(betaInv.status).toBe(200);
    expect(betaInv.body.data[0].quantityOnHand).toBe(250);
  });

  // 7. Attempting to access an unassigned warehouse
  it('Scenario 7: Attempting to access an unassigned warehouse is rejected with 403 Forbidden', async () => {
    const whAssigned = await createWarehouse('WH-ACC-OK', 'Assigned OK');
    const whForbidden = await createWarehouse('WH-ACC-NO', 'Forbidden WH');

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

    await request(app)
      .post(`/api/v1/users/${manager.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whAssigned.id });

    // 1. Direct facility access
    const getRes = await request(app)
      .get(`/api/v1/warehouses/${whForbidden.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(getRes.status).toBe(403);
    expect(getRes.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

    // 2. Direct inventory inspection
    const invRes = await request(app)
      .get(`/api/v1/inventory/warehouse/${whForbidden.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(invRes.status).toBe(403);

    // 3. Unauthorized restock attempt
    const restockRes = await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        productId: testProductId,
        warehouseId: whForbidden.id,
        quantity: 50,
      });
    expect(restockRes.status).toBe(403);
  });

  // 8. Revoking the currently selected warehouse
  it('Scenario 8: Revoking the currently selected warehouse immediately denies access', async () => {
    const whPrimary = await createWarehouse('WH-REV-01', 'Primary Facility');
    const whSecondary = await createWarehouse('WH-REV-02', 'Secondary Facility');

    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

    // Assign both facilities
    await request(app)
      .post(`/api/v1/users/${manager.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whPrimary.id });

    await request(app)
      .post(`/api/v1/users/${manager.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whSecondary.id });

    // Initial access to Primary succeeds
    const accessBefore = await request(app)
      .get(`/api/v1/warehouses/${whPrimary.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(accessBefore.status).toBe(200);

    // Admin revokes Primary assignment
    const revokeRes = await request(app)
      .delete(`/api/v1/users/${manager.user.id}/warehouses/${whPrimary.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revokeRes.status).toBe(200);

    // Subsequent call to Primary immediately returns 403 Forbidden
    const accessAfter = await request(app)
      .get(`/api/v1/warehouses/${whPrimary.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(accessAfter.status).toBe(403);

    // Manager can still seamlessly access remaining Secondary facility
    const secRes = await request(app)
      .get(`/api/v1/warehouses/${whSecondary.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(secRes.status).toBe(200);
  });

  // 9. Assignment changes appearing after data refresh
  it('Scenario 9: Assignment changes appear dynamically on data refresh without re-login', async () => {
    const whInit = await createWarehouse('WH-REF-01', 'Initial Facility');
    const whAdded = await createWarehouse('WH-REF-02', 'Newly Added Facility');

    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);

    // 1. Staff initially has 1 warehouse
    await request(app)
      .post(`/api/v1/users/${staff.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whInit.id });

    const firstList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(firstList.body.data).toHaveLength(1);
    expect(firstList.body.data[0].id).toBe(whInit.id);

    // 2. Admin provisions second warehouse to staff in the background
    await request(app)
      .post(`/api/v1/users/${staff.user.id}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: whAdded.id });

    // 3. Staff queries warehouses again (refresh) using same token: receives both facilities
    const refreshedList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${staff.token}`);
    expect(refreshedList.status).toBe(200);
    expect(refreshedList.body.data).toHaveLength(2);
    const ids = refreshedList.body.data.map((w: any) => w.id);
    expect(ids).toContain(whInit.id);
    expect(ids).toContain(whAdded.id);
  });

  // 10. ADMIN still seeing all warehouses
  it('Scenario 10: ADMIN retains organization-wide visibility across all facilities', async () => {
    const wh1 = await createWarehouse('WH-ADM-01', 'Admin Facility 1');
    const wh2 = await createWarehouse('WH-ADM-02', 'Admin Facility 2');
    const wh3 = await createWarehouse('WH-ADM-03', 'Admin Facility 3');

    // Admin lists warehouses: sees all facilities in the organization
    const listRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const ids = listRes.body.data.map((w: any) => w.id);
    expect(ids).toContain(wh1.id);
    expect(ids).toContain(wh2.id);
    expect(ids).toContain(wh3.id);

    // Admin can access any facility
    const getRes = await request(app)
      .get(`/api/v1/warehouses/${wh1.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
  });

  // 11. CUSTOMER being denied internal warehouse access
  it('Scenario 11: CUSTOMER is denied internal warehouse operations across all endpoints', async () => {
    const wh = await createWarehouse('WH-CUST-BLOCK', 'Internal Fulfillment WH');
    const customer = await createTestUser(UserRole.CUSTOMER);

    // 1. Warehouse list denied
    const listRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(listRes.status).toBe(403);

    // 2. Specific warehouse details denied
    const getRes = await request(app)
      .get(`/api/v1/warehouses/${wh.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(getRes.status).toBe(403);

    // 3. Internal inventory overview denied
    const invRes = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(invRes.status).toBe(403);

    // 4. Warehouse-specific inventory denied
    const whInvRes = await request(app)
      .get(`/api/v1/inventory/warehouse/${wh.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(whInvRes.status).toBe(403);

    // 5. Restock denied
    const restockRes = await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        productId: testProductId,
        warehouseId: wh.id,
        quantity: 50,
      });
    expect(restockRes.status).toBe(403);
  });

  // 12. Pagination verification
  it('Scenario 12: Backend pagination on products and users, and full list for warehouses', async () => {
    // 1. Verify product pagination
    const prodPage1 = await request(app)
      .get('/api/v1/products?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(prodPage1.status).toBe(200);
    expect(prodPage1.body.meta.pagination).toBeDefined();
    expect(prodPage1.body.meta.pagination.page).toBe(1);
    expect(prodPage1.body.meta.pagination.limit).toBe(1);
    expect(prodPage1.body.data).toHaveLength(1);

    // 2. Verify user management pagination
    const userPage = await request(app)
      .get('/api/v1/users?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(userPage.status).toBe(200);
    expect(userPage.body.meta.pagination).toBeDefined();
    expect(userPage.body.meta.pagination.page).toBe(1);
    expect(userPage.body.meta.pagination.limit).toBe(1);

    // 3. Verify warehouse listing returns complete accessible dataset
    await createWarehouse('WH-PAGE-01', 'Page Facility 1');
    await createWarehouse('WH-PAGE-02', 'Page Facility 2');
    const whList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(whList.status).toBe(200);
    expect(Array.isArray(whList.body.data)).toBe(true);
    expect(whList.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

