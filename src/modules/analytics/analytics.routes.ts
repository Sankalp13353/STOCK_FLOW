import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { analyticsController } from './analytics.controller';
import { authenticate, authorize } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import { analyticsQuerySchema } from './analytics.schemas';

const router = Router();

// Global auth & role authorization: Internal operators only (ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF)
// Customers are rejected with HTTP 403 Forbidden
router.use(
  authenticate,
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.WAREHOUSE_STAFF)
);

// Consolidated dashboard overview endpoint
router.get(
  '/dashboard',
  validate({ query: analyticsQuerySchema }),
  analyticsController.getDashboard
);

// Granular endpoints for cached / targeted widget updates
router.get(
  '/kpis',
  validate({ query: analyticsQuerySchema }),
  analyticsController.getKpis
);

router.get(
  '/inventory',
  validate({ query: analyticsQuerySchema }),
  analyticsController.getInventory
);

router.get(
  '/orders',
  validate({ query: analyticsQuerySchema }),
  analyticsController.getOrders
);

router.get(
  '/warehouses',
  validate({ query: analyticsQuerySchema }),
  analyticsController.getWarehouses
);

router.get(
  '/alerts',
  validate({ query: analyticsQuerySchema }),
  analyticsController.getAlerts
);

export const analyticsRouter = router;

