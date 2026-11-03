import request from 'supertest';
import { app } from '../src/app';

describe('Health Check API', () => {
  it('GET /health should return HTTP 200 with UP status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.data.service).toBe('stockflow-backend');
    expect(res.body.meta.timestamp).toBeDefined();
  });

  it('GET /api/v1/health should return HTTP 200 with UP status', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
  });

  it('GET /api/v1/unknown-endpoint should return HTTP 404', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /health should return HTTP 503 with sanitized status when database fails', async () => {
    const prismaModule = await import('../src/database/prisma');
    const spy = jest.spyOn(prismaModule, 'checkDatabaseConnection').mockResolvedValueOnce({
      healthy: false,
      error: 'postgresql://secret_user:super_secret_pw@internal.db:5432/db connection refused',
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('DEGRADED');
    expect(res.body.data.database.status).toBe('DOWN');
    expect(res.body.data.database.message).toBe('Database connection unavailable');
    // Ensure sensitive details and credentials are not leaked in the public response
    expect(JSON.stringify(res.body)).not.toContain('super_secret_pw');
    expect(JSON.stringify(res.body)).not.toContain('secret_user');

    spy.mockRestore();
  });
});

