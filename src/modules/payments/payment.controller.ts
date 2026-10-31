import { Response, NextFunction } from 'express';
import { paymentService } from './payment.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';

export class PaymentController {
  public async processPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.processPayment(req.body, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();

