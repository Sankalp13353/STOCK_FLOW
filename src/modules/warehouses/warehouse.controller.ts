import { Request, Response, NextFunction } from 'express';
import { warehouseService } from './warehouse.service';
import { userService } from '../users/user.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';

export class WarehouseController {
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouse = await warehouseService.createWarehouse(req.body);
      sendSuccess(res, warehouse, 201);
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const warehouse = await warehouseService.getWarehouseById(id, user);
      sendSuccess(res, warehouse, 200);
    } catch (error) {
      next(error);
    }
  }

  public async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const warehouses = await warehouseService.listWarehouses(req.query as any, user);
      sendSuccess(res, warehouses, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const caller = req.user
        ? {
            userId: req.user.userId,
            email: req.user.email,
            role: req.user.role,
          }
        : undefined;

      const result = await userService.getWarehouseUsers(id, caller);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  public async assignUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { userId, role } = req.body;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };

      const assignment = await userService.assignWarehouse(userId, id, role, caller);
      sendSuccess(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  }

  public async removeUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };

      await userService.removeWarehouseAssignment(userId, id, caller);
      sendSuccess(res, { message: 'User warehouse assignment removed successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const warehouseController = new WarehouseController();
