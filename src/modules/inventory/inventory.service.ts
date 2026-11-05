import { MovementType, OrderStatus, Prisma, ReservationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ForbiddenError, NotFoundError } from '../../common/errors/app-error';
import { AddStockInput, InventoryQuery, MovementsQuery, ReservationsQuery } from './inventory.schemas';
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
  minQuantity?: number | null;
  reorderQuantity?: number | null;
  thresholdType?: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE';
  thresholdId?: string | null;
  isLowStock?: boolean;
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

export interface InventoryMetricsSummary {
  totalSkus: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockCount: number;
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
    const { productId, warehouseId, quantity, notes, referenceId, supplier } = input;

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

    // 4. Format movement notes
    let movementNotes = notes || 'Stock replenishment';
    if (supplier) {
      movementNotes = `Supplier: ${supplier}${notes ? ` | ${notes}` : ''}`;
    }

    // 5. Execute atomic transaction: Upsert inventory + Insert movement ledger
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
          referenceId: referenceId || null,
          notes: movementNotes,
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
    const andConditions: Prisma.InventoryWhereInput[] = [];

    if (query.warehouseId) {
      andConditions.push({ warehouseId: query.warehouseId });
    } else if (user && (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF)) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
      andConditions.push({ warehouseId: { in: accessibleIds as string[] } });
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      andConditions.push({
        OR: [
          { product: { name: { contains: q, mode: 'insensitive' } } },
          { product: { sku: { contains: q, mode: 'insensitive' } } },
          { warehouse: { name: { contains: q, mode: 'insensitive' } } },
          { warehouse: { code: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.InventoryWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [items, activeThresholds] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: { id: true, sku: true, name: true, priceCents: true },
          },
          warehouse: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: [{ warehouse: { code: 'asc' } }, { product: { name: 'asc' } }],
      }),
      prisma.minimumStockThreshold.findMany({
        where: { isActive: true },
      }),
    ]);

    const warehouseThresholdMap = new Map<string, { id: string; minQuantity: number; reorderQuantity: number | null }>();
    const globalThresholdMap = new Map<string, { id: string; minQuantity: number; reorderQuantity: number | null }>();

    for (const t of activeThresholds) {
      if (t.warehouseId) {
        warehouseThresholdMap.set(`${t.productId}_${t.warehouseId}`, {
          id: t.id,
          minQuantity: t.minQuantity,
          reorderQuantity: t.reorderQuantity,
        });
      } else {
        globalThresholdMap.set(t.productId, {
          id: t.id,
          minQuantity: t.minQuantity,
          reorderQuantity: t.reorderQuantity,
        });
      }
    }

    let results = items.map((item) => {
      const quantityAvailable = item.quantityOnHand - item.quantityReserved;
      const whThresh = warehouseThresholdMap.get(`${item.productId}_${item.warehouseId}`);
      const globalThresh = globalThresholdMap.get(item.productId);

      let minQuantity: number | null = null;
      let reorderQuantity: number | null = null;
      let thresholdType: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE' = 'NONE';
      let thresholdId: string | null = null;
      let isLowStock = false;

      if (whThresh) {
        minQuantity = whThresh.minQuantity;
        reorderQuantity = whThresh.reorderQuantity;
        thresholdType = 'WAREHOUSE_OVERRIDE';
        thresholdId = whThresh.id;
        isLowStock = quantityAvailable < whThresh.minQuantity;
      } else if (globalThresh) {
        minQuantity = globalThresh.minQuantity;
        reorderQuantity = globalThresh.reorderQuantity;
        thresholdType = 'GLOBAL_DEFAULT';
        thresholdId = globalThresh.id;
        isLowStock = quantityAvailable < globalThresh.minQuantity;
      }

      return {
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantityOnHand: item.quantityOnHand,
        quantityReserved: item.quantityReserved,
        quantityAvailable,
        minQuantity,
        reorderQuantity,
        thresholdType,
        thresholdId,
        isLowStock,
        product: item.product,
        warehouse: item.warehouse,
      };
    });

    if (query.lowStockOnly === 'true') {
      results = results.filter((r) => r.isLowStock);
    }

