import { NotificationType, Prisma, TicketPriority, TicketStatus, TicketType, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { ForbiddenError } from '../../common/errors/app-error';

export interface StockEvaluationResult {
  productId: string;
  warehouseId: string;
  productName?: string;
  productSku?: string;
  warehouseCode?: string;
  warehouseName?: string;
  quantityOnHand: number;
  quantityReserved: number;
  availableStock: number;
  thresholdQuantity: number | null;
  reorderQuantity: number | null;
  thresholdType: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE';
  thresholdId: string | null;
  isThresholdConfigured: boolean;
  isLowStock: boolean;
  deficit: number;
  evaluatedAt: string;
}

export class ThresholdEvaluationService {
  /**
   * Resolves the effective minimum stock threshold for a product at a specific warehouse.
   * Priority:
   * 1. Warehouse-specific override (MinimumStockThreshold where warehouseId = warehouseId AND isActive = true)
   * 2. Organization-wide default (MinimumStockThreshold where warehouseId = null AND isActive = true)
   * 3. None (thresholdQuantity = null, isThresholdConfigured = false)
   */
  public async resolveEffectiveThreshold(
    productId: string,
    warehouseId: string,
    tx?: Prisma.TransactionClient
  ): Promise<{
    thresholdQuantity: number | null;
    reorderQuantity: number | null;
    thresholdType: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE';
    thresholdId: string | null;
    isThresholdConfigured: boolean;
  }> {
    const client = tx || prisma;

    // 1. Check warehouse-specific override
    const warehouseThreshold = await client.minimumStockThreshold.findUnique({
      where: {
        productId_warehouseId: {
          productId,
          warehouseId,
        },
      },
    });

    if (warehouseThreshold && warehouseThreshold.isActive) {
      return {
        thresholdQuantity: warehouseThreshold.minQuantity,
        reorderQuantity: warehouseThreshold.reorderQuantity,
        thresholdType: 'WAREHOUSE_OVERRIDE',
        thresholdId: warehouseThreshold.id,
        isThresholdConfigured: true,
      };
    }

    // 2. Check organisation-wide global default for this product
    const globalThreshold = await client.minimumStockThreshold.findFirst({
      where: {
        productId,
        warehouseId: null,
        isActive: true,
      },
    });

    if (globalThreshold) {
      return {
        thresholdQuantity: globalThreshold.minQuantity,
        reorderQuantity: globalThreshold.reorderQuantity,
        thresholdType: 'GLOBAL_DEFAULT',
        thresholdId: globalThreshold.id,
        isThresholdConfigured: true,
      };
    }

    // 3. No threshold configured
    return {
      thresholdQuantity: null,
      reorderQuantity: null,
      thresholdType: 'NONE',
      thresholdId: null,
      isThresholdConfigured: false,
    };
  }

  /**
   * Evaluates available stock for a specific product and warehouse against its configured threshold.
   * Formula:
   * availableStock = quantityOnHand - quantityReserved
   * isLowStock = isThresholdConfigured && availableStock < thresholdQuantity
   */
  public async evaluateStock(
    productId: string,
    warehouseId: string,
    tx?: Prisma.TransactionClient
  ): Promise<StockEvaluationResult> {
    const client = tx || prisma;

    // 1. Fetch current inventory row
    const inventory = await client.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId,
          warehouseId,
        },
      },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { code: true, name: true } },
      },
    });

    const quantityOnHand = inventory ? inventory.quantityOnHand : 0;
    const quantityReserved = inventory ? inventory.quantityReserved : 0;
    const availableStock = quantityOnHand - quantityReserved;

    // 2. Resolve applicable threshold
    const thresholdInfo = await this.resolveEffectiveThreshold(productId, warehouseId, client);

    // 3. Evaluate low-stock condition
    let isLowStock = false;
    let deficit = 0;

    if (thresholdInfo.isThresholdConfigured && thresholdInfo.thresholdQuantity !== null) {
      if (availableStock < thresholdInfo.thresholdQuantity) {
        isLowStock = true;
        deficit = thresholdInfo.thresholdQuantity - availableStock;
      }
    }

    return {
      productId,
      warehouseId,
      productName: inventory?.product?.name,
      productSku: inventory?.product?.sku,
      warehouseCode: inventory?.warehouse?.code,
      warehouseName: inventory?.warehouse?.name,
      quantityOnHand,
      quantityReserved,
      availableStock,
      thresholdQuantity: thresholdInfo.thresholdQuantity,
      reorderQuantity: thresholdInfo.reorderQuantity,
      thresholdType: thresholdInfo.thresholdType,
      thresholdId: thresholdInfo.thresholdId,
      isThresholdConfigured: thresholdInfo.isThresholdConfigured,
      isLowStock,
      deficit,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates stock following an inventory mutation (restock, reservation hold, reservation release, adjustment).
   * Automatically creates LOW_STOCK tickets, updates existing open tickets, or resolves them when stock recovers.
   */
  public async evaluateStockAfterChange(
    productId: string,
    warehouseId: string,
    tx?: Prisma.TransactionClient
  ): Promise<StockEvaluationResult> {
    const client = tx || prisma;
    const result = await this.evaluateStock(productId, warehouseId, client);

    const activeStatuses: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS];

    // Find any existing active LOW_STOCK ticket for this product and warehouse
    const existingActiveTicket = await client.ticket.findFirst({
      where: {
        productId,
        warehouseId,
        type: TicketType.LOW_STOCK,
        status: { in: activeStatuses },
      },
    });

    if (result.isLowStock) {
      console.log(
        `⚠️ [ThresholdEvaluation] Low stock detected for product '${result.productSku || result.productId}' at warehouse '${result.warehouseCode || result.warehouseId}': ` +
        `Available: ${result.availableStock} < Threshold: ${result.thresholdQuantity} (${result.thresholdType}). Deficit: ${result.deficit} unit(s).`
      );

      if (existingActiveTicket) {
        // Step 6: Update existing open ticket when relevant stock information changes
        await client.ticket.update({
          where: { id: existingActiveTicket.id },
          data: {
            availableQuantity: result.availableStock,
            thresholdQuantity: result.thresholdQuantity,
            deficitQuantity: result.deficit,
            updatedAt: new Date(),
          },
        });
      } else {
        // Step 3: Create a new LOW_STOCK ticket
        const { ticketService } = await import('../tickets/ticket.service');
        const { notificationService } = await import('../notifications/notification.service');

        // Find primary assigned warehouse manager
        const assignment = await client.userWarehouseAssignment.findFirst({
          where: {
            warehouseId,
            user: { role: UserRole.WAREHOUSE_MANAGER },
          },
          select: { userId: true },
        });

        const ticketNumber = ticketService.generateTicketNumber('LOW');
        const priority = result.deficit > 20 ? TicketPriority.HIGH : TicketPriority.MEDIUM;

        try {
          const newTicket = await client.ticket.create({
            data: {
              ticketNumber,
              type: TicketType.LOW_STOCK,
              status: TicketStatus.OPEN,
              priority,
              productId,
              warehouseId,
              availableQuantity: result.availableStock,
              thresholdQuantity: result.thresholdQuantity,
              deficitQuantity: result.deficit,
              assignedToUserId: assignment?.userId || null,
              metadata: {
                productName: result.productName,
                productSku: result.productSku,
                warehouseCode: result.warehouseCode,
                warehouseName: result.warehouseName,
                thresholdType: result.thresholdType,
              },
            },
          });

          // Step 4: Make it visible to relevant Warehouse Manager and Admin via notifications
          // Notify Admin
          await notificationService.notifyAdmins(
            {
              ticketId: newTicket.id,
              type: NotificationType.LOW_STOCK_ALERT,
              title: `Low Stock Alert: ${result.productName || result.productSku}`,
              message: `Available stock (${result.availableStock}) below threshold (${result.thresholdQuantity}) at ${result.warehouseName || result.warehouseCode}. Deficit: ${result.deficit}.`,
              dedupKeyPrefix: `notif:low_stock:${newTicket.id}`,
            },
            client
          );

          // Notify Warehouse Managers
          await notificationService.notifyWarehouseManagers(
            [warehouseId],
            {
              ticketId: newTicket.id,
              type: NotificationType.LOW_STOCK_ALERT,
              title: `Low Stock Alert at ${result.warehouseName || result.warehouseCode}`,
              message: `Product ${result.productName || result.productSku} has fallen below threshold. Deficit: ${result.deficit}.`,
              dedupKeyPrefix: `notif:low_stock:${newTicket.id}`,
            },
            client
          );
        } catch (err: any) {
          // If concurrent transaction created the active ticket (handled by partial unique index), catch and ignore
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            console.log(`[ThresholdEvaluation] Active low-stock ticket already exists concurrently.`);
          } else {
            console.error('Error creating low-stock ticket:', err);
          }
        }
      }
    } else {
      // Stock is healthy (result.isLowStock === false)
      // Step 7: Resolve it only when stock has recovered and the issue is verified
      if (existingActiveTicket && result.isThresholdConfigured) {
        console.log(
          `✅ [ThresholdEvaluation] Stock recovered for product '${result.productSku}' at '${result.warehouseCode}'. Auto-resolving ticket ${existingActiveTicket.ticketNumber}.`
        );

        await client.ticket.update({
          where: { id: existingActiveTicket.id },
          data: {
            status: TicketStatus.RESOLVED,
            resolvedAt: new Date(),
            resolutionNotes: `Stock verified and recovered: Available (${result.availableStock}) >= Threshold (${result.thresholdQuantity}).`,
          },
        });

        const { notificationService } = await import('../notifications/notification.service');
        await notificationService.notifyWarehouseManagers(
          [warehouseId],
          {
            ticketId: existingActiveTicket.id,
            type: NotificationType.TICKET_RESOLVED,
            title: `Low Stock Resolved: ${result.productName || result.productSku}`,
            message: `Stock level has recovered at ${result.warehouseName || result.warehouseCode}. Available: ${result.availableStock}.`,
            dedupKeyPrefix: `notif:resolved:${existingActiveTicket.id}`,
          },
          client
        );
      }
    }

    return result;
  }

  /**
   * Evaluates all inventory items across authorized facilities and returns all low-stock items.
   * Replaces arbitrary frontend filters (e.g. available <= 20) with database-driven threshold evaluations.
   */
  public async getLowStockItems(
    warehouseId?: string,
    user?: { userId: string; role: UserRole }
  ): Promise<StockEvaluationResult[]> {
    if (user && user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Access denied. Customers are not authorized to inspect low-stock alerts.',
        'FORBIDDEN'
      );
    }

    const where: Prisma.InventoryWhereInput = {};

    if (warehouseId) {
      if (user && (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF)) {
        await warehouseAccessService.ensureWarehouseAccess(user.userId, user.role, warehouseId);
      }
      where.warehouseId = warehouseId;
    } else if (user && (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF)) {
      const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
      where.warehouseId = { in: accessibleIds as string[] };
    }

    // 1. Fetch inventory items across authorized facilities
    const inventoryItems = await prisma.inventory.findMany({
      where,
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (inventoryItems.length === 0) {
      return [];
    }

    // 2. Fetch all active thresholds in bulk to minimize DB roundtrips
    const productIds = Array.from(new Set(inventoryItems.map((i) => i.productId)));
    const allThresholds = await prisma.minimumStockThreshold.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
      },
    });

    // Index thresholds by `productId:warehouseId` and `productId:global`
    const warehouseThresholdMap = new Map<string, typeof allThresholds[0]>();
    const globalThresholdMap = new Map<string, typeof allThresholds[0]>();

    for (const t of allThresholds) {
      if (t.warehouseId) {
        warehouseThresholdMap.set(`${t.productId}:${t.warehouseId}`, t);
      } else {
        globalThresholdMap.set(t.productId, t);
      }
    }

    // 3. Evaluate each inventory item against its applicable threshold
    const lowStockResults: StockEvaluationResult[] = [];

    for (const item of inventoryItems) {
      const availableStock = item.quantityOnHand - item.quantityReserved;
      const whThreshold = warehouseThresholdMap.get(`${item.productId}:${item.warehouseId}`);
      const globalThreshold = globalThresholdMap.get(item.productId);

      let thresholdQuantity: number | null = null;
      let reorderQuantity: number | null = null;
      let thresholdType: 'WAREHOUSE_OVERRIDE' | 'GLOBAL_DEFAULT' | 'NONE' = 'NONE';
      let thresholdId: string | null = null;
      let isThresholdConfigured = false;

      if (whThreshold) {
        thresholdQuantity = whThreshold.minQuantity;
        reorderQuantity = whThreshold.reorderQuantity;
        thresholdType = 'WAREHOUSE_OVERRIDE';
        thresholdId = whThreshold.id;
        isThresholdConfigured = true;
      } else if (globalThreshold) {
        thresholdQuantity = globalThreshold.minQuantity;
        reorderQuantity = globalThreshold.reorderQuantity;
        thresholdType = 'GLOBAL_DEFAULT';
        thresholdId = globalThreshold.id;
        isThresholdConfigured = true;
      }

      // Check low stock condition
      if (isThresholdConfigured && thresholdQuantity !== null && availableStock < thresholdQuantity) {
        lowStockResults.push({
          productId: item.productId,
          warehouseId: item.warehouseId,
          productName: item.product.name,
          productSku: item.product.sku,
          warehouseCode: item.warehouse.code,
          warehouseName: item.warehouse.name,
          quantityOnHand: item.quantityOnHand,
          quantityReserved: item.quantityReserved,
          availableStock,
          thresholdQuantity,
          reorderQuantity,
          thresholdType,
          thresholdId,
          isThresholdConfigured: true,
          isLowStock: true,
          deficit: thresholdQuantity - availableStock,
          evaluatedAt: new Date().toISOString(),
        });
      }
    }

    return lowStockResults;
  }
}

export const thresholdEvaluationService = new ThresholdEvaluationService();

