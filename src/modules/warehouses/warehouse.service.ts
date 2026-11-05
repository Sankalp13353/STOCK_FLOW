import { Warehouse, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error';
import { CreateWarehouseInput, ListWarehousesQuery } from './warehouse.schemas';
import { warehouseAccessService } from './warehouse-access.service';

export interface WarehouseDetailsWithTeam extends Warehouse {
  managers?: any[];
  staff?: any[];
  userAssignments?: any[];
}

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

  public async getWarehouseById(
    id: string,
    user?: { userId: string; role: UserRole }
  ): Promise<WarehouseDetailsWithTeam> {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        userAssignments: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${id}' not found`);
    }

    if (!user) {
      throw new ForbiddenError(
        'Authentication required to access warehouse operations.',
        'AUTH_REQUIRED'
      );
    }

    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to access internal warehouse operations.',
        'FORBIDDEN'
      );
    }
    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, id);
    }

    const assignments = warehouse.userAssignments || [];
    const managers = assignments
      .filter((a) => (a.role || a.user.role) === UserRole.WAREHOUSE_MANAGER)
      .map((a) => ({
        ...a.user,
        assignmentId: a.id,
        assignedAt: a.assignedAt,
      }));

    const staff = assignments
      .filter((a) => (a.role || a.user.role) === UserRole.WAREHOUSE_STAFF)
      .map((a) => ({
        ...a.user,
        assignmentId: a.id,
        assignedAt: a.assignedAt,
      }));

    return {
      ...warehouse,
      managers,
      staff,
    };
  }

  public async listWarehouses(
    query?: ListWarehousesQuery,
    user?: { userId: string; role: UserRole }
  ): Promise<Warehouse[]> {
    const where: Prisma.WarehouseWhereInput = {};

    if (query && typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    if (!user) {
      throw new ForbiddenError(
        'Authentication required to list warehouse facilities.',
        'AUTH_REQUIRED'
      );
    }

    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to access internal warehouse operations.',
        'FORBIDDEN'
      );
    }
    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(
        user.userId,
        user.role
      );
      where.id = { in: accessibleIds as string[] };
    }

    return prisma.warehouse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const warehouseService = new WarehouseService();
