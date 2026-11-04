import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { clearDatabase } from './setup';
import { createTestUser } from './helpers';
import { prisma } from '../src/database/prisma';
import { thresholdEvaluationService } from '../src/modules/inventory/threshold-evaluation.service';

describe('Phase 1 — Security Hardening & Minimum Stock Thresholds', () => {
  let adminToken: string;
  let managerToken: string;
  let managerUser: any;
  let staffToken: string;
  let staffUser: any;
  let customerToken: string;

  let warehouseAId: string;
  let warehouseBId: string;
  let product1Id: string;
  let product2Id: string;

  beforeEach(async () => {
    await clearDatabase();

    const admin = await createTestUser(UserRole.ADMIN);
    const manager = await createTestUser(UserRole.WAREHOUSE_MANAGER);
    const staff = await createTestUser(UserRole.WAREHOUSE_STAFF);
    const customer = await createTestUser(UserRole.CUSTOMER);

    adminToken = admin.token;
    managerToken = manager.token;
    managerUser = manager.user;
    staffToken = staff.token;
    staffUser = staff.user;
    customerToken = customer.token;

    // Create Warehouse A & Warehouse B
    const whARes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-SEC-A',
        name: 'Warehouse Security Alpha',
        address: '100 Alpha St',
        city: 'Atlanta',
        country: 'USA',
      });
    warehouseAId = whARes.body.data.id;

    const whBRes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'WH-SEC-B',
        name: 'Warehouse Security Beta',
        address: '200 Beta St',
        city: 'Baltimore',
        country: 'USA',
      });
    warehouseBId = whBRes.body.data.id;

    // Assign Manager & Staff ONLY to Warehouse A (Warehouse B is unassigned)
    await prisma.userWarehouseAssignment.create({
      data: {
        userId: managerUser.id,
        warehouseId: warehouseAId,
        role: UserRole.WAREHOUSE_MANAGER,
      },
    });

    await prisma.userWarehouseAssignment.create({
      data: {
        userId: staffUser.id,
        warehouseId: warehouseAId,
        role: UserRole.WAREHOUSE_STAFF,
      },
    });

    // Create Product 1 & Product 2
    const p1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-THRESH-1',
        name: 'Industrial Bolt Pack',
        priceCents: 1500,
      });
    product1Id = p1Res.body.data.id;

    const p2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-THRESH-2',
        name: 'Heavy Duty Cable',
        priceCents: 3500,
      });
    product2Id = p2Res.body.data.id;
  });

  // =========================================================================
  // 1. SECURITY HARDENING TESTS
  // =========================================================================
  describe('1. Security Hardening — Mandatory Authentication & RBAC Boundaries', () => {
    it('should reject unauthenticated inventory queries with HTTP 401 Unauthorized', async () => {
      // General inventory endpoint
      const resGeneral = await request(app).get('/api/v1/inventory');
      expect(resGeneral.status).toBe(401);
      expect(resGeneral.body.success).toBe(false);
      expect(resGeneral.body.error.code).toBe('AUTH_TOKEN_MISSING');

      // Warehouse-specific endpoint
      const resWarehouse = await request(app).get(`/api/v1/inventory/warehouse/${warehouseAId}`);
      expect(resWarehouse.status).toBe(401);
      expect(resWarehouse.body.success).toBe(false);

      // Alias warehouse endpoint
      const resAlias = await request(app).get(`/api/v1/inventory/${warehouseAId}`);
      expect(resAlias.status).toBe(401);
      expect(resAlias.body.success).toBe(false);

      // Thresholds endpoint
      const resThresholds = await request(app).get('/api/v1/inventory/thresholds');
      expect(resThresholds.status).toBe(401);

      // Low stock endpoint
      const resLowStock = await request(app).get('/api/v1/inventory/low-stock');
      expect(resLowStock.status).toBe(401);
    });

    it('should reject unauthenticated warehouse queries with HTTP 401 Unauthorized', async () => {
      // List warehouses
      const resList = await request(app).get('/api/v1/warehouses');
      expect(resList.status).toBe(401);
      expect(resList.body.success).toBe(false);
      expect(resList.body.error.code).toBe('AUTH_TOKEN_MISSING');

      // Single warehouse
      const resSingle = await request(app).get(`/api/v1/warehouses/${warehouseAId}`);
      expect(resSingle.status).toBe(401);
      expect(resSingle.body.success).toBe(false);
    });

    it('should deny CUSTOMER access to internal inventory and warehouse endpoints with HTTP 403 Forbidden', async () => {
      // Inventory general
      const resInv = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resInv.status).toBe(403);
      expect(resInv.body.error.code).toBe('FORBIDDEN');

      // Inventory specific
      const resInvWh = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resInvWh.status).toBe(403);

      // Warehouses list
      const resWh = await request(app)
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resWh.status).toBe(403);

      // Warehouse detail
      const resWhId = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resWhId.status).toBe(403);

      // Thresholds inspection
      const resTh = await request(app)
        .get('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resTh.status).toBe(403);

      // Threshold mutation
      const resThPost = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product1Id, minQuantity: 10 });
      expect(resThPost.status).toBe(403);
    });

    it('should allow WAREHOUSE_MANAGER to access assigned warehouse and deny unassigned warehouse with HTTP 403', async () => {
      // Assigned facility (Warehouse A) -> 200 OK
      const resAssigned = await request(app)
        .get(`/api/v1/warehouses/${warehouseAId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(resAssigned.status).toBe(200);
      expect(resAssigned.body.data.code).toBe('WH-SEC-A');

      const resInvAssigned = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(resInvAssigned.status).toBe(200);

      // Unassigned facility (Warehouse B) -> 403 Forbidden
      const resUnassigned = await request(app)
        .get(`/api/v1/warehouses/${warehouseBId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(resUnassigned.status).toBe(403);
      expect(resUnassigned.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');

      const resInvUnassigned = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseBId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(resInvUnassigned.status).toBe(403);
      expect(resInvUnassigned.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');
    });

    it('should allow ADMIN complete access across all warehouse facilities and internal inventory', async () => {
      const resWhList = await request(app)
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resWhList.status).toBe(200);
      expect(resWhList.body.data.length).toBeGreaterThanOrEqual(2);

      const resInvA = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseAId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resInvA.status).toBe(200);

      const resInvB = await request(app)
        .get(`/api/v1/inventory/warehouse/${warehouseBId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resInvB.status).toBe(200);
    });

    it('should preserve public product catalogue for customers while inventory ledgers remain protected', async () => {
      // Unauthenticated public catalogue browsing
      const resPublicCatalog = await request(app).get('/api/v1/products');
      expect(resPublicCatalog.status).toBe(200);
      expect(resPublicCatalog.body.success).toBe(true);
      expect(Array.isArray(resPublicCatalog.body.data)).toBe(true);

      // Customer authenticated catalogue browsing
      const resCustomerCatalog = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resCustomerCatalog.status).toBe(200);
    });
  });

  // =========================================================================
  // 2. MINIMUM STOCK THRESHOLD MANAGEMENT APIs
  // =========================================================================
  describe('2. Minimum Stock Threshold Management APIs', () => {
    it('should allow ADMIN to create an organisation-wide global default threshold (warehouseId = null)', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          minQuantity: 15,
          reorderQuantity: 50,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.productId).toBe(product1Id);
      expect(res.body.data.warehouseId).toBeNull();
      expect(res.body.data.minQuantity).toBe(15);
      expect(res.body.data.reorderQuantity).toBe(50);
      expect(res.body.data.product.sku).toBe('SKU-THRESH-1');
    });

    it('should forbid WAREHOUSE_MANAGER from creating organization-wide global default thresholds', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: product1Id,
          minQuantity: 15,
          // warehouseId omitted -> global default
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ORGANIZATION_DEFAULT');
    });

    it('should allow WAREHOUSE_MANAGER to create a warehouse-specific threshold for an assigned facility', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          minQuantity: 25,
          reorderQuantity: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.productId).toBe(product1Id);
      expect(res.body.data.warehouseId).toBe(warehouseAId);
      expect(res.body.data.minQuantity).toBe(25);
    });

    it('should deny WAREHOUSE_MANAGER from creating threshold for an unassigned facility with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseBId, // Not assigned to manager
          minQuantity: 20,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_WAREHOUSE_ACCESS');
    });

    it('should forbid WAREHOUSE_STAFF from creating or modifying thresholds with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          minQuantity: 20,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent duplicate threshold records for the same product and warehouse with HTTP 409 Conflict', async () => {
      // First creation succeeds
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product2Id,
          warehouseId: warehouseAId,
          minQuantity: 30,
        });

      // Second creation for same product and warehouse fails with 409
      const resDup = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product2Id,
          warehouseId: warehouseAId,
          minQuantity: 40,
        });

      expect(resDup.status).toBe(409);
      expect(resDup.body.success).toBe(false);
      expect(resDup.body.error.code).toBe('THRESHOLD_ALREADY_EXISTS');
    });

    it('should prevent duplicate global default threshold for the same product with HTTP 409 Conflict', async () => {
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product2Id,
          minQuantity: 12,
        });

      const resDupGlobal = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product2Id,
          minQuantity: 18,
        });

      expect(resDupGlobal.status).toBe(409);
      expect(resDupGlobal.body.error.code).toBe('THRESHOLD_ALREADY_EXISTS');
    });

    it('should reject invalid threshold inputs (negative quantity, non-existent product) with HTTP 400 or 404', async () => {
      // Negative quantity
      const resNeg = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          minQuantity: -5,
        });
      expect(resNeg.status).toBe(400);

      // Non-existent product
      const resMissingProd = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: '00000000-0000-0000-0000-000000000000',
          minQuantity: 10,
        });
      expect(resMissingProd.status).toBe(404);
    });

    it('should retrieve thresholds list and single threshold with update and delete lifecycle', async () => {
      // 1. Create a threshold
      const createRes = await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          minQuantity: 20,
          reorderQuantity: 60,
        });
      const thresholdId = createRes.body.data.id;

      // 2. Retrieve list
      const listRes = await request(app)
        .get('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      // 3. Retrieve single
      const getSingleRes = await request(app)
        .get(`/api/v1/inventory/thresholds/${thresholdId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getSingleRes.status).toBe(200);
      expect(getSingleRes.body.data.id).toBe(thresholdId);

      // 4. Update
      const updateRes = await request(app)
        .put(`/api/v1/inventory/thresholds/${thresholdId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          minQuantity: 35,
          reorderQuantity: 80,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.minQuantity).toBe(35);
      expect(updateRes.body.data.reorderQuantity).toBe(80);

      // 5. Delete
      const deleteRes = await request(app)
        .delete(`/api/v1/inventory/thresholds/${thresholdId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // 6. Verify 404 after delete
      const verifyRes = await request(app)
        .get(`/api/v1/inventory/thresholds/${thresholdId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(verifyRes.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. STOCK THRESHOLD EVALUATION ENGINE
  // =========================================================================
  describe('3. Stock Threshold Evaluation Engine', () => {
    beforeEach(async () => {
      // Product 1: Global default threshold = 15
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          minQuantity: 15,
          reorderQuantity: 50,
        });

      // Product 1 at Warehouse A: Override threshold = 25
      await request(app)
        .post('/api/v1/inventory/thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          minQuantity: 25,
          reorderQuantity: 100,
        });

      // Restock Product 1 at Warehouse A with 30 units (available = 30)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseAId,
          quantity: 30,
        });

      // Restock Product 1 at Warehouse B with 20 units (available = 20)
      await request(app)
        .post('/api/v1/inventory/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product1Id,
          warehouseId: warehouseBId,
          quantity: 20,
        });
    });

    it('should correctly prioritize warehouse-specific override over global default', async () => {
      // At Warehouse A: should use override threshold (25)
      const resA = await thresholdEvaluationService.resolveEffectiveThreshold(product1Id, warehouseAId);
      expect(resA.thresholdType).toBe('WAREHOUSE_OVERRIDE');
      expect(resA.thresholdQuantity).toBe(25);

      // At Warehouse B: should use global default (15)
      const resB = await thresholdEvaluationService.resolveEffectiveThreshold(product1Id, warehouseBId);
      expect(resB.thresholdType).toBe('GLOBAL_DEFAULT');
      expect(resB.thresholdQuantity).toBe(15);
    });

    it('should evaluate stock ABOVE threshold as healthy (isLowStock = false)', async () => {
      // Warehouse A: available = 30, threshold = 25 -> Above threshold
      const evalA = await thresholdEvaluationService.evaluateStock(product1Id, warehouseAId);
      expect(evalA.availableStock).toBe(30);
      expect(evalA.thresholdQuantity).toBe(25);
      expect(evalA.isLowStock).toBe(false);
      expect(evalA.deficit).toBe(0);
    });

    it('should evaluate stock EQUAL to threshold as healthy (isLowStock = false)', async () => {
      // Place order reserving 5 units at Warehouse A: available drops from 30 to 25
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '100 Equal Lane',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 5 }],
        });

      const evalEqual = await thresholdEvaluationService.evaluateStock(product1Id, warehouseAId);
      expect(evalEqual.quantityOnHand).toBe(30);
      expect(evalEqual.quantityReserved).toBe(5);
      expect(evalEqual.availableStock).toBe(25);
      expect(evalEqual.thresholdQuantity).toBe(25);
      expect(evalEqual.isLowStock).toBe(false); // strictly available < threshold
      expect(evalEqual.deficit).toBe(0);
    });

    it('should evaluate stock BELOW threshold as low stock with correct deficit (isLowStock = true)', async () => {
      // Place order reserving 10 units at Warehouse A: available drops from 30 to 20 (< 25)
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '200 Deficit Way',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 10 }],
        });

      const evalLow = await thresholdEvaluationService.evaluateStock(product1Id, warehouseAId);
      expect(evalLow.quantityOnHand).toBe(30);
      expect(evalLow.quantityReserved).toBe(10);
      expect(evalLow.availableStock).toBe(20);
      expect(evalLow.thresholdQuantity).toBe(25);
      expect(evalLow.isLowStock).toBe(true);
      expect(evalLow.deficit).toBe(5); // 25 - 20 = 5
    });

    it('should correctly restore availability and clear low-stock status when reservations are released', async () => {
      // 1. Order reserving 10 units -> triggers low stock
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '300 Cancel St',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 10 }],
        });
      const orderId = orderRes.body.data.id;

      let evalState = await thresholdEvaluationService.evaluateStock(product1Id, warehouseAId);
      expect(evalState.isLowStock).toBe(true);

      // 2. Cancel order -> releases reservations
      await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Test release' });

      // 3. Re-evaluate stock
      evalState = await thresholdEvaluationService.evaluateStock(product1Id, warehouseAId);
      expect(evalState.quantityReserved).toBe(0);
      expect(evalState.availableStock).toBe(30);
      expect(evalState.isLowStock).toBe(false);
      expect(evalState.deficit).toBe(0);
    });

    it('should handle evaluation across multiple warehouses independently via getLowStockItems API', async () => {
      // Warehouse A: threshold = 25, reserve 10 units -> available = 20 (LOW STOCK, deficit = 5)
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: '400 Multi St',
          items: [{ productId: product1Id, warehouseId: warehouseAId, quantity: 10 }],
        });

      // Warehouse B: threshold = 15 (global default), available = 20 (HEALTHY)

      // Query low-stock items via GET /api/v1/inventory/low-stock
      const lowStockRes = await request(app)
        .get('/api/v1/inventory/low-stock')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(lowStockRes.status).toBe(200);
      expect(lowStockRes.body.success).toBe(true);

      const items = lowStockRes.body.data;
      expect(items.length).toBe(1);
      expect(items[0].warehouseId).toBe(warehouseAId);
      expect(items[0].availableStock).toBe(20);
      expect(items[0].thresholdQuantity).toBe(25);
      expect(items[0].deficit).toBe(5);

      // Verify Warehouse B is NOT flagged as low stock
      const whBItem = items.find((i: any) => i.warehouseId === warehouseBId);
      expect(whBItem).toBeUndefined();
    });
  });
});

