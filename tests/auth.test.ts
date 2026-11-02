import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Authentication & User Management API', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully with HTTP 201', async () => {
      const payload = {
        email: 'alice@example.com',
        password: 'Password123!',
        fullName: 'Alice Smith',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('alice@example.com');
      expect(res.body.data.user.fullName).toBe('Alice Smith');
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should prevent duplicate registration with HTTP 409 Conflict', async () => {
      const payload = {
        email: 'duplicate@example.com',
        password: 'Password123!',
        fullName: 'Original User',
      };

      await request(app).post('/api/v1/auth/register').send(payload);

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject invalid registration data with HTTP 400', async () => {
      const invalidPayload = {
        email: 'not-an-email',
        password: 'short',
        fullName: '',
      };

      const res = await request(app).post('/api/v1/auth/register').send(invalidPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('SECURITY: should strictly ignore and refuse privileged ADMIN role during public registration', async () => {
      const maliciousPayload = {
        email: 'attacker.admin@example.com',
        password: 'Password123!',
        fullName: 'Attacker Attempting Admin',
        role: 'ADMIN',
      };

      const res = await request(app).post('/api/v1/auth/register').send(maliciousPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Role must strictly be CUSTOMER regardless of what was in the request payload
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.role).not.toBe('ADMIN');
    });

    it('SECURITY: should strictly ignore and refuse privileged WAREHOUSE_STAFF role during public registration', async () => {
      const maliciousPayload = {
        email: 'attacker.staff@example.com',
        password: 'Password123!',
        fullName: 'Attacker Attempting Staff',
        role: 'WAREHOUSE_STAFF',
      };

      const res = await request(app).post('/api/v1/auth/register').send(maliciousPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.role).not.toBe('WAREHOUSE_STAFF');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        email: 'login.user@example.com',
        password: 'Password123!',
        fullName: 'Login User',
      });
    });

    it('should log in successfully with valid credentials returning HTTP 200 and JWT', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'login.user@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('login.user@example.com');
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject login with incorrect password returning HTTP 401', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'login.user@example.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject login for non-existent email returning HTTP 401', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return profile for authenticated user with valid token', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'me.user@example.com',
        password: 'Password123!',
        fullName: 'Me User',
      });
      const token = regRes.body.data.token;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('me.user@example.com');
      expect(res.body.data.fullName).toBe('Me User');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should reject request without authorization token with HTTP 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
    });

    it('should reject request with invalid JWT token with HTTP 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  describe('PATCH /api/v1/auth/users/:id/role (Administrative Role Assignment)', () => {
    it('should allow an authenticated ADMIN to update a user role', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const targetUser = await createTestUser(UserRole.CUSTOMER);

      const res = await request(app)
        .patch(`/api/v1/auth/users/${targetUser.user.id}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'WAREHOUSE_STAFF' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('WAREHOUSE_STAFF');
      expect(res.body.data.id).toBe(targetUser.user.id);
    });

    it('should reject non-admin users from updating roles with HTTP 403 Forbidden', async () => {
      const customer = await createTestUser(UserRole.CUSTOMER);
      const targetUser = await createTestUser(UserRole.CUSTOMER);

      const res = await request(app)
        .patch(`/api/v1/auth/users/${targetUser.user.id}/role`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated requests to update roles with HTTP 401 Unauthorized', async () => {
      const targetUser = await createTestUser(UserRole.CUSTOMER);

      const res = await request(app)
        .patch(`/api/v1/auth/users/${targetUser.user.id}/role`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
    });
  });
});

