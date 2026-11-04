import { Request, Response, NextFunction } from 'express';
import { inventoryService } from './inventory.service';
import { thresholdService } from './threshold.service';
import { thresholdEvaluationService } from './threshold-evaluation.service';
import { reservationService } from '../reservations/reservation.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';

export class InventoryController {
  public async addStock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await inventoryService.addStock(req.body, user);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getInventory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await inventoryService.getInventory(req.query as any, user);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getByWarehouse(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseId = Array.isArray(req.params.warehouseId)
        ? req.params.warehouseId[0]
        : req.params.warehouseId;
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const records = await inventoryService.getInventoryByWarehouse(warehouseId, user);
      sendSuccess(res, records, 200);
    } catch (error) {
      next(error);
    }
  }

  public async expireReservations(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await reservationService.expireStaleReservations();
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async createThreshold(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await thresholdService.createThreshold(req.body, user as any);
      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  public async getThresholds(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await thresholdService.getThresholds(req.query as any, user as any);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getThresholdById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await thresholdService.getThresholdById(id, user as any);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async updateThreshold(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await thresholdService.updateThreshold(id, req.body, user as any);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async deleteThreshold(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await thresholdService.deleteThreshold(id, user as any);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getLowStock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
      const result = await thresholdEvaluationService.getLowStockItems(warehouseId, user);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const inventoryController = new InventoryController();
