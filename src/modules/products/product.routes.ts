import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { productController } from './product.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authorize } from '../../common/middlewares/auth';
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductSchema,
} from './product.schemas';

const router = Router();

// Public / Authenticated reading
router.get('/', validate({ query: listProductsQuerySchema }), productController.list);
router.get('/:id', validate({ params: productIdParamSchema }), productController.getById);

// Admin-only mutations
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createProductSchema }),
  productController.create
);

router.put(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  productController.update
);

router.patch(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  productController.update
);

export const productRouter = router;

