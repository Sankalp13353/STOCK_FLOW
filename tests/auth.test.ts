import request from 'supertest';
import { app } from '../src/app';
import { clearDatabase } from './setup';

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
});

