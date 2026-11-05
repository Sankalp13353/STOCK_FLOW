import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { analyticsService } from './analytics.service';
import { sendSuccess } from '../../common/utils/response';
import { AnalyticsQuery } from './analytics.schemas';

export class AnalyticsController {
  public async getDashboard(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const query = req.query as unknown as AnalyticsQuery;
      const result = await analyticsService.getDashboard(user, query);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getKpis(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const query = req.query as unknown as AnalyticsQuery;
      const result = await analyticsService.getKpis(user, query);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getInventory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const query = req.query as unknown as AnalyticsQuery;
      const result = await analyticsService.getInventoryAnalytics(user, query);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getOrders(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const query = req.query as unknown as AnalyticsQuery;
      const result = await analyticsService.getOrderAnalytics(user, query);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getWarehouses(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const query = req.query as unknown as AnalyticsQuery;
      const result = await analyticsService.getWarehousePerformance(user, query);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getAlerts(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = { userId: req.user!.userId, role: req.user!.role };
      const query = req.query as unknown as AnalyticsQuery;
      const result = await analyticsService.getOperationalAlerts(user, query);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();

