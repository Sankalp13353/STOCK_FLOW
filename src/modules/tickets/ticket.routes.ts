import { Router } from 'express';
import { ticketController } from './ticket.controller';
import { authenticate, authorize } from '../../common/middlewares/auth';
import { validate } from '../../common/middlewares/validate';
import { UserRole } from '@prisma/client';
import {
  approveTicketSchema,
  assignTicketSchema,
  customerDecisionSchema,
  listTicketsQuerySchema,
  rejectTicketSchema,
  resolveTicketSchema,
  ticketIdParamSchema,
} from './ticket.schemas';

const router = Router();

router.use(authenticate);

// List tickets with role-based visibility
router.get('/', validate({ query: listTicketsQuerySchema }), ticketController.list);

// Get single ticket details
router.get('/:id', validate({ params: ticketIdParamSchema }), ticketController.getById);

// Assign ticket (ADMIN, WAREHOUSE_MANAGER)
router.post(
  '/:id/assign',
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ params: ticketIdParamSchema, body: assignTicketSchema }),
  ticketController.assign
);

// Approve internal shortage ticket (ADMIN, WAREHOUSE_MANAGER)
router.post(
  '/:id/approve',
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ params: ticketIdParamSchema, body: approveTicketSchema }),
  ticketController.approve
);

// Reject internal shortage ticket (ADMIN, WAREHOUSE_MANAGER)
router.post(
  '/:id/reject',
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ params: ticketIdParamSchema, body: rejectTicketSchema }),
  ticketController.reject
);

// Resolve ticket (ADMIN, WAREHOUSE_MANAGER)
router.post(
  '/:id/resolve',
  authorize(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER),
  validate({ params: ticketIdParamSchema, body: resolveTicketSchema }),
  ticketController.resolve
);

// Customer decision response (CUSTOMER, ADMIN)
router.post(
  '/:id/customer-decision',
  authorize(UserRole.CUSTOMER, UserRole.ADMIN),
  validate({ params: ticketIdParamSchema, body: customerDecisionSchema }),
  ticketController.customerDecision
);

export const ticketRouter = router;

