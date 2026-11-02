import { Request, Response, NextFunction } from 'express';
import { inventoryService } from './inventory.service';
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
}

export const inventoryController = new InventoryController();
