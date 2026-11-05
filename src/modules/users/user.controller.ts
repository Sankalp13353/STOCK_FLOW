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

  public async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      // Allow ADMIN, or the user themselves to inspect their profile
      if (req.user?.role !== UserRole.ADMIN && req.user?.userId !== id) {
        throw new ForbiddenError('You are not authorized to view this user profile.');
      }

      const user = await userService.getUserById(id);
      sendSuccess(res, user, 200);
    } catch (error) {
      next(error);
    }
  }

  public async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      const user = await userService.createUser(req.body, caller);
      sendSuccess(res, user, 201);
    } catch (error) {
      next(error);
    }
  }

  public async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      const user = await userService.updateUser(id, req.body, caller);
      sendSuccess(res, user, 200);
    } catch (error) {
      next(error);
    }
  }

  public async updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { role } = req.body;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      const updatedUser = await userService.updateUser(id, { role }, caller);
      sendSuccess(res, updatedUser, 200);
    } catch (error) {
      next(error);
    }
  }

  public async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { isActive } = req.body;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      const updatedUser = await userService.updateUser(id, { isActive }, caller);
      sendSuccess(res, updatedUser, 200);
    } catch (error) {
      next(error);
    }
  }

  public async assignWarehouse(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { warehouseId, role } = req.body;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      const assignment = await userService.assignWarehouse(id, warehouseId, role, caller);
      sendSuccess(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  }

  public async syncWarehouses(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { warehouseIds } = req.body;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      const user = await userService.syncUserWarehouses(id, warehouseIds, caller);
      sendSuccess(res, user, 200);
    } catch (error) {
      next(error);
    }
  }

  public async removeWarehouse(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const warehouseId = Array.isArray(req.params.warehouseId) ? req.params.warehouseId[0] : req.params.warehouseId;
      const caller = {
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };
      await userService.removeWarehouseAssignment(id, warehouseId, caller);
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

  public async getWarehouseUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const caller = req.user
        ? {
            userId: req.user.userId,
            email: req.user.email,
            role: req.user.role,
          }
        : undefined;

      const result = await userService.getWarehouseUsers(warehouseId, caller);
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
