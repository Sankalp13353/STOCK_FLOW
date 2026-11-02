import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { userController } from './user.controller';
import { authenticate, authorize } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import {
  assignWarehouseSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  userIdParamSchema,
  userWarehouseParamsSchema,
} from './user.schemas';

const router = Router();

// Administrative User Management APIs (Strictly ADMIN only)
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ query: listUsersQuerySchema }),
  userController.list
);

router.get(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema }),
  userController.getById
);

router.patch(
  '/:id/role',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: updateUserRoleSchema }),
  userController.updateRole
);

router.post(
  '/:id/warehouses',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: assignWarehouseSchema }),
  userController.assignWarehouse
);

router.delete(
  '/:id/warehouses/:warehouseId',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userWarehouseParamsSchema }),
  userController.removeWarehouse
);

// View warehouse assignments (ADMIN or the user themselves)
router.get(
  '/:id/warehouses',
  authenticate,
  validate({ params: userIdParamSchema }),
  userController.getWarehouses
);

export const userRouter = router;

