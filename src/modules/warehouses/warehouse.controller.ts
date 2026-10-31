import { Request, Response, NextFunction } from 'express';
import { warehouseService } from './warehouse.service';
import { sendSuccess } from '../../common/utils/response';

export class WarehouseController {
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouse = await warehouseService.createWarehouse(req.body);
      sendSuccess(res, warehouse, 201);
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const warehouse = await warehouseService.getWarehouseById(id);
      sendSuccess(res, warehouse, 200);
    } catch (error) {
      next(error);
    }
  }

  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouses = await warehouseService.listWarehouses(req.query as any);
      sendSuccess(res, warehouses, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const warehouseController = new WarehouseController();