    return results;
  }

  /**
   * Retrieves all inventory items stored at a specific warehouse with threshold enrichment.
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

    const [records, activeThresholds] = await Promise.all([
      prisma.inventory.findMany({
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
      }),
      prisma.minimumStockThreshold.findMany({
        where: {
          isActive: true,
          OR: [{ warehouseId }, { warehouseId: null }],
        },
      }),
    ]);

    const warehouseThresholdMap = new Map<string, { id: string; minQuantity: number; reorderQuantity: number | null }>();
    const globalThresholdMap = new Map<string, { id: string; minQuantity: number; reorderQuantity: number | null }>();

    for (const t of activeThresholds) {
      if (t.warehouseId === warehouseId) {
        warehouseThresholdMap.set(t.productId, {
          id: t.id,
          minQuantity: t.minQuantity,
          reorderQuantity: t.reorderQuantity,
        });
      } else if (t.warehouseId === null) {
        globalThresholdMap.set(t.productId, {
          id: t.id,
          minQuantity: t.minQuantity,
          reorderQuantity: t.reorderQuantity,
        });
      }
    }

    return records.map((item) => {
      const quantityAvailable = item.quantityOnHand - item.quantityReserved;
      const whThresh = warehouseThresholdMap.get(item.productId);
      const globalThresh = globalThresholdMap.get(item.productId);

      let minQuantity: number | null = null;
      let reorderQuantity: number | null = null;
      let thresholdType: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE' = 'NONE';
      let thresholdId: string | null = null;
      let isLowStock = false;

      if (whThresh) {
        minQuantity = whThresh.minQuantity;
        reorderQuantity = whThresh.reorderQuantity;
        thresholdType = 'WAREHOUSE_OVERRIDE';
        thresholdId = whThresh.id;
        isLowStock = quantityAvailable < whThresh.minQuantity;
      } else if (globalThresh) {
        minQuantity = globalThresh.minQuantity;
        reorderQuantity = globalThresh.reorderQuantity;
        thresholdType = 'GLOBAL_DEFAULT';
        thresholdId = globalThresh.id;
        isLowStock = quantityAvailable < globalThresh.minQuantity;
      }

      return {
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantityOnHand: item.quantityOnHand,
        quantityReserved: item.quantityReserved,
        quantityAvailable,
        minQuantity,
        reorderQuantity,
        thresholdType,
        thresholdId,
        isLowStock,
        product: item.product,
        warehouse: item.warehouse,
      };
    });
  }

  /**
   * Retrieves paginated inventory movement history (immutable ledger).
   * Supports filtering by product, warehouse, movement type, reference ID, search query, and date range.
   * RBAC:
   * - ADMIN: Org-wide movements across all facilities.
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Strictly restricted to assigned warehouses.
   * - CUSTOMER: Forbidden.
   */
  public async getMovements(
    query: MovementsQuery,
    user: { userId: string; role: UserRole }
  ): Promise<{
    movements: any[];
    pagination: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
    };
  }> {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect inventory movements.',
        'FORBIDDEN'
      );
    }

    const andConditions: Prisma.InventoryMovementWhereInput[] = [];

    // RBAC warehouse scoping
    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      if (query.warehouseId) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, query.warehouseId);
        andConditions.push({ warehouseId: query.warehouseId });
      } else {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
        andConditions.push({ warehouseId: { in: accessibleIds as string[] } });
      }
    } else if (query.warehouseId) {
      andConditions.push({ warehouseId: query.warehouseId });
    }

    if (query.productId) {
      andConditions.push({ productId: query.productId });
    }

    if (query.movementType) {
      andConditions.push({ movementType: query.movementType });
    }

    if (query.referenceId) {
      const isRefUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(query.referenceId);
      if (isRefUuid) {
        andConditions.push({ referenceId: query.referenceId });
      } else {
        andConditions.push({ notes: { contains: query.referenceId, mode: 'insensitive' } });
      }
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.gte = start;
        }
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          if (query.endDate.length <= 10) {
            end.setHours(23, 59, 59, 999);
          }
          dateFilter.lte = end;
        }
      }
      andConditions.push({ createdAt: dateFilter });
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(q);
      const searchOr: Prisma.InventoryMovementWhereInput[] = [
        { notes: { contains: q, mode: 'insensitive' } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { product: { sku: { contains: q, mode: 'insensitive' } } },
        { warehouse: { name: { contains: q, mode: 'insensitive' } } },
        { warehouse: { code: { contains: q, mode: 'insensitive' } } },
      ];
      if (isUuid) {
        searchOr.push({ referenceId: q }, { id: q });
      }
      andConditions.push({ OR: searchOr });
    }

    const where: Prisma.InventoryMovementWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [totalRecords, movements] = await Promise.all([
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: { id: true, sku: true, name: true, priceCents: true },
          },
          warehouse: {
            select: { id: true, code: true, name: true },
          },
        },
      }),
    ]);

    const formattedMovements = movements.map((m) => {
      let actor: string | null = null;
      if (m.notes) {
        const actorMatch = m.notes.match(/(?:Actor|Operator|User):\s*([^\s|,]+)/i);
        if (actorMatch) {
          actor = actorMatch[1];
        }
      }

      return {
        id: m.id,
        productId: m.productId,
        warehouseId: m.warehouseId,
        quantityDelta: m.quantityDelta,
        movementType: m.movementType,
        referenceId: m.referenceId,
        notes: m.notes,
        actor,
        createdAt: m.createdAt,
        product: m.product,
        warehouse: m.warehouse,
      };
    });

    return {
      movements: formattedMovements,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  /**
   * Retrieves paginated inventory reservations.
   * Distinguishes between active checkout reservations and paid committed allocations.
   * Paid confirmed orders (CONFIRMED, PROCESSING, SHIPPED, DELIVERED) do not show as expired.
   * RBAC:
   * - ADMIN: Org-wide reservations across all facilities.
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Strictly restricted to assigned warehouses.
   * - CUSTOMER: Forbidden.
   */
  public async getReservations(
    query: ReservationsQuery,
    user: { userId: string; role: UserRole }
  ): Promise<{
    reservations: any[];
    pagination: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
    };
  }> {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect inventory reservations.',
        'FORBIDDEN'
      );
    }

    const andConditions: Prisma.InventoryReservationWhereInput[] = [];

    // RBAC warehouse scoping via inventory relation
    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      if (query.warehouseId) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, query.warehouseId);
        andConditions.push({ inventory: { warehouseId: query.warehouseId } });
      } else {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
        andConditions.push({ inventory: { warehouseId: { in: accessibleIds as string[] } } });
      }
    } else if (query.warehouseId) {
      andConditions.push({ inventory: { warehouseId: query.warehouseId } });
    }

    if (query.productId) {
      andConditions.push({ inventory: { productId: query.productId } });
    }

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.orderId) {
      andConditions.push({ orderId: query.orderId });
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(q);
      const searchOr: Prisma.InventoryReservationWhereInput[] = [
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { inventory: { product: { name: { contains: q, mode: 'insensitive' } } } },
        { inventory: { product: { sku: { contains: q, mode: 'insensitive' } } } },
        { inventory: { warehouse: { name: { contains: q, mode: 'insensitive' } } } },
        { inventory: { warehouse: { code: { contains: q, mode: 'insensitive' } } } },
      ];
      if (isUuid) {
        searchOr.push({ orderId: q }, { id: q });
      }
      andConditions.push({ OR: searchOr });
    }

    const where: Prisma.InventoryReservationWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [totalRecords, reservations] = await Promise.all([
      prisma.inventoryReservation.count({ where }),
      prisma.inventoryReservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmountCents: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          inventory: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, priceCents: true },
              },
              warehouse: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      }),
    ]);

    const paidStatuses: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    const data = reservations.map((res) => {
      const isPaid = paidStatuses.includes(res.order.status);
      const isExpired = !isPaid && res.status === ReservationStatus.ACTIVE && new Date(res.expiresAt) < new Date();
      let displayStatus = res.status as string;
      if (isPaid && res.status === ReservationStatus.ACTIVE) {
        displayStatus = 'COMMITTED';
      } else if (isExpired) {
        displayStatus = 'EXPIRED';
      }

      return {
        id: res.id,
        orderId: res.orderId,
        inventoryId: res.inventoryId,
        quantity: res.quantity,
        status: res.status,
        expiresAt: res.expiresAt,
        createdAt: res.createdAt,
        updatedAt: res.updatedAt,
        isPaid,
        isExpired,
        displayStatus,
        order: res.order,
        product: res.inventory.product,
        warehouse: res.inventory.warehouse,
      };
    });

    return {
      reservations: data,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  /**
   * Computes inventory summary metrics (Total SKUs, Physical Stock, Reserved Stock, Available Stock, Low Stock count)
   * Scoped to authorized facilities based on caller role.
   */
  public async getMetrics(
    warehouseId?: string,
    user?: { userId: string; role: UserRole }
  ): Promise<InventoryMetricsSummary> {
    if (!user) {
      throw new ForbiddenError('Authentication required to inspect inventory metrics.', 'AUTH_REQUIRED');
    }
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Access denied. Customers cannot view inventory metrics.', 'FORBIDDEN');
    }

    const where: Prisma.InventoryWhereInput = {};
    if (warehouseId) {
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, warehouseId);
      }
      where.warehouseId = warehouseId;
    } else if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
      where.warehouseId = { in: accessibleIds as string[] };
    }

    const [items, activeThresholds] = await Promise.all([
      prisma.inventory.findMany({
        where,
        select: {
          productId: true,
          warehouseId: true,
          quantityOnHand: true,
          quantityReserved: true,
        },
      }),
      prisma.minimumStockThreshold.findMany({
        where: { isActive: true },
      }),
    ]);

    const warehouseThresholdMap = new Map<string, number>();
    const globalThresholdMap = new Map<string, number>();
    for (const t of activeThresholds) {
      if (t.warehouseId) {
        warehouseThresholdMap.set(`${t.productId}_${t.warehouseId}`, t.minQuantity);
      } else {
        globalThresholdMap.set(t.productId, t.minQuantity);
      }
    }

    let totalOnHand = 0;
    let totalReserved = 0;
    let lowStockCount = 0;
    const uniqueProductIds = new Set<string>();

    for (const item of items) {
      uniqueProductIds.add(item.productId);
      totalOnHand += item.quantityOnHand;
      totalReserved += item.quantityReserved;
      const available = item.quantityOnHand - item.quantityReserved;

      const overrideMin = warehouseThresholdMap.get(`${item.productId}_${item.warehouseId}`);
      const globalMin = globalThresholdMap.get(item.productId);
      const effectiveMin = overrideMin !== undefined ? overrideMin : globalMin;

      if (effectiveMin !== undefined && available < effectiveMin) {
        lowStockCount++;
      }
    }

    return {
      totalSkus: uniqueProductIds.size,
      totalOnHand,
      totalReserved,
      totalAvailable: totalOnHand - totalReserved,
      lowStockCount,
    };
  }
}

export const inventoryService = new InventoryService();
