import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate } from '../../common/middlewares/auth';
import { rateLimiter } from '../../common/middlewares/rate-limiter';
import { loginSchema, registerSchema } from './auth.schemas';

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

export const authRouter = router;

