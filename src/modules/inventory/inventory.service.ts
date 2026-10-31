import { MovementType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { NotFoundError } from '../../common/errors/app-error';
import { AddStockInput, InventoryQuery } from './inventory.schemas';

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
  public async addStock(input: AddStockInput): Promise<RestockResult> {
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

    // 3. Execute atomic transaction: Upsert inventory + Insert movement ledger
    return prisma.$transaction(async (tx) => {
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
  }

  /**
   * Retrieves global inventory or product-specific breakdown across warehouses.
   */
  public async getInventory(query: InventoryQuery): Promise<ProductInventoryOverview | InventoryDetail[]> {
    if (query.productId) {
      const product = await prisma.product.findUnique({
        where: { id: query.productId },
      });
      if (!product) {
        throw new NotFoundError(`Product with ID '${query.productId}' not found`);
      }

      const records = await prisma.inventory.findMany({
        where: { productId: query.productId },
        include: { warehouse: true },
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

    const where: { warehouseId?: string } = {};
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
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
  public async getInventoryByWarehouse(warehouseId: string): Promise<InventoryDetail[]> {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${warehouseId}' not found`);
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

