import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Phase 4 — User Administration & Warehouse Assignment Management', () => {
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
  });

  describe('1. User Listing & Inspection', () => {
    it('1. Admin can list users with pagination and search, without exposing password hashes', async () => {
      const res = await request(app)
        .get('/api/v1/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(4);
      expect(res.body.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        totalRecords: 4,
        totalPages: 1,
      });

      // Verify no password hashes or sensitive fields exposed
      for (const u of res.body.data) {
        expect(u.passwordHash).toBeUndefined();
        expect(u.password).toBeUndefined();
        expect(u.id).toBeDefined();
        expect(u.email).toBeDefined();
        expect(u.fullName).toBeDefined();
        expect(u.role).toBeDefined();
        expect(u.isActive).toBe(true);
      }
    });

    it('filters users by role and search string', async () => {
      // Filter by role
      const roleRes = await request(app)
        .get('/api/v1/users?role=WAREHOUSE_MANAGER')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(roleRes.status).toBe(200);
      expect(roleRes.body.data.length).toBe(1);
      expect(roleRes.body.data[0].email).toBe(managerUser.email);

      // Search by partial email
      const searchRes = await request(app)
        .get(`/api/v1/users?search=${adminUser.email}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.length).toBe(1);
      expect(searchRes.body.data[0].id).toBe(adminUser.id);
    });
  });

  describe('2. User Creation & Role Provisioning', () => {
    it('2. Admin can create warehouse managers and staff', async () => {
      // 1. Create a Manager with initial warehouse assignment
      const createManagerRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Sarah Connor',
          email: 'sarah.connor@stockflow.dev',
          password: 'Password123!',
          role: 'WAREHOUSE_MANAGER',
          warehouseIds: [warehouseAId],
        });

      expect(createManagerRes.status).toBe(201);
      expect(createManagerRes.body.success).toBe(true);
      expect(createManagerRes.body.data.role).toBe('WAREHOUSE_MANAGER');
      expect(createManagerRes.body.data.fullName).toBe('Sarah Connor');
      expect(createManagerRes.body.data.warehouseAssignments.length).toBe(1);
      expect(createManagerRes.body.data.warehouseAssignments[0].warehouseId).toBe(warehouseAId);

      // 2. Create Staff member
      const createStaffRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'John Reese',
          email: 'john.reese@stockflow.dev',
          password: 'Password123!',
          role: 'WAREHOUSE_STAFF',
        });

      expect(createStaffRes.status).toBe(201);
      expect(createStaffRes.body.data.role).toBe('WAREHOUSE_STAFF');
    });

    it('rejects attempt to create ADMIN via standard user form', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Rogue Admin',
          email: 'rogue.admin@stockflow.dev',
          password: 'Password123!',
          role: 'ADMIN',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ADMIN_CREATION_RESTRICTED');
    });

    it('rejects duplicate email registration', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Duplicate Admin',
          email: adminUser.email,
          password: 'Password123!',
          role: 'WAREHOUSE_STAFF',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('3. User Detail Updates & Safeguards', () => {
    it('3. Admin can update permitted user fields', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${staffUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Updated Staff Name',
          email: 'new.staff.email@stockflow.dev',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Updated Staff Name');
      expect(res.body.data.email).toBe('new.staff.email@stockflow.dev');
    });

    it('4. Admin can deactivate and reactivate users', async () => {
      // Deactivate
      const deactRes = await request(app)
        .patch(`/api/v1/users/${staffUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.data.isActive).toBe(false);

      // Verify DB record
      const dbUser = await prisma.user.findUnique({ where: { id: staffUser.id } });
      expect(dbUser?.isActive).toBe(false);

      // Reactivate
      const reactRes = await request(app)
        .patch(`/api/v1/users/${staffUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(reactRes.status).toBe(200);
      expect(reactRes.body.data.isActive).toBe(true);
    });
  });

  describe('4. Warehouse Assignment Operations', () => {
    it('5. Admin can assign multiple warehouses without arbitrary count limits', async () => {
      // Assign staff to Warehouse A
      const assignARes = await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      expect(assignARes.status).toBe(201);

      // Assign staff to Warehouse B
      const assignBRes = await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseBId });

      expect(assignBRes.status).toBe(201);

      // Verify both assignments exist
      const userRes = await request(app)
        .get(`/api/v1/users/${staffUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(userRes.body.data.warehouseAssignments.length).toBe(2);
    });

    it('6. Duplicate assignments are prevented with HTTP 409 Conflict', async () => {
      // First assignment
      await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      // Duplicate attempt
      const dupRes = await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('DUPLICATE_WAREHOUSE_ASSIGNMENT');
    });

    it('7. Assignment removal takes effect immediately', async () => {
      // Assign staff to Warehouse A
      await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      // Staff can access Warehouse A
      const accessBefore = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(accessBefore.status).toBe(200);

      // Remove assignment
      const removeRes = await request(app)
        .delete(`/api/v1/users/${staffUser.id}/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(removeRes.status).toBe(200);

      // Immediate subsequent call must be forbidden
      const accessAfter = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(accessAfter.status).toBe(403);
    });

    it('8. Managers cannot access unassigned warehouses', async () => {
      // Assign manager to Warehouse A only
      await request(app)
        .post(`/api/v1/users/${managerUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      // Access to Warehouse A succeeds
      const whARes = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(whARes.status).toBe(200);

      // Access to Warehouse B fails with 403
      const whBRes = await request(app)
        .get(`/api/v1/warehouses/${warehouseBId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(whBRes.status).toBe(403);
    });
  });

  describe('5. RBAC & Security Boundary Enforcement', () => {
    it('9. Staff cannot perform Admin user administration operations', async () => {
      const listRes = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(listRes.status).toBe(403);

      const createRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          fullName: 'Staff Created User',
          email: 'staff.created@stockflow.dev',
          password: 'Password123!',
          role: 'WAREHOUSE_STAFF',
        });
      expect(createRes.status).toBe(403);
    });

    it('10. Customers cannot access administration endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('11. Last active Admin cannot be deactivated or demoted', async () => {
      // Only 1 admin currently exists (adminUser)
      // Attempt deactivation
      const deactRes = await request(app)
        .patch(`/api/v1/users/${adminUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(deactRes.status).toBe(400);
      expect(deactRes.body.error.code).toMatch(/LAST_ADMIN_PROTECTION|SELF_LOCKOUT_PREVENTION/);

      // Attempt demotion
      const demoteRes = await request(app)
        .patch(`/api/v1/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'CUSTOMER' });

      expect(demoteRes.status).toBe(400);
      expect(demoteRes.body.error.code).toMatch(/LAST_ADMIN_PROTECTION|SELF_LOCKOUT_PREVENTION/);
    });

    it('12. Users cannot bypass role restrictions', async () => {
      // 1. Public registration always creates CUSTOMER role even if another role is passed
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Hacker User',
          email: 'hacker@evil.com',
          password: 'Password123!',
          role: 'ADMIN', // Ignored or mapped to customer
        });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.data.user.role).toBe('CUSTOMER');

      // 2. Direct role elevation to ADMIN via update is rejected
      const elevateRes = await request(app)
        .patch(`/api/v1/users/${customerUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' });

      expect(elevateRes.status).toBe(400);
      expect(elevateRes.body.error.code).toBe('ELEVATION_RESTRICTED');
    });

    it('13. Deactivated users cannot access protected APIs', async () => {
      // Customer has a valid unexpired token
      const checkActive = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(checkActive.status).toBe(200);

      // Admin deactivates the customer
      await request(app)
        .patch(`/api/v1/users/${customerUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      // Immediate subsequent API call using the existing token must be rejected with 401
      const checkDeactivated = await request(app)
        .get('/api/v1/orders/my-orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(checkDeactivated.status).toBe(401);
      expect(checkDeactivated.body.error.code).toBe('ACCOUNT_DEACTIVATED');

      // Attempt to log in again with password fails with 401
      const loginAttempt = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: customerUser.email,
          password: 'Password123!',
        });

      expect(loginAttempt.status).toBe(401);
      expect(loginAttempt.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });

    it('14. Warehouse details correctly show assigned teams', async () => {
      // Assign manager to Warehouse A
      await request(app)
        .post(`/api/v1/users/${managerUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      // Assign staff to Warehouse A
      await request(app)
        .post(`/api/v1/users/${staffUser.id}/warehouses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ warehouseId: warehouseAId });

      // 1. Query warehouse detail
      const whRes = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(whRes.status).toBe(200);
      expect(whRes.body.data.managers.length).toBe(1);
      expect(whRes.body.data.managers[0].id).toBe(managerUser.id);
      expect(whRes.body.data.staff.length).toBe(1);
      expect(whRes.body.data.staff[0].id).toBe(staffUser.id);

      // 2. Query dedicated /users endpoint on warehouse
      const usersRes = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}/users`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(usersRes.status).toBe(200);
      expect(usersRes.body.data.totalAssigned).toBe(2);
      expect(usersRes.body.data.managers[0].email).toBe(managerUser.email);
      expect(usersRes.body.data.staff[0].email).toBe(staffUser.email);
    });
  });
});

