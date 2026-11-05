import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/database/prisma';

async function runSmokeTests() {
  console.log('=== STARTING APPLICATION SMOKE TESTS (READ-ONLY) ===');
  const app = createApp();

  // 1. Health check
  console.log('\n1. Testing Health Check (GET /health)...');
  const healthRes = await request(app).get('/health');
  console.log(`Status: ${healthRes.status}, Body:`, healthRes.body);
  if (healthRes.status !== 200 || healthRes.body.data?.database?.status !== 'UP') {
    throw new Error('Health check failed!');
  }

  // Find Admin and Customer users from DB
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const customerUser = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });

  if (!adminUser || !customerUser) {
    throw new Error('Missing admin or customer in Neon!');
  }

  console.log(`Found Admin: ID ${adminUser.id}, Role ${adminUser.role}, isActive: ${adminUser.isActive}`);
  console.log(`Found Customer: ID ${customerUser.id}, Role ${customerUser.role}, isActive: ${customerUser.isActive}`);

  const adminToken = jwt.sign(
    { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const customerToken = jwt.sign(
    { userId: customerUser.id, email: customerUser.email, role: customerUser.role },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // 2. Product Listing (Public)
  console.log('\n2. Testing Product Listing (GET /api/v1/products)...');
  const prodRes = await request(app).get('/api/v1/products');
  console.log(`Status: ${prodRes.status}, Count: ${prodRes.body.data?.products?.length || prodRes.body.data?.length}`);
  if (prodRes.status !== 200) throw new Error('Product listing failed');

  // 3. Warehouse Listing (Authenticated Admin)
  console.log('\n3. Testing Warehouse Listing (GET /api/v1/warehouses)...');
  const whRes = await request(app)
    .get('/api/v1/warehouses')
    .set('Authorization', `Bearer ${adminToken}`);
  console.log(`Status: ${whRes.status}, Count: ${whRes.body.data?.warehouses?.length || whRes.body.data?.length}`);
  if (whRes.status !== 200) throw new Error('Warehouse listing failed');

  // 4. Inventory Metrics (Authenticated Admin)
  console.log('\n4. Testing Inventory Metrics (GET /api/v1/inventory/metrics)...');
  const metricsRes = await request(app)
    .get('/api/v1/inventory/metrics')
    .set('Authorization', `Bearer ${adminToken}`);
  console.log(`Status: ${metricsRes.status}, Data:`, metricsRes.body.data);
  if (metricsRes.status !== 200) throw new Error('Inventory metrics failed');

  // 5. Minimum Stock Thresholds API (Newly migrated table)
  console.log('\n5. Testing Thresholds API (GET /api/v1/inventory/thresholds)...');
  const threshRes = await request(app)
    .get('/api/v1/inventory/thresholds')
    .set('Authorization', `Bearer ${adminToken}`);
  console.log(`Status: ${threshRes.status}, Thresholds count: ${threshRes.body.data?.thresholds?.length || threshRes.body.data?.length || 0}`);
  if (threshRes.status !== 200) throw new Error('Thresholds API failed');

  // 6. Tickets API (Newly migrated table)
  console.log('\n6. Testing Tickets API (GET /api/v1/tickets)...');
  const ticketRes = await request(app)
    .get('/api/v1/tickets')
    .set('Authorization', `Bearer ${adminToken}`);
  console.log(`Status: ${ticketRes.status}, Tickets count: ${ticketRes.body.data?.tickets?.length || ticketRes.body.data?.length || 0}`);
  if (ticketRes.status !== 200) throw new Error('Tickets API failed');

  // 7. Orders Listing (Authenticated Admin)
  console.log('\n7. Testing Orders API (GET /api/v1/orders)...');
  const ordersRes = await request(app)
    .get('/api/v1/orders')
    .set('Authorization', `Bearer ${adminToken}`);
  console.log(`Status: ${ordersRes.status}, Orders count: ${ordersRes.body.data?.orders?.length || ordersRes.body.data?.length || 0}`);
  if (ordersRes.status !== 200) throw new Error('Orders API failed');

  // 8. Customer Order Listing (GET /api/v1/orders/my-orders)
  console.log('\n8. Testing Customer Orders (GET /api/v1/orders/my-orders)...');
  const myOrdersRes = await request(app)
    .get('/api/v1/orders/my-orders')
    .set('Authorization', `Bearer ${customerToken}`);
  console.log(`Status: ${myOrdersRes.status}, Customer Orders count: ${myOrdersRes.body.data?.orders?.length || myOrdersRes.body.data?.length || 0}`);
  if (myOrdersRes.status !== 200) throw new Error('Customer orders API failed');

  // 9. RBAC Boundary Check: Customer cannot access internal inventory metrics (Should be 403 Forbidden)
  console.log('\n9. Testing RBAC Boundary (Customer probing GET /api/v1/inventory/metrics)...');
  const rbacRes = await request(app)
    .get('/api/v1/inventory/metrics')
    .set('Authorization', `Bearer ${customerToken}`);
  console.log(`Status: ${rbacRes.status} (Expected 403)`);
  if (rbacRes.status !== 403) throw new Error('RBAC boundary check failed');

  console.log('\n✅ ALL APPLICATION SMOKE TESTS PASSED CLEANLY (100% SUCCESS)!');
  await prisma.$disconnect();
}

runSmokeTests().catch((err) => {
  console.error('Smoke tests error:', err);
  process.exit(1);
});
