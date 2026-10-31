import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { inventoryController } from './inventory.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authorize } from '../../common/middlewares/auth';
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
  authorize(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN),
  validate({ body: addStockSchema }),
  inventoryController.addStock
);

router.post(
  '/stock',
  authenticate,
  authorize(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN),
  validate({ body: addStockSchema }),
  inventoryController.addStock
);

// Trigger expiration of stale reservations
router.post(
  '/expire-reservations',
  authenticate,
  authorize(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN),
  inventoryController.expireReservations
);

// Overview inventory queries
router.get('/', validate({ query: inventoryQuerySchema }), inventoryController.getInventory);

// Warehouse-specific inventory (Phase 1 spec: /warehouse/:warehouseId, Phase 2 prompt: /:warehouseId)
router.get(
  '/warehouse/:warehouseId',
  validate({ params: warehouseIdParamSchema }),
  inventoryController.getByWarehouse
);

router.get(
  '/:warehouseId',
  validate({ params: warehouseIdParamSchema }),
  inventoryController.getByWarehouse
);

export const inventoryRouter = router;
