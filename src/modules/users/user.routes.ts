import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { userController } from './user.controller';
import { authenticate, authorize } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import {
  assignWarehouseSchema,
  createUserSchema,
  listUsersQuerySchema,
  syncUserWarehousesSchema,
  updateUserRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  userWarehouseParamsSchema,
} from './user.schemas';

const router = Router();

// 1. List users (Strictly ADMIN only)
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ query: listUsersQuerySchema }),
  userController.list
);

// 2. Create user (Manager, Staff, Customer - ADMIN only)
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createUserSchema }),
  userController.create
);

// 3. User by ID (ADMIN, or self)
router.get(
  '/:id',
  authenticate,
  validate({ params: userIdParamSchema }),
  userController.getById
);

// 4. Update user details (ADMIN only)
router.patch(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  userController.update
);

// 5. Update user role (ADMIN only)
router.patch(
  '/:id/role',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: updateUserRoleSchema }),
  userController.updateRole
);

// 6. Update user active status / deactivation (ADMIN only)
router.patch(
  '/:id/status',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: updateUserStatusSchema }),
  userController.updateStatus
);

// 7. Assign warehouse to user (ADMIN only)
router.post(
  '/:id/warehouses',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: assignWarehouseSchema }),
  userController.assignWarehouse
);

// 8. Replace / sync all warehouse assignments for user (ADMIN only)
router.put(
  '/:id/warehouses',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userIdParamSchema, body: syncUserWarehousesSchema }),
  userController.syncWarehouses
);

// 9. Remove warehouse assignment (ADMIN only)
router.delete(
  '/:id/warehouses/:warehouseId',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: userWarehouseParamsSchema }),
  userController.removeWarehouse
);

// 10. View warehouse assignments for user (ADMIN or the user themselves)
router.get(
  '/:id/warehouses',
  authenticate,
  validate({ params: userIdParamSchema }),
  userController.getWarehouses
);

export const userRouter = router;
