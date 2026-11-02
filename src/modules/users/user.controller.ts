import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';
import { ForbiddenError } from '../../common/errors/app-error';
import { UserRole } from '@prisma/client';

export class UserController {
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await userService.listUsers(req.query as any);
      sendSuccess(res, result.users, 200, { pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const user = await userService.getUserById(id);
      sendSuccess(res, user, 200);
    } catch (error) {
      next(error);
    }
  }

  public async updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { role } = req.body;

      // Caller is already verified as ADMIN by authorize(UserRole.ADMIN) middleware
      const updatedUser = await userService.updateUserRole(id, role);
      sendSuccess(res, updatedUser, 200);
    } catch (error) {
      next(error);
    }
  }

  public async assignWarehouse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { warehouseId, role } = req.body;
      const assignment = await userService.assignWarehouse(id, warehouseId, role);
      sendSuccess(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  }

  public async removeWarehouse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const warehouseId = Array.isArray(req.params.warehouseId) ? req.params.warehouseId[0] : req.params.warehouseId;
      await userService.removeWarehouseAssignment(id, warehouseId);
      sendSuccess(res, { message: `Warehouse assignment removed successfully` }, 200);
    } catch (error) {
      next(error);
    }
  }

  public async getWarehouses(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      // Allow ADMIN, or the user themselves to inspect their warehouse assignments
      if (req.user?.role !== UserRole.ADMIN && req.user?.userId !== id) {
        throw new ForbiddenError('You are not authorized to view warehouse assignments for this user.');
      }

      const assignments = await userService.getUserWarehouses(id);
      sendSuccess(res, assignments, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();

