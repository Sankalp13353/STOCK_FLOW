import request from 'supertest';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { bootstrapInitialAdmin } from '../scripts/bootstrap-admin';

describe('StockFlow — Multi-Warehouse Roles, Assignments & Authorization (Parts 1-6)', () => {
  let adminToken: string;
  let adminUser: any;
  let warehouseAId: string;
  let warehouseBId: string;
  let warehouseCId: string;
  let testProductId: string;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    adminToken = admin.token;
    adminUser = admin.user;

    // Create a product for inventory restock tests
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'TEST-SKU-ROLES',
        name: 'Enterprise Network Switch',
        priceCents: 49900,
      });
    testProductId = prodRes.body.data.id;

    // Create 3 separate warehouses: A, B, and C
    const whResA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-ALPHA',
        name: 'Alpha Distribution Center',
        address: '100 Alpha Boulevard',
        city: 'Chicago',
        country: 'USA',
      });
    warehouseAId = whResA.body.data.id;

    const whResB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-BETA',
        name: 'Beta Logistics Hub',
        address: '200 Beta Parkway',
        city: 'Dallas',
        country: 'USA',
      });
    warehouseBId = whResB.body.data.id;

    const whResC = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-GAMMA',
        name: 'Gamma Fulfillment Facility',
        address: '300 Gamma Avenue',
        city: 'Seattle',
        country: 'USA',
      });
    warehouseCId = whResC.body.data.id;
  });

  describe('Part 1 & 6.1-6.2: Public Registration Privileged Role Escalation Prevention', () => {
    it('1. Public registration cannot create ADMIN', async () => {
      const payload = {
        email: `hacker-admin-${Date.now()}@stockflow.dev`,
        password: 'Password123!',
        fullName: 'Unauthorized Admin Attempt',
        role: 'ADMIN',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);

      const dbUser = await prisma.user.findUnique({ where: { email: payload.email } });
      expect(dbUser?.role).toBe(UserRole.CUSTOMER);
    });

    it('2. Public registration cannot create WAREHOUSE_MANAGER', async () => {
      const payload = {
        email: `hacker-manager-${Date.now()}@stockflow.dev`,
        password: 'Password123!',
        fullName: 'Unauthorized Manager Attempt',
        role: 'WAREHOUSE_MANAGER',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);

      const dbUser = await prisma.user.findUnique({ where: { email: payload.email } });
      expect(dbUser?.role).toBe(UserRole.CUSTOMER);
    });
  });

  describe('Part 4 & 6.3: ADMIN Organization-Wide Access', () => {
    it('3. ADMIN can access all warehouses', async () => {
      // List all warehouses
      const listRes = await request(app)
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      const warehouseIds = listRes.body.data.map((w: any) => w.id);
      expect(warehouseIds).toContain(warehouseAId);
      expect(warehouseIds).toContain(warehouseBId);
      expect(warehouseIds).toContain(warehouseCId);

      // Access single warehouse details
      const getResA = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getResA.status).toBe(200);

      const getResB = await request(app)
        .get(`/api/v1/warehouses/${warehouseBId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getResB.status).toBe(200);

      const getResC = await request(app)
        .get(`/api/v1/warehouses/${warehouseCId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getResC.status).toBe(200);

      // Inspect inventory for all warehouses
      const invResA = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(invResA.status).toBe(200);

      const invResC = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseCId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(invResC.status).toBe(200);
    });
  });

  describe('Part 4 & 6.4-6.5: WAREHOUSE_MANAGER Multi-Warehouse Assignment & Boundaries', () => {
    let managerToken: string;
    let managerUser: any;

    beforeEach(async () => {
      const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);
      managerToken = manager.token;
      managerUser = manager.user;

      // Assign manager to Warehouse A and Warehouse B (NOT C)
      const assignResA = await request(app)
        .post(`/api/v1/users/${managerUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId, role: UserRole.WAREHOUSE_MANAGER });
      expect(assignResA.status).toBe(201);

      const assignResB = await request(app)
        .post(`/api/v1/users/${managerUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseBId, role: UserRole.WAREHOUSE_MANAGER });
      expect(assignResB.status).toBe(201);
    });

    it('4. Manager can access multiple assigned warehouses', async () => {
      // List warehouses: manager sees only assigned A and B
      const listRes = await request(app)
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(listRes.status).toBe(200);
      const returnedIds = listRes.body.data.map((w: any) => w.id);
      expect(returnedIds).toContain(warehouseAId);
      expect(returnedIds).toContain(warehouseBId);
      expect(returnedIds).not.toContain(warehouseCId);

      // Get specific details for A and B
      const getResA = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(getResA.status).toBe(200);

      const getResB = await request(app)
        .get(`/api/v1/warehouses/${warehouseBId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(getResB.status).toBe(200);

      // Inspect inventory at assigned warehouses
      const invResA = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(invResA.status).toBe(200);

      // Restock assigned warehouse A
      const restockResA = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: testProductId,
          warehouseId: warehouseAId,
          quantity: 25,
        });
      expect(restockResA.status).toBe(200);
    });

    it('5. Manager cannot access unassigned warehouses', async () => {
      // Facility details for C should be rejected with 403 Forbidden
      const getResC = await request(app)
        .get(`/api/v1/warehouses/${warehouseCId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(getResC.status).toBe(403);
      expect(getResC.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

      // Inventory inspection for C should be rejected with 403 Forbidden
      const invResC = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseCId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(invResC.status).toBe(403);
      expect(invResC.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

      // Restock attempt at unassigned C should be rejected with 403 Forbidden
      const restockResC = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: testProductId,
          warehouseId: warehouseCId,
          quantity: 50,
        });
      expect(restockResC.status).toBe(403);
      expect(restockResC.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');
    });
  });

  describe('Part 4 & 6.6: WAREHOUSE_STAFF Access Restrictions', () => {
    let staffToken: string;
    let staffUser: any;

    beforeEach(async () => {
      const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
      staffToken = staff.token;
      staffUser = staff.user;

      // Assign staff only to Warehouse A
      await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId, role: UserRole.WAREHOUSE_STAFF });
    });

    it('6. Staff cannot access unassigned warehouses', async () => {
      // Staff can restock assigned Warehouse A
      const restockA = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: testProductId,
          warehouseId: warehouseAId,
          quantity: 10,
        });
      expect(restockA.status).toBe(200);

      // Staff cannot restock unassigned Warehouse B
      const restockB = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: testProductId,
          warehouseId: warehouseBId,
          quantity: 10,
        });
      expect(restockB.status).toBe(403);
      expect(restockB.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

      // Staff cannot view unassigned Warehouse B facility or stock
      const getB = await request(app)
        .get(`/api/v1/warehouses/${warehouseBId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(getB.status).toBe(403);

      const invB = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseBId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(invB.status).toBe(403);
    });
  });

  describe('Part 4 & 6.7: CUSTOMER Access Boundaries', () => {
    let customerToken: string;

    beforeEach(async () => {
      const customer = await createTestUser(UserRole.CUSTOMER);
      customerToken = customer.token;
    });

    it('7. Customer cannot access internal warehouse endpoints', async () => {
      // Customer cannot list warehouse facilities
      const listWh = await request(app)
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(listWh.status).toBe(403);

      // Customer cannot get warehouse detail
      const getWh = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(getWh.status).toBe(403);

      // Customer cannot create warehouse
      const createWh = await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'WH-HACK',
          name: 'Hacked Facility',
          address: '123 Fake Street',
          city: 'Nowhere',
          country: 'USA',
        });
      expect(createWh.status).toBe(403);

      // Customer cannot access internal warehouse inventory
      const whInv = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(whInv.status).toBe(403);

      // Customer cannot restock stock
      const restock = await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: testProductId,
          warehouseId: warehouseAId,
          quantity: 10,
        });
      expect(restock.status).toBe(403);
    });
  });

  describe('Part 5 & 6.8: Administrative Privilege Escalation Prevention', () => {
    it('8. Users cannot assign themselves ADMIN privileges', async () => {
      const customer = await createTestUser(UserRole.CUSTOMER);
      const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
      const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);

      // Customer trying to self-promote to ADMIN
      const custEscalate = await request(app)
        .patch(`/api/v1/users/${customer.user.id}/role`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ role: UserRole.ADMIN });
      expect(custEscalate.status).toBe(403);

      // Staff trying to self-promote to ADMIN
      const staffEscalate = await request(app)
        .patch(`/api/v1/users/${staff.user.id}/role`)
        .set('Authorization', `Bearer ${staff.token}`)
        .send({ role: UserRole.ADMIN });
      expect(staffEscalate.status).toBe(403);

      // Manager trying to self-promote to ADMIN
      const mgrEscalate = await request(app)
        .patch(`/api/v1/users/${manager.user.id}/role`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ role: UserRole.ADMIN });
      expect(mgrEscalate.status).toBe(403);

      // Manager trying to promote another customer to ADMIN
      const mgrPromote = await request(app)
        .patch(`/api/v1/users/${customer.user.id}/role`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ role: UserRole.ADMIN });
      expect(mgrPromote.status).toBe(403);

      // Verify in DB that customer role remained CUSTOMER
      const dbCust = await prisma.user.findUnique({ where: { id: customer.user.id } });
      expect(dbCust?.role).toBe(UserRole.CUSTOMER);
    });
  });

  describe('Part 3, 5 & 6.9-6.10: Assignment Lifecycle & Immediate Revocation', () => {
    it('9. Duplicate warehouse assignments are prevented', async () => {
      const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);

      // First assignment succeeds
      const firstAssign = await request(app)
        .post(`/api/v1/users/${staff.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });
      expect(firstAssign.status).toBe(201);

      // Duplicate assignment is rejected with 409 Conflict
      const dupAssign = await request(app)
        .post(`/api/v1/users/${staff.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });
      expect(dupAssign.status).toBe(409);
      expect(dupAssign.body.error.code).toBe('DUPLICATE_WAREHOUSE_ASSIGNMENT');
    });

    it('10. Removing an assignment immediately revokes access', async () => {
      const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);

      // 1. Assign staff to Warehouse A
      await request(app)
        .post(`/api/v1/users/${staff.user.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      // 2. Staff can access Warehouse A
      const accessBefore = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(accessBefore.status).toBe(200);

      // 3. Admin removes warehouse assignment
      const removeRes = await request(app)
        .delete(`/api/v1/users/${staff.user.id}/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(removeRes.status).toBe(200);

      // 4. Access is immediately revoked (403 Forbidden)
      const accessAfter = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(accessAfter.status).toBe(403);
      expect(accessAfter.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

      const invAfter = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${staff.token}`);
      expect(invAfter.status).toBe(403);
    });
  });

  describe('Part 1: Initial Administrator Bootstrap Script', () => {
    it('should provision initial admin when no admin exists, and prevent subsequent bootstrap attempts', async () => {
      // Clear all existing users completely
      await clearDatabase();

      process.env.ADMIN_NAME = 'Primary Bootstrap Administrator';
      process.env.ADMIN_EMAIL = 'initial.admin@stockflow.dev';
      process.env.ADMIN_PASSWORD = 'SuperSecureBootstrapPassword2026!';

      // 1. First execution provisions the primary admin
      const result1 = await bootstrapInitialAdmin();
      expect(result1.success).toBe(true);
      expect(result1.adminEmail).toBe('initial.admin@stockflow.dev');

      const created = await prisma.user.findUnique({
        where: { email: 'initial.admin@stockflow.dev' },
      });
      expect(created).not.toBeNull();
      expect(created?.role).toBe(UserRole.ADMIN);
      expect(created?.fullName).toBe('Primary Bootstrap Administrator');

      // Verify bcrypt password hashing: plaintext password is not stored
      expect(created?.passwordHash).not.toBe('SuperSecureBootstrapPassword2026!');
      const passwordMatches = await bcrypt.compare(
        'SuperSecureBootstrapPassword2026!',
        created!.passwordHash
      );
      expect(passwordMatches).toBe(true);

      // 2. Second execution fails safely: does not silently create another administrator
      process.env.ADMIN_NAME = 'Second Admin Attempt';
      process.env.ADMIN_EMAIL = 'second.admin@stockflow.dev';
      process.env.ADMIN_PASSWORD = 'AnotherPassword123!';

      const result2 = await bootstrapInitialAdmin();
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('An administrator account already exists');

      // Verify second user was NOT created in DB
      const secondUser = await prisma.user.findUnique({
        where: { email: 'second.admin@stockflow.dev' },
      });
      expect(secondUser).toBeNull();
    });
  });
});

