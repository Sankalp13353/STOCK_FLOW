import { Response, NextFunction } from 'express';
import { orderService } from './order.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';
import { UserRole } from '@prisma/client';

export class OrderController {
  public async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      const result = await orderService.createOrder(req.user!.userId, req.body, idempotencyKey);

      if (result.isIdempotentReplay) {
        res.setHeader('Idempotent-Replay', 'true');
        sendSuccess(res, result.order, 200);
        return;
      }

      sendSuccess(res, result.order, 201);
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const order = await orderService.getOrderById(orderId, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      sendSuccess(res, order, 200);
    } catch (error) {
      next(error);
    }
  }

  public async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await orderService.listOrders(req.query as any, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      sendSuccess(res, result.orders, 200, { pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  public async getMyOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Force user role to CUSTOMER so listOrders automatically filters to caller's orders
      const result = await orderService.listOrders(req.query as any, {
        userId: req.user!.userId,
        role: UserRole.CUSTOMER,
      });
      sendSuccess(res, result.orders, 200, { pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  public async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await orderService.cancelOrder(
        orderId,
        { userId: req.user!.userId, role: req.user!.role },
        req.body?.reason
      );
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();

