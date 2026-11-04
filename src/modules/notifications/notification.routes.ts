import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate } from '../../common/middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', notificationController.list);
router.post('/read-all', notificationController.markAllAsRead);
router.post('/:id/read', notificationController.markAsRead);

export const notificationRouter = router;

