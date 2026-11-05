import { Router } from 'express';
import { orderController } from './order.controller';
import { authenticate, authorize } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import { UserRole } from '@prisma/client';
import {
  cancelOrderSchema,
  createOrderSchema,
  deliverOrderSchema,
  dispatchOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  processOrderSchema,
} from './order.schemas';

const router = Router();

// Order creation with schema validation & authentication
router.post('/', authenticate, validate({ body: createOrderSchema }), orderController.create);

// List orders (admin gets all, customer gets own)
router.get('/', authenticate, validate({ query: listOrdersQuerySchema }), orderController.list);

// Explicit customer orders endpoint
router.get('/my-orders', authenticate, validate({ query: listOrdersQuerySchema }), orderController.getMyOrders);

// Single order details
router.get('/:id', authenticate, validate({ params: orderIdParamSchema }), orderController.getById);

// Order cancellation
router.post(
  '/:id/cancel',
  authenticate,
  validate({ params: orderIdParamSchema, body: cancelOrderSchema }),
  orderController.cancel
);

// Fulfilment lifecycle: transition to PROCESSING
router.post(
  '/:id/process',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: orderIdParamSchema, body: processOrderSchema }),
  orderController.process
);

// Fulfilment lifecycle: DISPATCH order and deduct physical stock
router.post(
  '/:id/dispatch',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: orderIdParamSchema, body: dispatchOrderSchema }),
  orderController.dispatch
);

// Fulfilment lifecycle: mark as DELIVERED
router.post(
  '/:id/deliver',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF),
  validate({ params: orderIdParamSchema, body: deliverOrderSchema }),
  orderController.deliver
);

export const orderRouter = router;

