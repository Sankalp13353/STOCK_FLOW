import { Warehouse, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';
import { CreateWarehouseInput, ListWarehousesQuery } from './warehouse.schemas';

export class WarehouseService {
  public async createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
    const existing = await prisma.warehouse.findUnique({
      where: { code: input.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictError(`Warehouse with code '${input.code}' already exists`);
    }

    return prisma.warehouse.create({
      data: {
        code: input.code.toUpperCase(),
        name: input.name,
        address: input.address,
        city: input.city,
        country: input.country,
        isActive: input.isActive ?? true,
      },
    });
  }

  public async getWarehouseById(id: string): Promise<Warehouse> {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
    });

    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${id}' not found`);
    }

    return warehouse;
  }

  public async listWarehouses(query?: ListWarehousesQuery): Promise<Warehouse[]> {
    const where: Prisma.WarehouseWhereInput = {};

    if (query && typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    return prisma.warehouse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const warehouseService = new WarehouseService();

