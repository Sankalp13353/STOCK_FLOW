import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { NotFoundError } from '../../common/errors/app-error';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { ListUsersQuery } from './user.schemas';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  warehouseAssignments?: Array<{
    id: string;
    warehouseId: string;
    role: UserRole | null;
    assignedAt: Date;
    warehouse: {
      id: string;
      code: string;
      name: string;
      city: string;
      country: string;
      isActive: boolean;
    };
  }>;
}

export class UserService {
  public async listUsers(query: ListUsersQuery): Promise<{
    users: UserSummary[];
    pagination: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
    };
  }> {
    const { page, limit, role, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [totalRecords, rawUsers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          warehouseAssignments: {
            select: {
              id: true,
              warehouseId: true,
              role: true,
              assignedAt: true,
              warehouse: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  city: true,
                  country: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      users: rawUsers,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  public async getUserById(id: string): Promise<UserSummary> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        warehouseAssignments: {
          select: {
            id: true,
            warehouseId: true,
            role: true,
            assignedAt: true,
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
                city: true,
                country: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError(`User with ID '${id}' not found`);
    }

    return user;
  }

  public async updateUserRole(id: string, newRole: UserRole): Promise<UserSummary> {
    // Verify user existence
    await this.getUserById(id);

    const updated = await prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        warehouseAssignments: {
          select: {
            id: true,
            warehouseId: true,
            role: true,
            assignedAt: true,
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
                city: true,
                country: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    return updated;
  }

  public async assignWarehouse(userId: string, warehouseId: string, role?: UserRole) {
    return warehouseAccessService.assignUserToWarehouse(userId, warehouseId, role);
  }

  public async removeWarehouseAssignment(userId: string, warehouseId: string): Promise<void> {
    return warehouseAccessService.removeUserWarehouseAssignment(userId, warehouseId);
  }

  public async getUserWarehouses(userId: string) {
    return warehouseAccessService.getUserWarehouseAssignments(userId);
  }
}

export const userService = new UserService();

