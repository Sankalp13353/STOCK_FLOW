import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { inventoryController } from './inventory.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authorize } from '../../common/middlewares/auth';
import {
  addStockSchema,
  createThresholdSchema,
  inventoryQuerySchema,
  thresholdIdParamSchema,
  thresholdQuerySchema,
  updateThresholdSchema,
  warehouseIdParamSchema,
} from './inventory.schemas';

const router = Router();

// Add stock / Restock (Phase 1 spec: /restock, Phase 2 prompt: /stock)
router.post(
  '/restock',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ body: addStockSchema }),
  inventoryController.addStock
);

router.post(
  '/stock',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ body: addStockSchema }),
  inventoryController.addStock
);

// Trigger administrative expiration of stale reservations (manual sweep override)
// Automatic continuous expiration is executed in the background by worker.ts
router.post(
  '/expire-reservations',
  authenticate,
  authorize(UserRole.ADMIN),
  inventoryController.expireReservations
);

// Minimum Stock Thresholds Management APIs
// Must be registered BEFORE /:warehouseId route to prevent routing collision
router.get(
  '/thresholds',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ query: thresholdQuerySchema }),
  inventoryController.getThresholds
);

router.post(
  '/thresholds',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ body: createThresholdSchema }),
  inventoryController.createThreshold
);

router.get(
  '/thresholds/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: thresholdIdParamSchema }),
  inventoryController.getThresholdById
);

router.put(
  '/thresholds/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ params: thresholdIdParamSchema, body: updateThresholdSchema }),
  inventoryController.updateThreshold
);

router.delete(
  '/thresholds/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ params: thresholdIdParamSchema }),
  inventoryController.deleteThreshold
);

// Low-stock evaluation query across authorized facilities
router.get(
  '/low-stock',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  inventoryController.getLowStock
);

// Overview inventory queries (Strictly authenticated & authorized for internal operations)
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ query: inventoryQuerySchema }),
  inventoryController.getInventory
);

// Warehouse-specific inventory (Phase 1 spec: /warehouse/:warehouseId, Phase 2 prompt: /:warehouseId)
router.get(
  '/warehouse/:warehouseId',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: warehouseIdParamSchema }),
  inventoryController.getByWarehouse
);

router.get(
  '/:warehouseId',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: warehouseIdParamSchema }),
  inventoryController.getByWarehouse
);

export const inventoryRouter = router;

