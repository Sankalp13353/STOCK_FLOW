import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../common/middlewares/validate';
import { authenticate } from '../../common/middlewares/auth';
import { loginSchema, registerSchema } from './auth.schemas';

const router = Router();

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);
router.get('/me', authenticate, authController.getMe);

export const authRouter = router;

