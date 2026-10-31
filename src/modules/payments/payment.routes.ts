import { Router } from 'express';
import { paymentController } from './payment.controller';
import { authenticate } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import { processPaymentSchema } from './payment.schemas';

const router = Router();

router.post(
  '/process',
  authenticate,
  validate({ body: processPaymentSchema }),
  paymentController.processPayment
);

export const paymentRouter = router;

