import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ConflictError, ForbiddenError, NotFoundError, BadRequestError } from '../../common/errors/app-error';
import { CreateThresholdInput, ThresholdQuery, UpdateThresholdInput } from './inventory.schemas';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';

export interface MinimumStockThresholdWithRelations {
  id: string;
  productId: string;
  warehouseId: string | null;
  minQuantity: number;
  reorderQuantity: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    sku: string;
    name: string;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export class ThresholdService {
  /**
   * Creates a minimum stock threshold.
   * - ADMIN: Can create organisation-wide default (warehouseId = null) or warehouse-specific threshold.
   * - WAREHOUSE_MANAGER: Can create warehouse-specific threshold strictly for assigned warehouses.
   * - WAREHOUSE_STAFF & CUSTOMER: Forbidden.
   */
  public async createThreshold(
    input: CreateThresholdInput,
    user: { userId: string; role: UserRole }
  ): Promise<MinimumStockThresholdWithRelations> {
    const { productId, warehouseId, minQuantity, reorderQuantity, isActive } = input;

    // 1. Authorization: Only ADMIN and WAREHOUSE_MANAGER can create thresholds
    if (user.role === UserRole.CUSTOMER || user.role === UserRole.WAREHOUSE_STAFF) {
      throw new ForbiddenError(
        `Access denied. Role '${user.role}' is not authorized to create inventory thresholds.`,
        'FORBIDDEN'
      );
    }

    // 2. Validate Product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError(`Product with ID '${productId}' not found`);
    }

    // 3. Handle Warehouse-specific vs Organisation-wide Default
    if (warehouseId) {
      // Validate Warehouse exists
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
      });
      if (!warehouse) {
        throw new NotFoundError(`Warehouse with ID '${warehouseId}' not found`);
      }

