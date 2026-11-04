import { Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';

export class NotificationController {
  public async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const isRead = req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await notificationService.listUserNotifications(req.user!.userId, {
        isRead,
        page,
        limit,
      });

      sendSuccess(
        res,
        {
          notifications: result.notifications,
          unreadCount: result.unreadCount,
        },
        200,
        { pagination: result.pagination }
      );
    } catch (error) {
      next(error);
    }
  }

  public async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const notificationId = req.params.id as string;
      const updated = await notificationService.markAsRead(req.user!.userId, notificationId);
      sendSuccess(res, updated, 200);
    } catch (error) {
      next(error);
    }
  }

  public async markAllAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await notificationService.markAllAsRead(req.user!.userId);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
