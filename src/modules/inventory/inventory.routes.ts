import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { inventoryController } from './inventory.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authenticateOptional, authorize } from '../../common/middlewares/auth';
import {
  addStockSchema,
  inventoryQuerySchema,
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

// Overview inventory queries
router.get('/', authenticateOptional, validate({ query: inventoryQuerySchema }), inventoryController.getInventory);

// Warehouse-specific inventory (Phase 1 spec: /warehouse/:warehouseId, Phase 2 prompt: /:warehouseId)
router.get(
  '/warehouse/:warehouseId',
  authenticateOptional,
  validate({ params: warehouseIdParamSchema }),
  inventoryController.getByWarehouse
);

router.get(
  '/:warehouseId',
  authenticateOptional,
  validate({ params: warehouseIdParamSchema }),
  inventoryController.getByWarehouse
);

export const inventoryRouter = router;
