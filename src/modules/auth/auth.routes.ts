import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authController } from './auth.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate, authorize } from '../../common/middlewares/auth';
import { rateLimiter } from '../../common/middlewares/rate-limiter';
import { loginSchema, registerSchema } from './auth.schemas';
import { userRouter } from '../users/user.routes';

const router = Router();

router.post(
  '/register',
  rateLimiter({ action: 'register' }),
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  rateLimiter({ action: 'login' }),
  validate({ body: loginSchema }),
  authController.login
);

router.get('/me', authenticate, authController.getMe);

// Mount administrative user management subroutes
router.use('/users', userRouter);

export const authRouter = router;

