import { MovementType, OrderStatus, Prisma, TicketPriority, TicketStatus, TicketType, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ForbiddenError, NotFoundError } from '../../common/errors/app-error';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { AnalyticsQuery } from './analytics.schemas';

export interface DashboardKPIs {
  totalProducts: number;
  totalPhysicalInventory: number;
  totalReservedInventory: number;
  totalAvailableInventory: number;
  lowStockCount: number;
  pendingOrders: number;
  ordersAwaitingProcessing: number;
  ordersAwaitingDispatch: number;
  activeTickets: number;
  activeWarehouses: number;
}

export interface InventoryDistributionItem {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockCount: number;
}

export interface LowStockItemSummary {
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  minQuantity: number;
  deficit: number;
}

export interface MovementTrendDataPoint {
  date: string;
  restockCount: number;
  restockQuantity: number;
  dispatchCount: number;
  dispatchQuantity: number;
  adjustmentCount: number;
  adjustmentQuantity: number;
}

export interface TopShortageItem {
  productId: string;
  sku: string;
  name: string;
  totalShortageQuantity: number;
  affectedOrdersCount: number;
  activeTicketsCount: number;
}

export interface InventoryAnalyticsResult {
  stockDistribution: InventoryDistributionItem[];
  lowStockSummary: LowStockItemSummary[];
  movementTrends: MovementTrendDataPoint[];
  topShortages: TopShortageItem[];
}

export interface OrderStatusBreakdown {
  status: OrderStatus;
  count: number;
  percentage: number;
}

export interface OrdersOverTimeDataPoint {
  date: string;
  totalOrders: number;
  totalAmountCents: number;
  confirmedCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
}

export interface OrderAnalyticsResult {
  byStatus: OrderStatusBreakdown[];
  ordersOverTime: OrdersOverTimeDataPoint[];
  backlog: {
    awaitingProcessingCount: number;
    awaitingDispatchCount: number;
    totalBacklog: number;
  };
  deliveredCount: number;
  cancellationTrends: {
    cancelledCount: number;
    cancellationRate: number;
  };
}

export interface WarehousePerformanceItem {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  isActive: boolean;
  city: string;
  country: string;
  inventoryOnHand: number;
  inventoryReserved: number;
  inventoryAvailable: number;
  lowStockCount: number;
  ordersFulfilledCount: number;
  dispatchedVolume: number;
  activeTicketsCount: number;
}

export interface OperationalAlertItem {
  id: string;
  type: 'LOW_STOCK' | 'AWAITING_PROCESSING' | 'AWAITING_DISPATCH' | 'SHORTAGE_TICKET' | 'CUSTOMER_DECISION' | 'MANAGER_APPROVAL';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  targetUrl: string;
  entityId: string;
}

export interface OperationalAlertsResult {
  totalAlerts: number;
  alerts: OperationalAlertItem[];
}

export interface DashboardOverviewResult {
  timeRange: string;
  startDate: string;
  endDate: string;
  warehouseId: string | null;
  kpis: DashboardKPIs;
  inventory: InventoryAnalyticsResult;
  orders: OrderAnalyticsResult;
  warehouses: WarehousePerformanceItem[];
  alerts: OperationalAlertsResult;
}

export class AnalyticsService {
  /**
   * Computes the ISO start and end timestamps for the requested time range.
   */
  public resolveTimeWindow(query: AnalyticsQuery): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;

    if (query.timeRange === 'custom' && query.startDate) {
      return { startDate: new Date(query.startDate), endDate };
    }

    if (query.timeRange === 'today') {
      const startOfToday = new Date(now);
      startOfToday.setUTCHours(0, 0, 0, 0);
      return { startDate: startOfToday, endDate };
    }

