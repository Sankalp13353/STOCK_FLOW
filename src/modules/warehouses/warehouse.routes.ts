import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { warehouseController } from './warehouse.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authorize } from '../../common/middlewares/auth';
import {
  createWarehouseSchema,
  listWarehousesQuerySchema,
  warehouseIdParamSchema,
} from './warehouse.schemas';

const router = Router();

// Warehouse listing and single facility view (enforcing mandatory auth and role & warehouse assignment authorization)
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ query: listWarehousesQuerySchema }),
  warehouseController.list
);

router.get(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: warehouseIdParamSchema }),
  warehouseController.getById
);

// Admin-only creation
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createWarehouseSchema }),
  warehouseController.create
);

export const warehouseRouter = router;

