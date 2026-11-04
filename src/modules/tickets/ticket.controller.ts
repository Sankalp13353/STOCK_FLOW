import { Response, NextFunction } from 'express';
import { ticketService } from './ticket.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';

export class TicketController {
  public async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const result = await ticketService.listTickets(user, req.query as any);
      sendSuccess(res, result.tickets, 200, { pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const ticketId = req.params.id as string;
      const ticket = await ticketService.getTicketById(user, ticketId);
      sendSuccess(res, ticket, 200);
    } catch (error) {
      next(error);
    }
  }

  public async assign(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const ticketId = req.params.id as string;
      const { assignedToUserId } = req.body;
      const updated = await ticketService.assignTicket(user, ticketId, assignedToUserId);
      sendSuccess(res, updated, 200);
    } catch (error) {
      next(error);
    }
  }

  public async approve(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const ticketId = req.params.id as string;
      const { notes } = req.body;
      const updated = await ticketService.approveTicket(user, ticketId, notes);
      sendSuccess(res, updated, 200);
    } catch (error) {
      next(error);
    }
  }

  public async reject(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const ticketId = req.params.id as string;
      const { reason } = req.body;
      const updated = await ticketService.rejectTicket(user, ticketId, reason);
      sendSuccess(res, updated, 200);
    } catch (error) {
      next(error);
    }
  }

  public async resolve(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const ticketId = req.params.id as string;
      const { resolutionNotes } = req.body;
      const updated = await ticketService.resolveTicket(user, ticketId, resolutionNotes);
      sendSuccess(res, updated, 200);
    } catch (error) {
      next(error);
    }
  }

  public async customerDecision(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const ticketId = req.params.id as string;
      const { action, notes } = req.body;
      const updated = await ticketService.handleCustomerDecision(user, ticketId, action, notes);
      sendSuccess(res, updated, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const ticketController = new TicketController();