    const days = query.timeRange === '90d' ? 90 : query.timeRange === '30d' ? 30 : 7;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
  }

  /**
   * Resolves the warehouse scope based on user role and optional requested warehouseId.
   * Throws ForbiddenError if customer or unauthorized facility access.
   */
  public async resolveAccessibleWarehouseIds(
    user: { userId: string; role: UserRole },
    requestedWarehouseId?: string
  ): Promise<string[] | 'ALL'> {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to access internal business analytics.',
        'FORBIDDEN'
      );
    }

    if (user.role === UserRole.ADMIN) {
      if (requestedWarehouseId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: requestedWarehouseId } });
        if (!wh) {
          throw new NotFoundError(`Warehouse with ID '${requestedWarehouseId}' not found`);
        }
        return [requestedWarehouseId];
      }
      return 'ALL';
    }

    // Role is WAREHOUSE_MANAGER or WAREHOUSE_STAFF
    const accessible = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
    const assignedIds = Array.isArray(accessible) ? accessible : [];

    if (requestedWarehouseId) {
      if (!assignedIds.includes(requestedWarehouseId)) {
        throw new ForbiddenError(
          `Access denied to warehouse '${requestedWarehouseId}'. You do not have an active assignment to this facility.`,
          'FORBIDDEN_WAREHOUSE_ACCESS'
        );
      }
      return [requestedWarehouseId];
    }

    return assignedIds;
  }

  /**
   * Retrieves high-level operational KPI metrics.
   */
  public async getKpis(
    user: { userId: string; role: UserRole },
    query: AnalyticsQuery
  ): Promise<DashboardKPIs> {
    const warehouseScope = await this.resolveAccessibleWarehouseIds(user, query.warehouseId);

    // If staff/manager has zero assigned warehouses
    if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
      const totalProducts = await prisma.product.count({ where: { isActive: true } });
      return {
        totalProducts,
        totalPhysicalInventory: 0,
        totalReservedInventory: 0,
        totalAvailableInventory: 0,
        lowStockCount: 0,
        pendingOrders: 0,
        ordersAwaitingProcessing: 0,
        ordersAwaitingDispatch: 0,
        activeTickets: 0,
        activeWarehouses: 0,
      };
    }

    // Build Prisma where clauses
    const inventoryWhere: Prisma.InventoryWhereInput = {};
    const orderItemsWhere: Prisma.OrderItemWhereInput = {};
    const ticketWhere: Prisma.TicketWhereInput = {};
    const warehouseWhere: Prisma.WarehouseWhereInput = { isActive: true };

    if (warehouseScope !== 'ALL') {
      inventoryWhere.warehouseId = { in: warehouseScope };
      orderItemsWhere.warehouseId = { in: warehouseScope };
      ticketWhere.warehouseId = { in: warehouseScope };
      warehouseWhere.id = { in: warehouseScope };
    }

    const [
      totalProducts,
      activeWarehouses,
      inventoryRecords,
      activeThresholds,
      pendingOrdersCount,
      confirmedOrdersCount,
      processingOrdersCount,
      activeTicketsCount,
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.warehouse.count({ where: warehouseWhere }),
      prisma.inventory.findMany({
        where: inventoryWhere,
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
      // Orders counts
      prisma.order.count({
        where: {
          status: OrderStatus.PENDING,
          ...(warehouseScope !== 'ALL'
            ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } }
            : {}),
        },
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.CONFIRMED,
          ...(warehouseScope !== 'ALL'
            ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } }
            : {}),
        },
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.PROCESSING,
          ...(warehouseScope !== 'ALL'
            ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } }
            : {}),
        },
      }),
      // Active tickets
      prisma.ticket.count({
        where: {
          status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING] },
          ...(warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {}),
        },
      }),
    ]);

    // Build threshold maps
    const whThresholdMap = new Map<string, number>();
    const globalThresholdMap = new Map<string, number>();
    for (const t of activeThresholds) {
      if (t.warehouseId) {
        whThresholdMap.set(`${t.productId}_${t.warehouseId}`, t.minQuantity);
      } else {
        globalThresholdMap.set(t.productId, t.minQuantity);
      }
    }

    let totalPhysicalInventory = 0;
    let totalReservedInventory = 0;
    let lowStockCount = 0;

    for (const item of inventoryRecords) {
      totalPhysicalInventory += item.quantityOnHand;
      totalReservedInventory += item.quantityReserved;
      const available = item.quantityOnHand - item.quantityReserved;

      const overrideMin = whThresholdMap.get(`${item.productId}_${item.warehouseId}`);
      const globalMin = globalThresholdMap.get(item.productId);
      const effectiveMin = overrideMin !== undefined ? overrideMin : globalMin;

      if (effectiveMin !== undefined && available < effectiveMin) {
        lowStockCount++;
      }
    }

    return {
      totalProducts,
      totalPhysicalInventory,
      totalReservedInventory,
      totalAvailableInventory: totalPhysicalInventory - totalReservedInventory,
      lowStockCount,
      pendingOrders: pendingOrdersCount,
      ordersAwaitingProcessing: confirmedOrdersCount,
      ordersAwaitingDispatch: processingOrdersCount,
      activeTickets: activeTicketsCount,
      activeWarehouses,
    };
  }

  /**
   * Retrieves detailed inventory analytics including stock distribution, low stock summary,
   * movement trends (restock vs dispatch over time), and top shortages.
   */
  public async getInventoryAnalytics(
    user: { userId: string; role: UserRole },
    query: AnalyticsQuery
  ): Promise<InventoryAnalyticsResult> {
    const warehouseScope = await this.resolveAccessibleWarehouseIds(user, query.warehouseId);
    const { startDate, endDate } = this.resolveTimeWindow(query);

    if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
      return {
        stockDistribution: [],
        lowStockSummary: [],
        movementTrends: [],
        topShortages: [],
      };
    }

    const inventoryWhere: Prisma.InventoryWhereInput = {};
    const warehouseWhere: Prisma.WarehouseWhereInput = { isActive: true };
    const movementWhere: Prisma.InventoryMovementWhereInput = {
      createdAt: { gte: startDate, lte: endDate },
    };

    if (warehouseScope !== 'ALL') {
      inventoryWhere.warehouseId = { in: warehouseScope };
      warehouseWhere.id = { in: warehouseScope };
      movementWhere.warehouseId = { in: warehouseScope };
    }

    const [warehouses, inventoryRecords, activeThresholds, movements, shortageTickets] =
      await Promise.all([
        prisma.warehouse.findMany({
          where: warehouseWhere,
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        }),
        prisma.inventory.findMany({
          where: inventoryWhere,
          include: {
            product: { select: { id: true, sku: true, name: true, priceCents: true } },
            warehouse: { select: { id: true, code: true, name: true } },
          },
        }),
        prisma.minimumStockThreshold.findMany({
          where: { isActive: true },
        }),
        prisma.inventoryMovement.findMany({
          where: movementWhere,
          select: {
            movementType: true,
            quantityDelta: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.ticket.findMany({
          where: {
            type: { in: [TicketType.ORDER_SHORTAGE, TicketType.LOW_STOCK] },
            status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING] },
            ...(warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {}),
          },
          select: {
            productId: true,
            shortageQuantity: true,
            deficitQuantity: true,
            orderId: true,
          },
        }),
      ]);

    // Build threshold maps
    const whThresholdMap = new Map<string, number>();
    const globalThresholdMap = new Map<string, number>();
    for (const t of activeThresholds) {
      if (t.warehouseId) {
        whThresholdMap.set(`${t.productId}_${t.warehouseId}`, t.minQuantity);
      } else {
        globalThresholdMap.set(t.productId, t.minQuantity);
      }
    }

    // 1. Stock Distribution by Warehouse
    const distributionMap = new Map<string, InventoryDistributionItem>();
    for (const wh of warehouses) {
      distributionMap.set(wh.id, {
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        onHand: 0,
        reserved: 0,
        available: 0,
        lowStockCount: 0,
      });
    }

    const lowStockItems: LowStockItemSummary[] = [];

    for (const item of inventoryRecords) {
      const available = item.quantityOnHand - item.quantityReserved;
      const whEntry = distributionMap.get(item.warehouseId);
      if (whEntry) {
        whEntry.onHand += item.quantityOnHand;
        whEntry.reserved += item.quantityReserved;
        whEntry.available += available;
      }

      const overrideMin = whThresholdMap.get(`${item.productId}_${item.warehouseId}`);
      const globalMin = globalThresholdMap.get(item.productId);
      const effectiveMin = overrideMin !== undefined ? overrideMin : globalMin;

      if (effectiveMin !== undefined && available < effectiveMin) {
        if (whEntry) {
          whEntry.lowStockCount++;
        }
        lowStockItems.push({
          productId: item.productId,
          sku: item.product.sku,
          name: item.product.name,
          warehouseId: item.warehouseId,
          warehouseCode: item.warehouse.code,
          warehouseName: item.warehouse.name,
          quantityOnHand: item.quantityOnHand,
          quantityReserved: item.quantityReserved,
          quantityAvailable: available,
          minQuantity: effectiveMin,
          deficit: effectiveMin - available,
        });
      }
    }

    // Sort low stock by deficit descending
    lowStockItems.sort((a, b) => b.deficit - a.deficit);

    // 2. Movement Trends (Grouped by Day)
    const trendsByDate = new Map<string, MovementTrendDataPoint>();

    // Seed continuous dates across window to prevent missing intervals
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      trendsByDate.set(dateKey, {
        date: dateKey,
        restockCount: 0,
        restockQuantity: 0,
        dispatchCount: 0,
        dispatchQuantity: 0,
        adjustmentCount: 0,
        adjustmentQuantity: 0,
      });
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    for (const m of movements) {
      const dateKey = m.createdAt.toISOString().split('T')[0];
      let entry = trendsByDate.get(dateKey);
      if (!entry) {
        entry = {
          date: dateKey,
          restockCount: 0,
          restockQuantity: 0,
          dispatchCount: 0,
          dispatchQuantity: 0,
          adjustmentCount: 0,
          adjustmentQuantity: 0,
        };
        trendsByDate.set(dateKey, entry);
      }

      const absQty = Math.abs(m.quantityDelta);
      if (m.movementType === MovementType.RESTOCK) {
        entry.restockCount++;
        entry.restockQuantity += absQty;
      } else if (
        m.movementType === MovementType.DISPATCH ||
        m.movementType === MovementType.FULFILLMENT_DEDUCTION
      ) {
        entry.dispatchCount++;
        entry.dispatchQuantity += absQty;
      } else {
        entry.adjustmentCount++;
        entry.adjustmentQuantity += absQty;
      }
    }

    const movementTrends = Array.from(trendsByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // 3. Top Shortages
    const shortageMap = new Map<
      string,
      { totalShortageQuantity: number; orderIds: Set<string>; ticketCount: number }
    >();

    for (const t of shortageTickets) {
      if (!t.productId) continue;
      const qty = t.shortageQuantity ?? t.deficitQuantity ?? 0;
      if (!shortageMap.has(t.productId)) {
        shortageMap.set(t.productId, {
          totalShortageQuantity: 0,
          orderIds: new Set<string>(),
          ticketCount: 0,
        });
      }
      const s = shortageMap.get(t.productId)!;
      s.totalShortageQuantity += qty;
      s.ticketCount++;
      if (t.orderId) {
        s.orderIds.add(t.orderId);
      }
    }

    // Also include deficits from inventory items with zero tickets
    for (const item of lowStockItems) {
      if (!shortageMap.has(item.productId)) {
        shortageMap.set(item.productId, {
          totalShortageQuantity: item.deficit,
          orderIds: new Set<string>(),
          ticketCount: 0,
        });
      }
    }

    const productIds = Array.from(shortageMap.keys());
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name: true },
    });
    const productInfoMap = new Map(products.map((p) => [p.id, p]));

    const topShortages: TopShortageItem[] = Array.from(shortageMap.entries())
      .map(([productId, data]) => {
        const prod = productInfoMap.get(productId);
        return {
          productId,
          sku: prod?.sku || 'UNKNOWN',
          name: prod?.name || 'Unknown Product',
          totalShortageQuantity: data.totalShortageQuantity,
          affectedOrdersCount: data.orderIds.size,
          activeTicketsCount: data.ticketCount,
        };
      })
      .sort((a, b) => b.totalShortageQuantity - a.totalShortageQuantity)
      .slice(0, 10);

    return {
      stockDistribution: Array.from(distributionMap.values()),
      lowStockSummary: lowStockItems.slice(0, 15),
      movementTrends,
      topShortages,
    };
  }

  /**
   * Retrieves order analytics including status breakdown, orders over time,
   * processing and dispatch backlog, and cancellation trends.
   */
  public async getOrderAnalytics(
    user: { userId: string; role: UserRole },
    query: AnalyticsQuery
  ): Promise<OrderAnalyticsResult> {
    const warehouseScope = await this.resolveAccessibleWarehouseIds(user, query.warehouseId);
    const { startDate, endDate } = this.resolveTimeWindow(query);

    if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
      return {
        byStatus: [],
        ordersOverTime: [],
        backlog: { awaitingProcessingCount: 0, awaitingDispatchCount: 0, totalBacklog: 0 },
        deliveredCount: 0,
        cancellationTrends: { cancelledCount: 0, cancellationRate: 0 },
      };
    }

    const orderWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: startDate, lte: endDate },
    };

    if (warehouseScope !== 'ALL') {
      orderWhere.orderItems = {
        some: { warehouseId: { in: warehouseScope } },
      };
    }

    // 1. Group by status in current time range
    const [statusCounts, allOrdersInPeriod, currentConfirmed, currentProcessing] = await Promise.all([
      prisma.order.groupBy({
        by: ['status'],
        where: orderWhere,
        _count: { id: true },
      }),
      prisma.order.findMany({
        where: orderWhere,
        select: {
          id: true,
          status: true,
          totalAmountCents: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Real-time backlog (current snapshot, not limited by date window)
      prisma.order.count({
        where: {
          status: OrderStatus.CONFIRMED,
          ...(warehouseScope !== 'ALL'
            ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } }
            : {}),
        },
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.PROCESSING,
          ...(warehouseScope !== 'ALL'
            ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } }
            : {}),
        },
      }),
    ]);

    const totalOrdersInPeriod = allOrdersInPeriod.length;

    const byStatus: OrderStatusBreakdown[] = Object.values(OrderStatus).map((status) => {
      const match = statusCounts.find((s) => s.status === status);
      const count = match ? match._count.id : 0;
      const percentage = totalOrdersInPeriod > 0 ? Number(((count / totalOrdersInPeriod) * 100).toFixed(1)) : 0;
      return {
        status,
        count,
        percentage,
      };
    });

    // 2. Orders Over Time
    const ordersByDate = new Map<string, OrdersOverTimeDataPoint>();

    const curr = new Date(startDate);
    while (curr <= endDate) {
      const dateKey = curr.toISOString().split('T')[0];
      ordersByDate.set(dateKey, {
        date: dateKey,
        totalOrders: 0,
        totalAmountCents: 0,
        confirmedCount: 0,
        shippedCount: 0,
        deliveredCount: 0,
        cancelledCount: 0,
      });
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    let deliveredCount = 0;
    let cancelledCount = 0;

    for (const o of allOrdersInPeriod) {
      const dateKey = o.createdAt.toISOString().split('T')[0];
      let entry = ordersByDate.get(dateKey);
      if (!entry) {
        entry = {
          date: dateKey,
          totalOrders: 0,
          totalAmountCents: 0,
          confirmedCount: 0,
          shippedCount: 0,
          deliveredCount: 0,
          cancelledCount: 0,
        };
        ordersByDate.set(dateKey, entry);
      }

      entry.totalOrders++;
      entry.totalAmountCents += o.totalAmountCents;

      if (o.status === OrderStatus.CONFIRMED) entry.confirmedCount++;
      if (o.status === OrderStatus.SHIPPED) entry.shippedCount++;
      if (o.status === OrderStatus.DELIVERED) {
        entry.deliveredCount++;
        deliveredCount++;
      }
      if (o.status === OrderStatus.CANCELLED) {
        entry.cancelledCount++;
        cancelledCount++;
      }
    }

    const ordersOverTime = Array.from(ordersByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const cancellationRate =
      totalOrdersInPeriod > 0
        ? Number(((cancelledCount / totalOrdersInPeriod) * 100).toFixed(1))
        : 0;

    return {
      byStatus,
      ordersOverTime,
      backlog: {
        awaitingProcessingCount: currentConfirmed,
        awaitingDispatchCount: currentProcessing,
        totalBacklog: currentConfirmed + currentProcessing,
      },
      deliveredCount,
      cancellationTrends: {
        cancelledCount,
        cancellationRate,
      },
    };
  }

  /**
   * Retrieves warehouse performance comparison for Admins and operational workload for Managers/Staff.
   */
  public async getWarehousePerformance(
    user: { userId: string; role: UserRole },
    query: AnalyticsQuery
  ): Promise<WarehousePerformanceItem[]> {
    const warehouseScope = await this.resolveAccessibleWarehouseIds(user, query.warehouseId);
    const { startDate, endDate } = this.resolveTimeWindow(query);

    if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
      return [];
    }

    const warehouseWhere: Prisma.WarehouseWhereInput = { isActive: true };
    if (warehouseScope !== 'ALL') {
      warehouseWhere.id = { in: warehouseScope };
    }

    const [warehouses, inventoryRecords, activeThresholds, orderItems, dispatchMovements, tickets] =
      await Promise.all([
        prisma.warehouse.findMany({
          where: warehouseWhere,
          orderBy: { code: 'asc' },
        }),
        prisma.inventory.findMany({
          where: warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {},
          select: {
            warehouseId: true,
            productId: true,
            quantityOnHand: true,
            quantityReserved: true,
          },
        }),
        prisma.minimumStockThreshold.findMany({
          where: { isActive: true },
        }),
        prisma.orderItem.findMany({
          where: {
            order: { createdAt: { gte: startDate, lte: endDate } },
            ...(warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {}),
          },
          select: {
            warehouseId: true,
            orderId: true,
          },
        }),
        prisma.inventoryMovement.findMany({
          where: {
            movementType: { in: [MovementType.DISPATCH, MovementType.FULFILLMENT_DEDUCTION] },
            createdAt: { gte: startDate, lte: endDate },
            ...(warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {}),
          },
          select: {
            warehouseId: true,
            quantityDelta: true,
          },
        }),
        prisma.ticket.findMany({
          where: {
            status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING] },
            ...(warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {}),
          },
          select: {
            warehouseId: true,
          },
        }),
      ]);

    // Build threshold maps
    const whThresholdMap = new Map<string, number>();
    const globalThresholdMap = new Map<string, number>();
    for (const t of activeThresholds) {
      if (t.warehouseId) {
        whThresholdMap.set(`${t.productId}_${t.warehouseId}`, t.minQuantity);
      } else {
        globalThresholdMap.set(t.productId, t.minQuantity);
      }
    }

    // Group inventory metrics by warehouse
    const invMap = new Map<string, { onHand: number; reserved: number; available: number; lowStock: number }>();
    for (const item of inventoryRecords) {
      if (!invMap.has(item.warehouseId)) {
        invMap.set(item.warehouseId, { onHand: 0, reserved: 0, available: 0, lowStock: 0 });
      }
      const entry = invMap.get(item.warehouseId)!;
      entry.onHand += item.quantityOnHand;
      entry.reserved += item.quantityReserved;
      const available = item.quantityOnHand - item.quantityReserved;
      entry.available += available;

      const overrideMin = whThresholdMap.get(`${item.productId}_${item.warehouseId}`);
      const globalMin = globalThresholdMap.get(item.productId);
      const effectiveMin = overrideMin !== undefined ? overrideMin : globalMin;

      if (effectiveMin !== undefined && available < effectiveMin) {
        entry.lowStock++;
      }
    }

    // Group unique orders fulfilled per warehouse
    const ordersMap = new Map<string, Set<string>>();
    for (const item of orderItems) {
      if (!ordersMap.has(item.warehouseId)) {
        ordersMap.set(item.warehouseId, new Set<string>());
      }
      ordersMap.get(item.warehouseId)!.add(item.orderId);
    }

    // Group dispatch volume per warehouse
    const dispatchMap = new Map<string, number>();
    for (const m of dispatchMovements) {
      const current = dispatchMap.get(m.warehouseId) || 0;
      dispatchMap.set(m.warehouseId, current + Math.abs(m.quantityDelta));
    }

    // Group active tickets per warehouse
    const ticketsMap = new Map<string, number>();
    for (const t of tickets) {
      if (!t.warehouseId) continue;
      const current = ticketsMap.get(t.warehouseId) || 0;
      ticketsMap.set(t.warehouseId, current + 1);
    }

    return warehouses.map((wh) => {
      const inv = invMap.get(wh.id) || { onHand: 0, reserved: 0, available: 0, lowStock: 0 };
      const fulfilledCount = ordersMap.get(wh.id)?.size || 0;
      const dispatchedVolume = dispatchMap.get(wh.id) || 0;
      const activeTicketsCount = ticketsMap.get(wh.id) || 0;

      return {
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        isActive: wh.isActive,
        city: wh.city,
        country: wh.country,
        inventoryOnHand: inv.onHand,
        inventoryReserved: inv.reserved,
        inventoryAvailable: inv.available,
        lowStockCount: inv.lowStock,
        ordersFulfilledCount: fulfilledCount,
        dispatchedVolume,
        activeTicketsCount,
      };
    });
  }

  /**
   * Retrieves real actionable operational alerts linking directly to relevant pages.
   */
  public async getOperationalAlerts(
    user: { userId: string; role: UserRole },
    query: AnalyticsQuery
  ): Promise<OperationalAlertsResult> {
    const warehouseScope = await this.resolveAccessibleWarehouseIds(user, query.warehouseId);

    if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
      return { totalAlerts: 0, alerts: [] };
    }

    const orderWhereAwaitingProcessing: Prisma.OrderWhereInput = {
      status: OrderStatus.CONFIRMED,
      ...(warehouseScope !== 'ALL' ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } } : {}),
    };

    const orderWhereAwaitingDispatch: Prisma.OrderWhereInput = {
      status: OrderStatus.PROCESSING,
      ...(warehouseScope !== 'ALL' ? { orderItems: { some: { warehouseId: { in: warehouseScope } } } } : {}),
    };

    const ticketWhere: Prisma.TicketWhereInput = {
      status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING] },
      ...(warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {}),
    };

    const [awaitingProcessingOrders, awaitingDispatchOrders, activeTickets, inventoryItems, thresholds] =
      await Promise.all([
        prisma.order.findMany({
          where: orderWhereAwaitingProcessing,
          take: 5,
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { fullName: true } },
          },
        }),
        prisma.order.findMany({
          where: orderWhereAwaitingDispatch,
          take: 5,
          orderBy: { createdAt: 'asc' },
          include: {
            orderItems: {
              select: { warehouse: { select: { code: true } } },
            },
          },
        }),
        prisma.ticket.findMany({
          where: ticketWhere,
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { sku: true, name: true } },
            warehouse: { select: { code: true } },
          },
        }),
        prisma.inventory.findMany({
          where: warehouseScope !== 'ALL' ? { warehouseId: { in: warehouseScope } } : {},
          include: {
            product: { select: { sku: true, name: true } },
            warehouse: { select: { code: true } },
          },
        }),
        prisma.minimumStockThreshold.findMany({
          where: { isActive: true },
        }),
      ]);

    const alerts: OperationalAlertItem[] = [];

    // 1. Orders awaiting processing
    for (const o of awaitingProcessingOrders) {
      alerts.push({
        id: `order-proc-${o.id}`,
        type: 'AWAITING_PROCESSING',
        title: `Order #${o.orderNumber} Awaiting Processing`,
        description: `Confirmed payment from ${o.user.fullName}. Requires warehouse acknowledgement.`,
        priority: 'HIGH',
        timestamp: o.createdAt.toISOString(),
        targetUrl: `/orders/${o.id}`,
        entityId: o.id,
      });
    }

    // 2. Orders awaiting dispatch
    for (const o of awaitingDispatchOrders) {
      const whCodes = Array.from(new Set(o.orderItems.map((i) => i.warehouse.code))).join(', ');
      alerts.push({
        id: `order-disp-${o.id}`,
        type: 'AWAITING_DISPATCH',
        title: `Order #${o.orderNumber} Ready for Dispatch`,
        description: `Currently in PROCESSING at ${whCodes || 'facility'}. Physical shipment needed.`,
        priority: 'HIGH',
        timestamp: o.createdAt.toISOString(),
        targetUrl: `/orders/${o.id}`,
        entityId: o.id,
      });
    }

    // 3. Active Tickets (Shortages, Customer Decisions, Approvals)
    for (const t of activeTickets) {
      if (t.type === TicketType.CUSTOMER_DECISION) {
        alerts.push({
          id: `ticket-dec-${t.id}`,
          type: 'CUSTOMER_DECISION',
          title: `Pending Customer Decision: #${t.ticketNumber}`,
          description: `Customer response required for shortage offer on ${t.product?.name || 'product'}.`,
          priority: 'MEDIUM',
          timestamp: t.createdAt.toISOString(),
          targetUrl: `/tickets`,
          entityId: t.id,
        });
      } else if (t.status === TicketStatus.PENDING) {
        alerts.push({
          id: `ticket-app-${t.id}`,
          type: 'MANAGER_APPROVAL',
          title: `Manager Approval Needed: #${t.ticketNumber}`,
          description: `Order shortage approval pending for facility ${t.warehouse?.code || 'warehouse'}.`,
          priority: 'HIGH',
          timestamp: t.createdAt.toISOString(),
          targetUrl: `/tickets`,
          entityId: t.id,
        });
      } else {
        alerts.push({
          id: `ticket-short-${t.id}`,
          type: 'SHORTAGE_TICKET',
          title: `Shortage Ticket #${t.ticketNumber}`,
          description: `${t.product?.name || 'Item'} (${t.product?.sku}) shortage at ${t.warehouse?.code || 'facility'}.`,
          priority: t.priority === TicketPriority.CRITICAL ? 'CRITICAL' : 'HIGH',
          timestamp: t.createdAt.toISOString(),
          targetUrl: `/tickets`,
          entityId: t.id,
        });
      }
    }

    // 4. Low Stock Alerts
    const whThresholdMap = new Map<string, number>();
    const globalThresholdMap = new Map<string, number>();
    for (const th of thresholds) {
      if (th.warehouseId) {
        whThresholdMap.set(`${th.productId}_${th.warehouseId}`, th.minQuantity);
      } else {
        globalThresholdMap.set(th.productId, th.minQuantity);
      }
    }

    for (const item of inventoryItems) {
      const available = item.quantityOnHand - item.quantityReserved;
      const overrideMin = whThresholdMap.get(`${item.productId}_${item.warehouseId}`);
      const globalMin = globalThresholdMap.get(item.productId);
      const effectiveMin = overrideMin !== undefined ? overrideMin : globalMin;

      if (effectiveMin !== undefined && available < effectiveMin) {
        alerts.push({
          id: `low-stock-${item.id}`,
          type: 'LOW_STOCK',
          title: `Low Stock: ${item.product.name} (${item.product.sku})`,
          description: `Only ${available} available at ${item.warehouse.code} (Threshold: ${effectiveMin}, Deficit: ${effectiveMin - available}).`,
          priority: available <= 0 ? 'CRITICAL' : 'HIGH',
          timestamp: new Date().toISOString(),
          targetUrl: `/inventory?warehouseId=${item.warehouseId}`,
          entityId: item.id,
        });
      }
    }

    // Limit alerts to top 25 most critical
    alerts.sort((a, b) => {
      const priorityWeights = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityWeights[b.priority] - priorityWeights[a.priority];
    });

    return {
      totalAlerts: alerts.length,
      alerts: alerts.slice(0, 25),
    };
  }

  /**
   * Consolidated single-request dashboard overview for high performance.
   */
  public async getDashboard(
    user: { userId: string; role: UserRole },
    query: AnalyticsQuery
  ): Promise<DashboardOverviewResult> {
    const { startDate, endDate } = this.resolveTimeWindow(query);

    const [kpis, inventory, orders, warehouses, alerts] = await Promise.all([
      this.getKpis(user, query),
      this.getInventoryAnalytics(user, query),
      this.getOrderAnalytics(user, query),
      this.getWarehousePerformance(user, query),
      this.getOperationalAlerts(user, query),
    ]);

    return {
      timeRange: query.timeRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      warehouseId: query.warehouseId || null,
      kpis,
      inventory,
      orders,
      warehouses,
      alerts,
    };
  }
}

export const analyticsService = new AnalyticsService();
