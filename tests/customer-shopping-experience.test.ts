import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';

describe('StockFlow — Customer Shopping Experience & Security Audit', () => {
  let adminToken: string;
  let customer1Token: string;
  let customer1User: any;
  let customer2Token: string;
  let customer2User: any;
  let warehouse: any;
  let activeProduct1: any;
  let activeProduct2: any;
  let inactiveProduct: any;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    const c1 = await createTestUser(UserRole.CUSTOMER);
    const c2 = await createTestUser(UserRole.CUSTOMER);

    adminToken = admin.token;
    customer1Token = c1.token;
    customer1User = c1.user;
    customer2Token = c2.token;
    customer2User = c2.user;

    // Create facility
    const whRes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-STOREFRONT-1',
        name: 'Storefront Central Hub',
        address: '500 Retail Boulevard',
        city: 'Chicago',
        country: 'USA',
      });
    warehouse = whRes.body.data;

    // Create active product 1 ($49.99 = 4999 cents)
    const p1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'STORE-PROD-01',
        name: 'Ergonomic Mechanical Keyboard',
        priceCents: 4999,
      });
    activeProduct1 = p1Res.body.data;

    // Create active product 2 ($89.50 = 8950 cents)
    const p2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'STORE-PROD-02',
        name: 'Ultra-Wide 4K Gaming Monitor',
        priceCents: 8950,
      });
    activeProduct2 = p2Res.body.data;

    // Create inactive product ($12.00 = 1200 cents)
    const inactRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'STORE-PROD-INACTIVE',
        name: 'Discontinued Desk Mat',
        priceCents: 1200,
      });
    inactiveProduct = inactRes.body.data;

    // Mark inactiveProduct as inactive in DB
    await prisma.product.update({
      where: { id: inactiveProduct.id },
      data: { isActive: false },
    });

    // Stock inventory for active products: 20 units each
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: activeProduct1.id,
        warehouseId: warehouse.id,
        quantity: 20,
      });

    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: activeProduct2.id,
        warehouseId: warehouse.id,
        quantity: 20,
      });
  });

  // 1. Product catalogue retrieval returns active products with correct schema
  it('1. Product catalogue retrieval returns active products with correct schema', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);

    const skus = res.body.data.map((p: any) => p.sku);
    expect(skus).toContain('STORE-PROD-01');
    expect(skus).toContain('STORE-PROD-02');
    expect(skus).not.toContain('STORE-PROD-INACTIVE');

    const first = res.body.data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('sku');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('priceCents');
    expect(first.isActive).toBe(true);
  });

  // 2. Inactive products are not visible in customer-facing catalogue or details
  it('2. Inactive products are not visible in customer-facing catalogue or details', async () => {
    // Listing hides inactive product
    const listRes = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${customer1Token}`);
    const foundInactiveInList = listRes.body.data.some((p: any) => p.id === inactiveProduct.id);
    expect(foundInactiveInList).toBe(false);

    // Direct detail endpoint returns 404 for customer
    const detailRes = await request(app)
      .get(`/api/v1/products/${inactiveProduct.id}`)
      .set('Authorization', `Bearer ${customer1Token}`);
    expect(detailRes.status).toBe(404);
    expect(detailRes.body.success).toBe(false);

    // But ADMIN can inspect inactive product details
    const adminDetailRes = await request(app)
      .get(`/api/v1/products/${inactiveProduct.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.data.isActive).toBe(false);
  });

  // 3. Product details inspection returns complete and accurate data
  it('3. Product details inspection returns complete and accurate data', async () => {
    const res = await request(app)
      .get(`/api/v1/products/${activeProduct1.id}`)
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(activeProduct1.id);
    expect(res.body.data.sku).toBe('STORE-PROD-01');
    expect(res.body.data.name).toBe('Ergonomic Mechanical Keyboard');
    expect(res.body.data.priceCents).toBe(4999);
    expect(res.body.data.isActive).toBe(true);
  });

  // 4. Cart item additions validate product existence and quantity (> 0, integer)
  it('4. Cart item additions validate product existence and quantity (> 0, integer)', async () => {
    // Quantity 0
    const zeroQtyRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [{ productId: activeProduct1.id, quantity: 0 }],
      });
    expect(zeroQtyRes.status).toBe(400);

    // Negative quantity
    const negQtyRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [{ productId: activeProduct1.id, quantity: -2 }],
      });
    expect(negQtyRes.status).toBe(400);

    // Non-integer quantity
    const floatQtyRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [{ productId: activeProduct1.id, quantity: 2.5 }],
      });
    expect(floatQtyRes.status).toBe(400);
  });

  // 5. Cart item removals update totals and items correctly
  it('5. Cart item removals update totals and items correctly', async () => {
    // Order with both products: 2 of prod1 ($49.99 * 2 = $99.98) and 1 of prod2 ($89.50) => $189.48
    const orderWithBoth = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [
          { productId: activeProduct1.id, quantity: 2 },
          { productId: activeProduct2.id, quantity: 1 },
        ],
      });
    expect(orderWithBoth.status).toBe(201);
    expect(orderWithBoth.body.data.totalAmountCents).toBe(4999 * 2 + 8950);
    expect(orderWithBoth.body.data.items.length).toBe(2);

    // If customer removes product 2 and places order with just product 1
    const orderWithProd1Only = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [{ productId: activeProduct1.id, quantity: 2 }],
      });
    expect(orderWithProd1Only.status).toBe(201);
    expect(orderWithProd1Only.body.data.totalAmountCents).toBe(4999 * 2);
    expect(orderWithProd1Only.body.data.items.length).toBe(1);
  });

  // 6. Order placement with valid items, quantities and shipping address succeeds
  it('6. Order placement with valid items, quantities and shipping address succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: 'John Doe\n555 Market Street\nSuite 400\nSan Francisco, CA 94105\nPhone: (415) 555-0199',
        items: [{ productId: activeProduct1.id, quantity: 3 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RESERVED');
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    expect(res.body.data.shippingAddress).toContain('John Doe');
    expect(res.body.data.totalAmountCents).toBe(4999 * 3);
  });

  // 7. Order placement with non-existent product IDs is rejected with appropriate error
  it('7. Order placement with non-existent product IDs is rejected with 404', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Fake Street, Nowhere, NY 10001',
        items: [{ productId: fakeUuid, quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 8. Order placement with prices tampered on client is calculated using authoritative backend prices
  it('8. Order placement ignores client price tampering and calculates authoritatively', async () => {
    // Client attempts to pass a tampered price of 1 cent ($0.01) in payload
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Security Blvd, Austin, TX 78701',
        items: [
          {
            productId: activeProduct1.id,
            quantity: 2,
            priceCents: 1, // Tampered price
            unitPriceCents: 1,
            totalCents: 2,
          } as any,
        ],
      });

    expect(res.status).toBe(201);
    // Backend strictly looked up DB price (4999 cents * 2 = 9998 cents), completely ignoring tampered 1 cent
    expect(res.body.data.totalAmountCents).toBe(4999 * 2);
    expect(res.body.data.items[0].unitPriceCents).toBe(4999);
    expect(res.body.data.items[0].subtotalCents).toBe(9998);
  });

  // 9. Order placement when quantity exceeds available stock is rejected (409 Conflict)
  it('9. Order placement when quantity exceeds available stock is rejected with 409 Conflict', async () => {
    // Warehouse has 20 units available; customer requests 50 units
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [{ productId: activeProduct1.id, quantity: 50 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('Insufficient stock');
  });

  // 10. Successful order placement creates active reservations with 15-minute expiry
  it('10. Successful order placement creates active reservations with 15-minute expiry', async () => {
    const beforeOrder = Date.now();
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '123 Test St, Boston, MA 02108',
        items: [{ productId: activeProduct1.id, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    const reservations = res.body.data.reservations;
    expect(reservations.length).toBe(1);
    expect(reservations[0].status).toBe('ACTIVE');

    const expiresAt = new Date(reservations[0].expiresAt).getTime();
    const expectedExpiry = beforeOrder + 15 * 60 * 1000;
    // Difference should be within a 15-second window
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(15000);
  });

  // 11. Customer order history endpoint returns only orders belonging to the authenticated customer
  it('11. Customer order history endpoint returns only orders belonging to the authenticated customer', async () => {
    // Customer 1 places order
    const o1Res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: 'Customer 1 Address',
        items: [{ productId: activeProduct1.id, quantity: 1 }],
      });
    const order1Id = o1Res.body.data.id;

    // Customer 2 places order
    const o2Res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer2Token}`)
      .send({
        shippingAddress: 'Customer 2 Address',
        items: [{ productId: activeProduct2.id, quantity: 1 }],
      });
    const order2Id = o2Res.body.data.id;

    // Customer 1 fetches my-orders
    const c1History = await request(app)
      .get('/api/v1/orders/my-orders')
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(c1History.status).toBe(200);
    const c1OrderIds = c1History.body.data.map((o: any) => o.id);
    expect(c1OrderIds).toContain(order1Id);
    expect(c1OrderIds).not.toContain(order2Id);

    // Customer 2 fetches my-orders
    const c2History = await request(app)
      .get('/api/v1/orders/my-orders')
      .set('Authorization', `Bearer ${customer2Token}`);

    expect(c2History.status).toBe(200);
    const c2OrderIds = c2History.body.data.map((o: any) => o.id);
    expect(c2OrderIds).toContain(order2Id);
    expect(c2OrderIds).not.toContain(order1Id);
  });

  // 12. Customer order detail endpoint permits customer to view own order, rejects viewing another customer's order (403 Forbidden)
  it('12. Customer order detail permits viewing own order, rejects another customer order (403 Forbidden)', async () => {
    const o1Res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: 'Customer 1 Address',
        items: [{ productId: activeProduct1.id, quantity: 1 }],
      });
    const order1Id = o1Res.body.data.id;

    // Customer 1 views own order: 200 OK
    const c1ViewRes = await request(app)
      .get(`/api/v1/orders/${order1Id}`)
      .set('Authorization', `Bearer ${customer1Token}`);
    expect(c1ViewRes.status).toBe(200);
    expect(c1ViewRes.body.data.id).toBe(order1Id);

    // Customer 2 attempts to view Customer 1's order: 403 Forbidden
    const c2ViewRes = await request(app)
      .get(`/api/v1/orders/${order1Id}`)
      .set('Authorization', `Bearer ${customer2Token}`);
    expect(c2ViewRes.status).toBe(403);
    expect(c2ViewRes.body.success).toBe(false);
  });

  // 13. Customer is prevented from accessing internal warehouse inventory aggregation (403 Forbidden)
  it('13. Customer is prevented from accessing internal warehouse inventory aggregation (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);

    // Customer also prevented from warehouse-specific inventory endpoint
    const whRes = await request(app)
      .get(`/api/v1/inventory/warehouse/${warehouse.id}`)
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(whRes.status).toBe(403);
    expect(whRes.body.success).toBe(false);
  });

  // 14. Customer is prevented from accessing restock endpoint (403 Forbidden)
  it('14. Customer is prevented from accessing restock endpoint (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        productId: activeProduct1.id,
        warehouseId: warehouse.id,
        quantity: 10,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 15. Payment simulation with outcome SUCCESS transitions order status to CONFIRMED, commits reservations
  it('15. Payment simulation with outcome SUCCESS transitions order status to CONFIRMED and commits reservations', async () => {
    // 1. Place order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '456 Express Way, Miami, FL 33101',
        items: [{ productId: activeProduct1.id, quantity: 2 }],
      });
    const orderId = orderRes.body.data.id;
    const totalAmountCents = orderRes.body.data.totalAmountCents;

    // 2. Process simulated payment
    const paymentRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        orderId,
        amountCents: totalAmountCents,
        simulateOutcome: 'SUCCESS',
      });

    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.success).toBe(true);
    expect(paymentRes.body.data.orderStatus).toBe('CONFIRMED');

    // 3. Inspect updated order details
    const orderDetailRes = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(orderDetailRes.status).toBe(200);
    expect(orderDetailRes.body.data.status).toBe('CONFIRMED');
    expect(orderDetailRes.body.data.inventoryReservations[0].status).toBe('COMMITTED');

    // 4. Verify inventory deduction: 20 total - 2 committed = 18 on hand, 0 reserved
    const inv = await prisma.inventory.findFirst({
      where: { productId: activeProduct1.id, warehouseId: warehouse.id },
    });
    expect(inv?.quantityOnHand).toBe(18);
    expect(inv?.quantityReserved).toBe(0);
  });

  // 16. Customer cancellation releases reserved inventory
  it('16. Customer cancellation releases reserved inventory and transitions order to CANCELLED', async () => {
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: '456 Express Way, Miami, FL 33101',
        items: [{ productId: activeProduct1.id, quantity: 3 }],
      });
    const orderId = orderRes.body.data.id;

    // Cancel order
    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ reason: 'Customer changed order details' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // Verify reservation released
    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { inventoryReservations: true },
    });
    expect(updatedOrder?.status).toBe('CANCELLED');
    expect(updatedOrder?.inventoryReservations[0].status).toBe('RELEASED');

    // Verify stock is restored
    const inv = await prisma.inventory.findFirst({
      where: { productId: activeProduct1.id, warehouseId: warehouse.id },
    });
    expect(inv?.quantityOnHand).toBe(20);
    expect(inv?.quantityReserved).toBe(0);
  });
});
