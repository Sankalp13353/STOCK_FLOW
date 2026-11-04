import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('Warehouse Management API', () => {
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    await clearDatabase();
    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);
    adminToken = admin.token;
    customerToken = customer.token;
  });

  describe('POST /api/v1/warehouses', () => {
    it('should create warehouse successfully when requested by Admin', async () => {
      const payload = {
        code: 'WH-EAST-01',
        name: 'New York Fulfillment Center',
        address: '100 Distribution Way',
        city: 'New York',
        country: 'USA',
        isActive: true,
      };

      const res = await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('WH-EAST-01');
      expect(res.body.data.city).toBe('New York');
      expect(res.body.data.id).toBeDefined();
    });

    it('should prevent duplicate warehouse code with HTTP 409 Conflict', async () => {
      const payload = {
        code: 'WH-DUP-01',
        name: 'First Hub',
        address: '1st Hub Road',
        city: 'Chicago',
        country: 'USA',
      };

      await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      const res = await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject invalid warehouse input with HTTP 400 (missing city)', async () => {
      const invalidPayload = {
        code: 'WH-INVALID',
        name: 'Incomplete Hub',
        address: 'Short address',
        // missing city & country
      };

      const res = await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should forbid non-admin from creating warehouse with HTTP 403', async () => {
      const payload = {
        code: 'WH-FORBIDDEN',
        name: 'Unauthorized Hub',
        address: 'Secret Road',
        city: 'Austin',
        country: 'USA',
      };

      const res = await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/warehouses and GET /api/v1/warehouses/:id', () => {
    let createdWarehouseId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'WH-CENTRAL-01',
          name: 'Dallas Distribution Hub',
          address: '500 Logistics Blvd',
          city: 'Dallas',
          country: 'USA',
        });
      createdWarehouseId = res.body.data.id;
    });

    it('should retrieve list of all warehouses', async () => {
      const res = await request(app)
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should retrieve single warehouse by ID with HTTP 200', async () => {
      const res = await request(app)
        .get(`/api/v1/warehouses/${createdWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdWarehouseId);
      expect(res.body.data.code).toBe('WH-CENTRAL-01');
    });

    it('should return HTTP 404 when warehouse ID does not exist', async () => {
      const nonExistentUuid = 'b0000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/warehouses/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

