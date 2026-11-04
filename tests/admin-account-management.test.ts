import request from 'supertest';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { bootstrapInitialAdmin } from '../scripts/bootstrap-admin';
import { createAdditionalAdmin } from '../scripts/create-admin';

describe('Admin Account Management & Provisioning Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Initial Admin Bootstrap (scripts/bootstrap-admin.ts)', () => {
    it('should successfully bootstrap initial administrator when no admin exists', async () => {
      const result = await bootstrapInitialAdmin({
        name: 'Chief Admin',
        email: 'chief.admin@stockflow.dev',
        password: 'SecurePassword123!',
        interactive: false,
      });

      expect(result.success).toBe(true);
      expect(result.adminEmail).toBe('chief.admin@stockflow.dev');

      const admin = await prisma.user.findUnique({
        where: { email: 'chief.admin@stockflow.dev' },
      });
      expect(admin).not.toBeNull();
      expect(admin?.role).toBe(UserRole.ADMIN);
      expect(admin?.fullName).toBe('Chief Admin');

      // Verify bcrypt password hashing
      const isMatch = await bcrypt.compare('SecurePassword123!', admin!.passwordHash);
      expect(isMatch).toBe(true);
      expect(admin?.passwordHash).not.toBe('SecurePassword123!');

      // Verify audit record in outbox
      const auditEvent = await prisma.outboxEvent.findFirst({
        where: { aggregateId: admin!.id, eventType: 'ADMIN_ACCOUNT_BOOTSTRAPPED' },
      });
      expect(auditEvent).not.toBeNull();
      expect((auditEvent?.payload as any)?.adminEmail).toBe('chief.admin@stockflow.dev');
    });

    it('should refuse to create a second administrator if an admin already exists', async () => {
      // 1. First bootstrap succeeds
      const firstResult = await bootstrapInitialAdmin({
        name: 'Primary Admin',
        email: 'primary@stockflow.dev',
        password: 'Password123!',
        interactive: false,
      });
      expect(firstResult.success).toBe(true);

      // 2. Second bootstrap attempt fails safely
      const secondResult = await bootstrapInitialAdmin({
        name: 'Second Admin',
        email: 'second@stockflow.dev',
        password: 'AnotherPassword123!',
        interactive: false,
      });

      expect(secondResult.success).toBe(false);
      expect(secondResult.message).toContain('An administrator account already exists');

      // Verify second user was not created
      const secondUser = await prisma.user.findUnique({
        where: { email: 'second@stockflow.dev' },
      });
      expect(secondUser).toBeNull();

      const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
      expect(adminCount).toBe(1);
    });

    it('should refuse to overwrite or promote an existing customer account during bootstrap', async () => {
      // Create existing customer
      const existingCustomer = await prisma.user.create({
        data: {
          email: 'customer@example.com',
          fullName: 'Jane Doe',
          passwordHash: await bcrypt.hash('CustomerPass123!', 10),
          role: UserRole.CUSTOMER,
        },
      });

      const result = await bootstrapInitialAdmin({
        name: 'Jane Doe',
        email: 'customer@example.com',
        password: 'NewAdminPass123!',
        interactive: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists with role \'CUSTOMER\'');

      // Confirm user is unchanged
      const user = await prisma.user.findUnique({
        where: { id: existingCustomer.id },
      });
      expect(user?.role).toBe(UserRole.CUSTOMER);
      const isOriginalPassword = await bcrypt.compare('CustomerPass123!', user!.passwordHash);
      expect(isOriginalPassword).toBe(true);
    });

    it('should reject invalid credentials format (short password, bad email)', async () => {
      const badEmailResult = await bootstrapInitialAdmin({
        name: 'Valid Name',
        email: 'invalid-email',
        password: 'ValidPassword123!',
        interactive: false,
      });
      expect(badEmailResult.success).toBe(false);
      expect(badEmailResult.message).toContain('Invalid email address format');

      const shortPasswordResult = await bootstrapInitialAdmin({
        name: 'Valid Name',
        email: 'valid@stockflow.dev',
        password: 'short',
        interactive: false,
      });
      expect(shortPasswordResult.success).toBe(false);
      expect(shortPasswordResult.message).toContain('at least 8 characters long');
    });
  });

  describe('Additional Admin Creation (scripts/create-admin.ts)', () => {
    let existingAdmin: { id: string; email: string; passwordRaw: string };

    beforeEach(async () => {
      const passwordRaw = 'RootAdminPassword123!';
      const passwordHash = await bcrypt.hash(passwordRaw, 10);
      const admin = await prisma.user.create({
        data: {
          email: 'root.admin@stockflow.dev',
          fullName: 'Root Admin',
          passwordHash,
          role: UserRole.ADMIN,
        },
      });
      existingAdmin = { id: admin.id, email: admin.email, passwordRaw };
    });

    it('should successfully create additional admin when authorized by existing admin', async () => {
      const result = await createAdditionalAdmin({
        authorizerEmail: existingAdmin.email,
        authorizerPassword: existingAdmin.passwordRaw,
        name: 'Operations Admin',
        email: 'ops.admin@stockflow.dev',
        password: 'OpsPassword123!',
        interactive: false,
      });

      expect(result.success).toBe(true);
      expect(result.adminEmail).toBe('ops.admin@stockflow.dev');
      expect(result.authorizedBy).toBe(existingAdmin.email);

      const newAdmin = await prisma.user.findUnique({
        where: { email: 'ops.admin@stockflow.dev' },
      });
      expect(newAdmin).not.toBeNull();
      expect(newAdmin?.role).toBe(UserRole.ADMIN);
      expect(newAdmin?.fullName).toBe('Operations Admin');

      // Verify bcrypt password hashing
      const isMatch = await bcrypt.compare('OpsPassword123!', newAdmin!.passwordHash);
      expect(isMatch).toBe(true);

      // Verify audit record in outbox
      const auditEvent = await prisma.outboxEvent.findFirst({
        where: { aggregateId: newAdmin!.id, eventType: 'ADMIN_ACCOUNT_PROVISIONED' },
      });
      expect(auditEvent).not.toBeNull();
      const payload = auditEvent?.payload as any;
      expect(payload.newAdminEmail).toBe('ops.admin@stockflow.dev');
      expect(payload.authorizedByAdminId).toBe(existingAdmin.id);
      expect(payload.authorizedByAdminEmail).toBe(existingAdmin.email);
    });

    it('should reject creation if authorizer password is incorrect', async () => {
      const result = await createAdditionalAdmin({
        authorizerEmail: existingAdmin.email,
        authorizerPassword: 'WrongPassword!',
        name: 'Fraud Admin',
        email: 'fraud@stockflow.dev',
        password: 'Password123!',
        interactive: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Authorization failed: Invalid administrator credentials');

      const user = await prisma.user.findUnique({ where: { email: 'fraud@stockflow.dev' } });
      expect(user).toBeNull();
    });

    it('should reject creation if authorizer is not an ADMIN (e.g. CUSTOMER)', async () => {
      const customer = await prisma.user.create({
        data: {
          email: 'regular.customer@stockflow.dev',
          fullName: 'Regular Customer',
          passwordHash: await bcrypt.hash('CustPass123!', 10),
          role: UserRole.CUSTOMER,
        },
      });

      const result = await createAdditionalAdmin({
        authorizerEmail: customer.email,
        authorizerPassword: 'CustPass123!',
        name: 'Attempted Admin',
        email: 'attempted@stockflow.dev',
        password: 'Password123!',
        interactive: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not have ADMIN privileges');

      const user = await prisma.user.findUnique({ where: { email: 'attempted@stockflow.dev' } });
      expect(user).toBeNull();
    });

    it('should reject creation if target email is already taken by a customer or staff', async () => {
      await prisma.user.create({
        data: {
          email: 'existing.staff@stockflow.dev',
          fullName: 'Staff Member',
          passwordHash: await bcrypt.hash('StaffPass123!', 10),
          role: UserRole.WAREHOUSE_STAFF,
        },
      });

      const result = await createAdditionalAdmin({
        authorizerEmail: existingAdmin.email,
        authorizerPassword: existingAdmin.passwordRaw,
        name: 'Staff Member',
        email: 'existing.staff@stockflow.dev',
        password: 'NewAdminPass123!',
        interactive: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists (Role: WAREHOUSE_STAFF)');

      const staff = await prisma.user.findUnique({ where: { email: 'existing.staff@stockflow.dev' } });
      expect(staff?.role).toBe(UserRole.WAREHOUSE_STAFF);
    });
  });

  describe('Public Registration Security Verification', () => {
    it('SECURITY: should strictly ignore and refuse privileged ADMIN role during public registration', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'malicious.attempt@stockflow.dev',
          password: 'Password123!',
          fullName: 'Malicious Actor',
          role: 'ADMIN',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe(UserRole.CUSTOMER);

      const dbUser = await prisma.user.findUnique({
        where: { email: 'malicious.attempt@stockflow.dev' },
      });
      expect(dbUser?.role).toBe(UserRole.CUSTOMER);
    });
  });
});

