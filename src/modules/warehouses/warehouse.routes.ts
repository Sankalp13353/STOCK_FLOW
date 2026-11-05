import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { warehouseController } from './warehouse.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authorize } from '../../common/middlewares/auth';
import {
  assignUserToWarehouseSchema,
  createWarehouseSchema,
  listWarehousesQuerySchema,
  warehouseIdParamSchema,
  warehouseUserParamSchema,
} from './warehouse.schemas';

const router = Router();

// Warehouse listing (enforcing mandatory auth and role & warehouse assignment authorization)
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ query: listWarehousesQuerySchema }),
  warehouseController.list
);

// Admin-only warehouse creation
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createWarehouseSchema }),
  warehouseController.create
);

// Single facility view with assigned managers and staff
router.get(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: warehouseIdParamSchema }),
  warehouseController.getById
);

// Inspect assigned team members (managers and staff) for a warehouse
router.get(
  '/:id/users',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: warehouseIdParamSchema }),
  warehouseController.getUsers
);

// Assign user to warehouse (Admin only)
router.post(
  '/:id/assignments',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: warehouseIdParamSchema, body: assignUserToWarehouseSchema }),
  warehouseController.assignUser
);

// Remove user from warehouse (Admin only)
router.delete(
  '/:id/assignments/:userId',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: warehouseUserParamSchema }),
  warehouseController.removeUser
);

export const warehouseRouter = router;
