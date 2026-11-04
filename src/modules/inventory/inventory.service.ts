import { MovementType, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ForbiddenError, NotFoundError } from '../../common/errors/app-error';
import { AddStockInput, InventoryQuery } from './inventory.schemas';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { thresholdEvaluationService } from './threshold-evaluation.service';

export interface RestockResult {
  inventoryId: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  movementId: string;
}

export interface InventoryDetail {
  id: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  product?: {
    id: string;
    sku: string;
    name: string;
    priceCents: number;
  };
  warehouse?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface ProductInventoryOverview {
  productId: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  breakdown: Array<{
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    quantityOnHand: number;
    quantityReserved: number;
    quantityAvailable: number;
  }>;
}

export class InventoryService {
  /**
   * Adds physical stock to a warehouse for a product.
   * Atomically upserts the inventory record and logs an immutable inventory movement.
   */
  public async addStock(
    input: AddStockInput,
    user?: { userId: string; role: UserRole }
  ): Promise<RestockResult> {
    const { productId, warehouseId, quantity, notes } = input;

    // 1. Validate Product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError(`Product with ID '${productId}' not found`);
    }

    // 2. Validate Warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${warehouseId}' not found`);
    }

    // 3. Enforce warehouse assignment permissions
    if (user) {
      if (user.role === UserRole.CUSTOMER) {
        throw new ForbiddenError(
          'Access denied. Customers are not authorized to modify warehouse inventory.',
          'FORBIDDEN'
        );
      }
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, warehouseId);
      }
    }

    // 3. Execute atomic transaction: Upsert inventory + Insert movement ledger
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId,
            warehouseId,
          },
        },
        create: {
          productId,
          warehouseId,
          quantityOnHand: quantity,
          quantityReserved: 0,
        },
        update: {
          quantityOnHand: {
            increment: quantity,
          },
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          warehouseId,
          quantityDelta: quantity,
          movementType: MovementType.RESTOCK,
          notes: notes || 'Stock replenishment',
        },
      });

      const quantityAvailable = inventory.quantityOnHand - inventory.quantityReserved;

      return {
        inventoryId: inventory.id,
        productId: inventory.productId,
        warehouseId: inventory.warehouseId,
        quantityOnHand: inventory.quantityOnHand,
        quantityReserved: inventory.quantityReserved,
        quantityAvailable,
        movementId: movement.id,
      };
    });

    // Evaluate stock against configured thresholds following restock commit
    await thresholdEvaluationService.evaluateStockAfterChange(productId, warehouseId);

    return result;
  }

  /**
   * Retrieves global inventory or product-specific breakdown across warehouses.
   * Authorization Rules:
   * - ADMIN: Organization-wide inventory visibility across all facilities.
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Strictly restricted to their assigned warehouses.
   *   Aggregated figures and product breakdowns will never include stock from unauthorized facilities.
   * - CUSTOMER: Completely forbidden from inspecting internal inventory ledgers.
   */
  public async getInventory(
    query: InventoryQuery,
    user?: { userId: string; role: UserRole }
  ): Promise<ProductInventoryOverview | InventoryDetail[]> {
    // 1. Role-based security validation
    if (!user) {
      throw new ForbiddenError(
        'Authentication required to inspect internal inventory ledgers.',
        'AUTH_REQUIRED'
      );
    }

    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect internal warehouse inventory.',
        'FORBIDDEN'
      );
    }
    if (query.warehouseId) {
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, query.warehouseId);
      }
    }

    // 2. Product-specific inventory breakdown
    if (query.productId) {
      const product = await prisma.product.findUnique({
        where: { id: query.productId },
      });
      if (!product) {
        throw new NotFoundError(`Product with ID '${query.productId}' not found`);
      }

      const where: Prisma.InventoryWhereInput = {
        productId: query.productId,
      };

      if (query.warehouseId) {
        where.warehouseId = query.warehouseId;
      } else if (user && (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF)) {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(
          user.userId,
          user.role
        );
        where.warehouseId = { in: accessibleIds as string[] };
      }

      const records = await prisma.inventory.findMany({
        where,
        include: { warehouse: true },
        orderBy: { warehouse: { code: 'asc' } },
      });

      let totalOnHand = 0;
      let totalReserved = 0;

      const breakdown = records.map((rec) => {
        totalOnHand += rec.quantityOnHand;
        totalReserved += rec.quantityReserved;
        return {
          warehouseId: rec.warehouseId,
          warehouseCode: rec.warehouse.code,
          warehouseName: rec.warehouse.name,
          quantityOnHand: rec.quantityOnHand,
          quantityReserved: rec.quantityReserved,
          quantityAvailable: rec.quantityOnHand - rec.quantityReserved,
        };
      });

      return {
        productId: query.productId,
        totalOnHand,
        totalReserved,
        totalAvailable: totalOnHand - totalReserved,
        breakdown,
      };
    }

    // 3. General inventory list across authorized warehouses
    const where: Prisma.InventoryWhereInput = {};
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    } else if (user && (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF)) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
      where.warehouseId = { in: accessibleIds as string[] };
    }

    const items = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: { id: true, sku: true, name: true, priceCents: true },
        },
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      id: item.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
      quantityAvailable: item.quantityOnHand - item.quantityReserved,
      product: item.product,
      warehouse: item.warehouse,
    }));
  }

  /**
   * Retrieves all inventory items stored at a specific warehouse.
   */
  public async getInventoryByWarehouse(
    warehouseId: string,
    user?: { userId: string; role: UserRole }
  ): Promise<InventoryDetail[]> {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${warehouseId}' not found`);
    }

    if (!user) {
      throw new ForbiddenError(
        'Authentication required to inspect warehouse inventory.',
        'AUTH_REQUIRED'
      );
    }

    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect internal warehouse inventory.',
        'FORBIDDEN'
      );
    }
    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, warehouseId);
    }

    const records = await prisma.inventory.findMany({
      where: { warehouseId },
      include: {
        product: {
          select: { id: true, sku: true, name: true, priceCents: true },
        },
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((item) => ({
      id: item.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
      quantityAvailable: item.quantityOnHand - item.quantityReserved,
      product: item.product,
      warehouse: item.warehouse,
    }));
  }
}

export const inventoryService = new InventoryService();

