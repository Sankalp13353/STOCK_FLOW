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
});

