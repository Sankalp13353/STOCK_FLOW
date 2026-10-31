import { Router } from 'express';
import { orderController } from './order.controller';
import { authenticate } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import {
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
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

export const orderRouter = router;

