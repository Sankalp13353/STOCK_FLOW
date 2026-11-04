import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { prisma } from '../src/database/prisma';
import { reservationService } from '../src/modules/reservations/reservation.service';

describe('Reservation Expiry Sweeper API', () => {
  let adminToken: string;
  let customerToken: string;
  let productId: string;
  let warehouseId: string;
  let expiredOrderId: string;
  let activeOrderId: string;

  beforeEach(async () => {
    await clearDatabase();
    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);
    adminToken = admin.token;
    customerToken = customer.token;

    // Create warehouse & product
    const wh = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-EXP-01',
        name: 'Expiry Hub',
        address: '100 Time Way',
        city: 'Phoenix',
        country: 'USA',
      });
    warehouseId = wh.body.data.id;

    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-EXP-ITEM',
        name: 'Limited Edition Sneakers',
        priceCents: 15000,
      });
    productId = prod.body.data.id;

    // Restock 10 units
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 10 });

    // 1. Create order 1 (to be expired)
    const res1 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: 'Expired Order Destination',
        items: [{ productId, warehouseId, quantity: 3 }],
      });
    expiredOrderId = res1.body.data.id;

    // Artificially age the reservation timestamp into the past (e.g. 20 minutes ago)
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    await prisma.inventoryReservation.updateMany({
      where: { orderId: expiredOrderId },
      data: { expiresAt: twentyMinsAgo },
    });

    // 2. Create order 2 (still active with future expiry)
    const res2 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: 'Active Order Destination',
        items: [{ productId, warehouseId, quantity: 2 }],
      });
    activeOrderId = res2.body.data.id;
  });

  it('should expire only stale reservations and restore available inventory', async () => {
    // Before sweep: totalReserved = 3 + 2 = 5, available = 5
    let inv = await request(app)
      .get(`/api/v1/inventory?productId=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(inv.body.data.totalReserved).toBe(5);
    expect(inv.body.data.totalAvailable).toBe(5);

    // Run expiration sweep
    const result = await reservationService.expireStaleReservations();
    expect(result.expiredReservationsCount).toBe(1);
    expect(result.expiredOrdersCount).toBe(1);

    // After sweep: order 1 expired (-3 reserved), order 2 active (2 reserved)
    // totalReserved should now be 2, available should be 8!
    inv = await request(app)
      .get(`/api/v1/inventory?productId=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(inv.body.data.totalReserved).toBe(2);
    expect(inv.body.data.totalAvailable).toBe(8);

    // Verify order 1 status
    const order1 = await request(app)
      .get(`/api/v1/orders/${expiredOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(order1.body.data.status).toBe('RESERVATION_EXPIRED');

    // Verify order 2 is still RESERVED
    const order2 = await request(app)
      .get(`/api/v1/orders/${activeOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(order2.body.data.status).toBe('RESERVED');
  });

  it('should be safe on repeated sweeps without double-releasing stock', async () => {
    // First sweep
    await reservationService.expireStaleReservations();

    // Second sweep immediately following
    const repeatResult = await reservationService.expireStaleReservations();
    expect(repeatResult.expiredReservationsCount).toBe(0);
    expect(repeatResult.expiredOrdersCount).toBe(0);

    // Stock levels remain consistent (2 reserved, 8 available)
    const inv = await request(app)
      .get(`/api/v1/inventory?productId=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(inv.body.data.totalReserved).toBe(2);
    expect(inv.body.data.totalAvailable).toBe(8);
  });
});

