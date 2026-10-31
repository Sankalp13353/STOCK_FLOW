import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { prisma } from '../src/database/prisma';

describe('Concurrency Control: Zero Overselling Stress Test', () => {
  let adminToken: string;
  let customerToken: string;
  let productId: string;
  let warehouseId: string;

  beforeEach(async () => {
    await clearDatabase();
    const admin = await createTestUser(UserRole.ADMIN);
    const customer = await createTestUser(UserRole.CUSTOMER);
    adminToken = admin.token;
    customerToken = customer.token;

    // Create warehouse
    const wh = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-FLASH-01',
        name: 'Flash Sale Fulfillment Center',
        address: '777 Concurrency Way',
        city: 'Austin',
        country: 'USA',
      });
    warehouseId = wh.body.data.id;

    // Create product
    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-HOT-LAPTOP',
        name: 'Limited Flash Sale Laptop',
        priceCents: 99900,
      });
    productId = prod.body.data.id;

    // Initial stock = exactly 10 units
    await request(app)
      .post('/api/v1/inventory/restock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId,
        warehouseId,
        quantity: 10,
        notes: 'Initial flash sale stock allocation',
      });
  });

  it('should handle 100 simultaneous order requests for 10 units: exactly 10 succeed, 90 fail, zero oversell', async () => {
    const TOTAL_REQUESTS = 100;
    const TOTAL_AVAILABLE_STOCK = 10;

    // Verify pre-condition: total on hand = 10, reserved = 0
    const initialInv = await prisma.inventory.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
    });
    expect(initialInv!.quantityOnHand).toBe(TOTAL_AVAILABLE_STOCK);
    expect(initialInv!.quantityReserved).toBe(0);

    // Fire 100 simultaneous order requests at the exact same moment
    const orderPromises = Array.from({ length: TOTAL_REQUESTS }, (_, index) => {
      const idempotencyKey = `concurrency-req-${index}-${Date.now()}`;
      return request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          shippingAddress: `Customer Residence #${index}`,
          items: [
            {
              productId,
              warehouseId,
              quantity: 1, // Requesting 1 unit
            },
          ],
        });
    });

    const responses = await Promise.all(orderPromises);

    // Filter responses
    const successfulResponses = responses.filter((r) => r.status === 201);
    const conflictResponses = responses.filter((r) => r.status === 409);
    const otherResponses = responses.filter((r) => r.status !== 201 && r.status !== 409);

    // ASSERTION 1: Exactly 10 successful reservations
    expect(successfulResponses.length).toBe(TOTAL_AVAILABLE_STOCK);

    // ASSERTION 2: Exactly 90 unsuccessful reservations (409 Conflict: Insufficient stock)
    expect(conflictResponses.length).toBe(TOTAL_REQUESTS - TOTAL_AVAILABLE_STOCK);
    expect(otherResponses.length).toBe(0);

    // ASSERTION 3: Database row inspection
    const finalInv = await prisma.inventory.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
    });

    // Physical stock on hand remains 10 (awaiting payment)
    expect(finalInv!.quantityOnHand).toBe(TOTAL_AVAILABLE_STOCK);

    // Reserved quantity must equal exactly 10, NOT EXCEEDING available stock
    expect(finalInv!.quantityReserved).toBe(TOTAL_AVAILABLE_STOCK);

    // Available stock must be exactly 0, never negative
    const availableStock = finalInv!.quantityOnHand - finalInv!.quantityReserved;
    expect(availableStock).toBe(0);
    expect(availableStock).toBeGreaterThanOrEqual(0);

    // ASSERTION 4: Exactly 10 active reservation records created in the database
    const activeReservationsCount = await prisma.inventoryReservation.count({
      where: {
        inventoryId: finalInv!.id,
        status: 'ACTIVE',
      },
    });
    expect(activeReservationsCount).toBe(TOTAL_AVAILABLE_STOCK);

    // ASSERTION 5: Exactly 10 orders created in the database
    const ordersCount = await prisma.order.count({
      where: {
        status: 'RESERVED',
      },
    });
    expect(ordersCount).toBe(TOTAL_AVAILABLE_STOCK);
  }, 45000); // 45s timeout for 100 concurrent DB transactions
});