      // If Manager, enforce warehouse assignment
      if (user.role === UserRole.WAREHOUSE_MANAGER) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, warehouseId);
      }

      // Duplicate prevention: check (productId, warehouseId)
      const existing = await prisma.minimumStockThreshold.findUnique({
        where: {
          productId_warehouseId: {
            productId,
            warehouseId,
          },
        },
      });

      if (existing) {
        throw new ConflictError(
          `A threshold already exists for product '${product.name}' (SKU: ${product.sku}) at warehouse '${warehouse.name}' (Code: ${warehouse.code})`,
          'THRESHOLD_ALREADY_EXISTS'
        );
      }
    } else {
      // Organisation-wide default threshold (warehouseId is null)
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError(
          'Only administrators can create organization-wide default thresholds.',
          'FORBIDDEN_ORGANIZATION_DEFAULT'
        );
      }

      // Duplicate prevention for global default
      const existingGlobal = await prisma.minimumStockThreshold.findFirst({
        where: {
          productId,
          warehouseId: null,
        },
      });

      if (existingGlobal) {
        throw new ConflictError(
          `An organization-wide default threshold already exists for product '${product.name}' (SKU: ${product.sku})`,
          'THRESHOLD_ALREADY_EXISTS'
        );
      }
    }

    // 4. Create threshold record
    return prisma.minimumStockThreshold.create({
      data: {
        productId,
        warehouseId: warehouseId || null,
        minQuantity,
        reorderQuantity: reorderQuantity ?? 0,
        isActive: isActive ?? true,
      },
      include: {
        product: {
          select: { id: true, sku: true, name: true },
        },
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  /**
   * Retrieves thresholds with multi-facility authorization:
   * - ADMIN: Can inspect all thresholds (global defaults and all facilities).
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Can inspect global defaults + thresholds for assigned warehouses.
   * - CUSTOMER: Forbidden.
   */
  public async getThresholds(
    query: ThresholdQuery,
    user: { userId: string; role: UserRole }
  ): Promise<MinimumStockThresholdWithRelations[]> {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect inventory thresholds.',
        'FORBIDDEN'
      );
    }

    const where: Prisma.MinimumStockThresholdWhereInput = {};

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.isGlobal === 'true') {
      where.warehouseId = null;
    } else if (query.warehouseId) {
      // Specific warehouse requested
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, query.warehouseId);
      }
      where.warehouseId = query.warehouseId;
    } else {
      // No specific warehouse requested
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
        where.OR = [
          { warehouseId: null }, // Include global defaults
          { warehouseId: { in: accessibleIds as string[] } }, // Include assigned facilities
        ];
      }
    }

    return prisma.minimumStockThreshold.findMany({
      where,
      include: {
        product: {
          select: { id: true, sku: true, name: true },
        },
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [
        { warehouseId: 'asc' }, // Global defaults first, then warehouse-specific
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Retrieves a single threshold by ID.
   */
  public async getThresholdById(
    id: string,
    user: { userId: string; role: UserRole }
  ): Promise<MinimumStockThresholdWithRelations> {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect inventory thresholds.',
        'FORBIDDEN'
      );
    }

    const threshold = await prisma.minimumStockThreshold.findUnique({
      where: { id },
      include: {
        product: {
          select: { id: true, sku: true, name: true },
        },
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!threshold) {
      throw new NotFoundError(`Minimum stock threshold with ID '${id}' not found`);
    }

    if (
      threshold.warehouseId &&
      (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF)
    ) {
      await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, threshold.warehouseId);
    }

    return threshold;
  }

  /**
   * Updates an existing minimum stock threshold.
   * - ADMIN: Can update any threshold.
   * - WAREHOUSE_MANAGER: Can update warehouse-specific thresholds for assigned warehouses.
   * - WAREHOUSE_STAFF & CUSTOMER: Forbidden.
   */
  public async updateThreshold(
    id: string,
    input: UpdateThresholdInput,
    user: { userId: string; role: UserRole }
  ): Promise<MinimumStockThresholdWithRelations> {
    if (user.role === UserRole.CUSTOMER || user.role === UserRole.WAREHOUSE_STAFF) {
      throw new ForbiddenError(
        `Access denied. Role '${user.role}' is not authorized to modify inventory thresholds.`,
        'FORBIDDEN'
      );
    }

    const existing = await prisma.minimumStockThreshold.findUnique({
      where: { id },
      include: { warehouse: true, product: true },
    });

    if (!existing) {
      throw new NotFoundError(`Minimum stock threshold with ID '${id}' not found`);
    }

    // Enforce role boundaries
    if (existing.warehouseId === null) {
      // Organization-wide default: Only ADMIN can edit
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError(
          'Only administrators can modify organization-wide default thresholds.',
          'FORBIDDEN_ORGANIZATION_DEFAULT'
        );
      }
    } else {
      // Warehouse-specific threshold: Manager must be assigned to that warehouse
      if (user.role === UserRole.WAREHOUSE_MANAGER) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, existing.warehouseId);
      }
    }

    const data: Prisma.MinimumStockThresholdUpdateInput = {};
    if (typeof input.minQuantity === 'number') {
      data.minQuantity = input.minQuantity;
    }
    if (typeof input.reorderQuantity === 'number') {
      data.reorderQuantity = input.reorderQuantity;
    }
    if (typeof input.isActive === 'boolean') {
      data.isActive = input.isActive;
    }

    return prisma.minimumStockThreshold.update({
      where: { id },
      data,
      include: {
        product: {
          select: { id: true, sku: true, name: true },
        },
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  /**
   * Deletes a minimum stock threshold.
   */
  public async deleteThreshold(
    id: string,
    user: { userId: string; role: UserRole }
  ): Promise<{ message: string; deletedId: string }> {
    if (user.role === UserRole.CUSTOMER || user.role === UserRole.WAREHOUSE_STAFF) {
      throw new ForbiddenError(
        `Access denied. Role '${user.role}' is not authorized to delete inventory thresholds.`,
        'FORBIDDEN'
      );
    }

    const existing = await prisma.minimumStockThreshold.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Minimum stock threshold with ID '${id}' not found`);
    }

    if (existing.warehouseId === null) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError('Only administrators can delete organization-wide default thresholds.');
      }
    } else {
      if (user.role === UserRole.WAREHOUSE_MANAGER) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, existing.warehouseId);
      }
    }

    await prisma.minimumStockThreshold.delete({
      where: { id },
    });

    return {
      message: 'Minimum stock threshold deleted successfully',
      deletedId: id,
    };
  }
}

export const thresholdService = new ThresholdService();

