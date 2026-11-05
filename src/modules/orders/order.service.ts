import { MovementType, Order, OrderStatus, Prisma, ReservationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { APP_CONSTANTS, EVENT_TYPES } from '../../config/constants';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../common/errors/app-error';
import { hashPayload } from '../../common/utils/crypto';
import { CancelOrderInput, CreateOrderInput, ListOrdersQuery } from './order.schemas';
import { outboxService } from '../outbox/outbox.service';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { thresholdEvaluationService } from '../inventory/threshold-evaluation.service';

export interface OrderCreationResult {
  order: Order & {
    items: any[];
    reservations: any[];
  };
  isIdempotentReplay?: boolean;
}

/**
 * Safely executes a read-only pre-flight query, retrying once if Prisma encounters
 * a transient connection closure (P1017: Server has closed the connection) due to
 * an idle connection timeout.
 *
 * NOTE: Never retry mutations or interactive transactions.
 */
async function withConnectionRetry<T>(queryFn: () => Promise<T>): Promise<T> {
  try {
    return await queryFn();
  } catch (error: any) {
    if (error?.code === 'P1017') {
      console.warn('⚠️ [Database] Transient P1017 connection drop detected on pre-flight query. Retrying once with fresh connection...');
      return await queryFn();
    }
    throw error;
  }
}

export class OrderService {
  /**
   * Creates an order with deterministic row-level locking, availability verification,
   * two-phase stock reservation, and idempotency protection.
   */
  public async createOrder(
    userId: string,
    input: CreateOrderInput,
    idempotencyKey?: string
  ): Promise<OrderCreationResult> {
    const { shippingAddress, items } = input;
    const payloadHash = hashPayload({ userId, shippingAddress, items });

    // 1. Idempotency Check (if key provided)
    if (idempotencyKey) {
      const existingRecord = await withConnectionRetry(() =>
        prisma.idempotencyRecord.findUnique({
          where: { key: idempotencyKey },
        })
      );

      if (existingRecord) {
        if (existingRecord.requestPayloadHash !== payloadHash) {
          throw new ConflictError(
            'Idempotency key has already been used with a different request payload',
            'IDEMPOTENCY_PAYLOAD_MISMATCH'
          );
        }
        // Return cached original response
        return {
          order: existingRecord.responseBody as any,
          isIdempotentReplay: true,
        };
      }
    }

    // 2. Validate all products exist and are active
    const productIds = items.map((i) => i.productId);
    const products = await withConnectionRetry(() =>
      prisma.product.findMany({
        where: {
          id: { in: productIds },
          isActive: true,
        },
      })
    );

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missing = productIds.find((id) => !foundIds.has(id));
      throw new NotFoundError(`Active product with ID '${missing}' not found`);
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 3. Execute Concurrency-Controlled Atomic Transaction
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        // Step A: Inspect inventory and determine allocation across eligible warehouses
        const resolvedItems: Array<{
          productId: string;
          warehouseId: string;
          quantity: number;
          inventoryId: string;
          unitPriceCents: number;
          subtotalCents: number;
        }> = [];

        const shortageItems: Array<{
          productId: string;
          productName: string;
          productSku: string;
          requestedQuantity: number;
          availableQuantity: number;
          shortageQuantity: number;
          quantityOffered: number;
          allocations: Array<{
            warehouseId: string;
            warehouseCode: string;
            warehouseName: string;
            quantity: number;
          }>;
          unitPriceCents: number;
        }> = [];

        for (const item of items) {
          const prod = productMap.get(item.productId)!;

          if (item.warehouseId) {
            // Specific warehouse requested
            const warehouse = await tx.warehouse.findUnique({
              where: { id: item.warehouseId, isActive: true },
            });
            if (!warehouse) {
              throw new NotFoundError(`Active warehouse with ID '${item.warehouseId}' not found`);
            }

            const inv = await tx.inventory.findUnique({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: item.warehouseId,
                },
              },
            });

            if (!inv) {
              throw new ConflictError(
                `Product '${prod.name}' (SKU: ${prod.sku}) has no inventory record at warehouse '${warehouse.name}'`
              );
            }

            const available = inv.quantityOnHand - inv.quantityReserved;
            if (available >= item.quantity) {
              resolvedItems.push({
                productId: item.productId,
                warehouseId: item.warehouseId,
                quantity: item.quantity,
                inventoryId: inv.id,
                unitPriceCents: prod.priceCents,
                subtotalCents: prod.priceCents * item.quantity,
              });
            } else {
              // Stock is less than requested at this specific warehouse
              if (available <= 0 || input.allowPartial === false) {
                throw new ConflictError(
                  `Insufficient stock available for '${prod.name}' (SKU: ${prod.sku}). Required: ${item.quantity}, Available: ${available}`
                );
              }

              shortageItems.push({
                productId: item.productId,
                productName: prod.name,
                productSku: prod.sku,
                requestedQuantity: item.quantity,
                availableQuantity: available,
                shortageQuantity: item.quantity - available,
                quantityOffered: available,
                allocations: [
                  {
                    warehouseId: item.warehouseId,
                    warehouseCode: warehouse.code,
                    warehouseName: warehouse.name,
                    quantity: available,
                  },
                ],
                unitPriceCents: prod.priceCents,
              });
            }
          } else {
            // Deterministic Allocation Policy across active warehouses sorted by code ASC
            const candidateInventories = await tx.inventory.findMany({
              where: {
                productId: item.productId,
                warehouse: { isActive: true },
              },
              include: { warehouse: true },
              orderBy: { warehouse: { code: 'asc' } },
            });

            // 1. Try single warehouse allocation
            const singleMatch = candidateInventories.find(
              (inv) => inv.quantityOnHand - inv.quantityReserved >= item.quantity
            );

            if (singleMatch) {
              resolvedItems.push({
                productId: item.productId,
                warehouseId: singleMatch.warehouseId,
                quantity: item.quantity,
                inventoryId: singleMatch.id,
                unitPriceCents: prod.priceCents,
                subtotalCents: prod.priceCents * item.quantity,
              });
            } else {
              // 2. Check aggregate available stock across all active warehouses
              const totalAvailable = candidateInventories.reduce(
                (sum, inv) => sum + Math.max(0, inv.quantityOnHand - inv.quantityReserved),
                0
              );

              if (totalAvailable >= item.quantity) {
                // Split order across warehouses to fulfill 100% of requested quantity
                let remaining = item.quantity;
                for (const inv of candidateInventories) {
                  const avail = Math.max(0, inv.quantityOnHand - inv.quantityReserved);
                  if (avail <= 0) continue;
                  const allocQty = Math.min(remaining, avail);
                  resolvedItems.push({
                    productId: item.productId,
                    warehouseId: inv.warehouseId,
                    quantity: allocQty,
                    inventoryId: inv.id,
                    unitPriceCents: prod.priceCents,
                    subtotalCents: prod.priceCents * allocQty,
                  });
                  remaining -= allocQty;
                  if (remaining === 0) break;
                }
              } else {
                // Total available < requested: Shortage detected!
                if (totalAvailable <= 0 || input.allowPartial === false) {
                  throw new ConflictError(
                    `Insufficient stock available across warehouses for product '${prod.name}' (SKU: ${prod.sku}). Requested: ${item.quantity}.`
                  );
                }

                const allocations: Array<{
                  warehouseId: string;
                  warehouseCode: string;
                  warehouseName: string;
                  quantity: number;
                }> = [];

                for (const inv of candidateInventories) {
                  const avail = Math.max(0, inv.quantityOnHand - inv.quantityReserved);
                  if (avail <= 0) continue;
                  allocations.push({
                    warehouseId: inv.warehouseId,
                    warehouseCode: inv.warehouse.code,
                    warehouseName: inv.warehouse.name,
                    quantity: avail,
                  });
                }

                shortageItems.push({
                  productId: item.productId,
                  productName: prod.name,
                  productSku: prod.sku,
                  requestedQuantity: item.quantity,
                  availableQuantity: totalAvailable,
                  shortageQuantity: item.quantity - totalAvailable,
                  quantityOffered: totalAvailable,
                  allocations,
                  unitPriceCents: prod.priceCents,
                });
              }
            }
          }
        }

        // Step B: Shortage Workflow (Scenario B)
        if (shortageItems.length > 0) {
          const totalRequestedAmountCents = items.reduce((sum, item) => {
            const prod = productMap.get(item.productId)!;
            return sum + prod.priceCents * item.quantity;
          }, 0);

          const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

          // Create order in PENDING status (awaiting customer decision and internal approval)
          const order = await tx.order.create({
            data: {
              orderNumber,
              userId,
              status: OrderStatus.PENDING,
              totalAmountCents: totalRequestedAmountCents,
              shippingAddress,
              idempotencyKey: idempotencyKey || null,
            },
          });

          // Create initial order items
          const defaultWh = await tx.warehouse.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } });
          const createdItems = [];
          for (const item of items) {
            const prod = productMap.get(item.productId)!;
            const targetWhId =
              item.warehouseId ||
              shortageItems.find((s) => s.productId === item.productId)?.allocations[0]?.warehouseId ||
              defaultWh!.id;

            const orderItem = await tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: item.productId,
                warehouseId: targetWhId,
                quantity: item.quantity,
                unitPriceCents: prod.priceCents,
                subtotalCents: prod.priceCents * item.quantity,
              },
            });
            createdItems.push(orderItem);
          }

          // Create linked ORDER_SHORTAGE and CUSTOMER_DECISION tickets
          const { ticketService } = await import('../tickets/ticket.service');
          const createdTickets = [];
          for (const s of shortageItems) {
            const t = await ticketService.createShortageTickets(
              {
                orderId: order.id,
                orderNumber: order.orderNumber,
                customerId: userId,
                productId: s.productId,
                requestedQuantity: s.requestedQuantity,
                availableQuantity: s.availableQuantity,
                shortageQuantity: s.shortageQuantity,
                quantityOffered: s.quantityOffered,
                allocations: s.allocations,
                productName: s.productName,
                productSku: s.productSku,
              },
              tx
            );
            createdTickets.push(t);
          }

          const responsePayload = {
            ...order,
            items: createdItems,
            reservations: [],
            isShortage: true,
            shortages: shortageItems,
            tickets: createdTickets,
          };

          if (idempotencyKey) {
            await tx.idempotencyRecord.create({
              data: {
                key: idempotencyKey,
                requestPath: '/api/v1/orders',
                requestPayloadHash: payloadHash,
                responseStatus: 201,
                responseBody: responsePayload as any,
              },
            });
          }

          return {
            order: responsePayload as any,
            isIdempotentReplay: false,
          };
        }

        // Step C: Deadlock Prevention — Sort inventory IDs deterministically before acquiring locks
        const uniqueInventoryIds = Array.from(new Set(resolvedItems.map((r) => r.inventoryId))).sort();

        // Step C: Pessimistic Row-Level Locking (SELECT ... FOR UPDATE)
        // Acquire exclusive locks on the inventory rows in canonical order
        const lockedRows: Array<{
          id: string;
          product_id: string;
          warehouse_id: string;
          quantity_on_hand: number;
          quantity_reserved: number;
        }> = await tx.$queryRaw`
          SELECT id, product_id, warehouse_id, quantity_on_hand, quantity_reserved
          FROM inventory
          WHERE id = ANY(${uniqueInventoryIds}::uuid[])
          ORDER BY id ASC
          FOR UPDATE
        `;

        const lockedMap = new Map(lockedRows.map((r) => [r.id, r]));

        // Step D: Verify Available Stock under exclusive lock
        const demandByInventoryId = new Map<string, number>();
        for (const item of resolvedItems) {
          const currentDemand = demandByInventoryId.get(item.inventoryId) || 0;
          demandByInventoryId.set(item.inventoryId, currentDemand + item.quantity);
        }

        for (const [invId, totalDemanded] of demandByInventoryId.entries()) {
          const locked = lockedMap.get(invId);
          if (!locked) {
            throw new ConflictError('Inventory record lock failed');
          }

          const available = locked.quantity_on_hand - locked.quantity_reserved;
          if (available < totalDemanded) {
            const prod = productMap.get(locked.product_id);
            throw new ConflictError(
              `Insufficient stock available for '${prod?.name || locked.product_id}'. Required: ${totalDemanded}, Available: ${available}`
            );
          }
        }

        // Step E: Create Order Aggregate
        const totalAmountCents = resolvedItems.reduce((sum, item) => sum + item.subtotalCents, 0);
        const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            status: OrderStatus.RESERVED,
            totalAmountCents,
            shippingAddress,
            idempotencyKey: idempotencyKey || null,
          },
        });

        // Step F: Create Order Items, Hold Stock, and Create Reservations
        const expiresAt = new Date(Date.now() + APP_CONSTANTS.DEFAULT_RESERVATION_TTL_MINUTES * 60 * 1000);
        const createdItems = [];
        const createdReservations = [];

        for (const item of resolvedItems) {
          // 1. Create order item
          const orderItem = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              subtotalCents: item.subtotalCents,
            },
          });
          createdItems.push(orderItem);

          // 2. Increment quantity_reserved on inventory
          await tx.inventory.update({
            where: { id: item.inventoryId },
            data: {
              quantityReserved: { increment: item.quantity },
            },
          });

          // 3. Create active reservation with TTL
          const reservation = await tx.inventoryReservation.create({
            data: {
              orderId: order.id,
              inventoryId: item.inventoryId,
              quantity: item.quantity,
              status: ReservationStatus.ACTIVE,
              expiresAt,
            },
          });
          createdReservations.push(reservation);

          // 4. Record audit ledger entry
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantityDelta: item.quantity,
              movementType: MovementType.RESERVATION_HOLD,
              referenceId: order.id,
              notes: `Held ${item.quantity} unit(s) for order '${orderNumber}'. Reservation TTL: ${APP_CONSTANTS.DEFAULT_RESERVATION_TTL_MINUTES}m.`,
            },
          });
        }

        const responsePayload = {
          ...order,
          items: createdItems,
          reservations: createdReservations,
        };

        // Step G: Record Transactional Outbox Event
        await outboxService.recordEvent(tx, {
          aggregateType: 'Order',
          aggregateId: order.id,
          eventType: EVENT_TYPES.ORDER_CREATED,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            userId: order.userId,
            totalAmountCents: order.totalAmountCents,
            shippingAddress: order.shippingAddress,
            items: createdItems.map((item) => ({
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              subtotalCents: item.subtotalCents,
            })),
            createdAt: order.createdAt.toISOString(),
          },
        });

        // Step H: Save Idempotency Record
        if (idempotencyKey) {
          await tx.idempotencyRecord.create({
            data: {
              key: idempotencyKey,
              requestPath: '/api/v1/orders',
              requestPayloadHash: payloadHash,
              responseStatus: 201,
              responseBody: responsePayload as any,
            },
          });
        }

        return {
          order: responsePayload,
          isIdempotentReplay: false,
        };
      });

      // Post-transaction threshold evaluation (runs after tx releases its connection to avoid pool starvation)
      if (!txResult.isIdempotentReplay && txResult.order?.items) {
        for (const item of txResult.order.items) {
          if (item.productId && item.warehouseId) {
            try {
              await thresholdEvaluationService.evaluateStockAfterChange(item.productId, item.warehouseId);
            } catch (evalErr) {
              console.warn('⚠️ [OrderService] Threshold evaluation error:', evalErr);
            }
          }
        }
      }

      return txResult;
    } catch (error) {
      // Handle concurrent race on the same idempotency key
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Wait a short moment for the winning concurrent transaction to commit
        await new Promise((resolve) => setTimeout(resolve, 80));

        const existingRecord = await prisma.idempotencyRecord.findUnique({
          where: { key: idempotencyKey },
        });

        if (existingRecord) {
          if (existingRecord.requestPayloadHash !== payloadHash) {
            throw new ConflictError(
              'Idempotency key has already been used with a different request payload',
              'IDEMPOTENCY_PAYLOAD_MISMATCH'
            );
          }
          return {
            order: existingRecord.responseBody as any,
            isIdempotentReplay: true,
          };
        }

        const existingOrder = await prisma.order.findUnique({
          where: { idempotencyKey },
          include: {
            orderItems: true,
            inventoryReservations: true,
          },
        });

        if (existingOrder) {
          return {
            order: existingOrder as any,
            isIdempotentReplay: true,
          };
        }
      }

      throw error;
    }
  }

  /**
   * Retrieves an order by ID with line items, warehouse allocations, reservations, and payment history.
   * Authorization Rules:
   * - ADMIN: Organization-wide access to any order.
   * - CUSTOMER: Strictly access only to orders placed by themselves (order.userId === user.userId).
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Access only if at least one line item in the order
   *   is assigned to / fulfilled by an assigned facility (Multi-Warehouse Overlap Rule).
   *   Orders containing zero items from assigned facilities are 403 Forbidden, even if placed by the user.
   */
  public async getOrderById(orderId: string, user: { userId: string; role: UserRole }): Promise<any> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        orderItems: {
          include: {
            product: { select: { id: true, sku: true, name: true, priceCents: true } },
            warehouse: { select: { id: true, code: true, name: true } },
          },
        },
        inventoryReservations: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found`);
    }

    if (user.role === UserRole.ADMIN) {
      // Organization-wide access
    } else if (user.role === UserRole.CUSTOMER) {
      if (order.userId !== user.userId) {
        throw new ForbiddenError('You are not authorized to view this order');
      }
    } else if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      const assignedIds = await warehouseAccessService.getAccessibleWarehouseIds(
        user.userId,
        user.role
      );
      // Multi-Warehouse Access Rule: User can view order only if at least one item belongs to an assigned warehouse
      const isAssigned = order.orderItems.some((item) =>
        (assignedIds as string[]).includes(item.warehouseId)
      );
      if (!isAssigned) {
        throw new ForbiddenError('You are not authorized to view this order');
      }
    } else {
      throw new ForbiddenError('You are not authorized to view this order');
    }

    // Fetch relevant inventory movements for this order if available
    const inventoryMovements = await prisma.inventoryMovement.findMany({
      where: { referenceId: orderId },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...order,
      inventoryMovements,
    };
  }

  /**
   * Lists orders with role-based boundaries, search, filters and pagination:
   * - ADMIN: Organization-wide order listing.
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Only orders containing items fulfilled by their assigned warehouses.
   * - CUSTOMER: Strictly restricted to their own submitted orders (where.userId === user.userId).
   */
  public async listOrders(query: ListOrdersQuery, user: { userId: string; role: UserRole }) {
    const { page, limit, status, search, warehouseId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.OrderWhereInput[] = [];

    // Role-based boundary
    if (user.role === UserRole.ADMIN) {
      // Organization-wide visibility
      if (warehouseId) {
        andConditions.push({
          orderItems: {
            some: { warehouseId },
          },
        });
      }
    } else if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
      const assignedIds = (await warehouseAccessService.getAccessibleWarehouseIds(
        user.userId,
        user.role
      )) as string[];

      if (warehouseId) {
        if (assignedIds.includes(warehouseId)) {
          andConditions.push({
            orderItems: {
              some: { warehouseId },
            },
          });
        } else {
          // Warehouse not in assigned list -> empty match
          andConditions.push({
            id: '00000000-0000-0000-0000-000000000000',
          });
        }
      } else {
        andConditions.push({
          orderItems: {
            some: {
              warehouseId: { in: assignedIds },
            },
          },
        });
      }
    } else {
      // CUSTOMER: Strictly own orders
      andConditions.push({ userId: user.userId });
    }

    if (status) {
      andConditions.push({ status });
    }

    if (search && search.trim()) {
      const q = search.trim();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(q);

      const searchOr: Prisma.OrderWhereInput[] = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { fullName: { contains: q, mode: 'insensitive' } } },
        {
          orderItems: {
            some: {
              product: {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { sku: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];

      if (isUuid) {
        searchOr.push({ id: q });
      }

      andConditions.push({ OR: searchOr });
    }

    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          if (endDate.length <= 10) {
            end.setHours(23, 59, 59, 999);
          }
          dateFilter.lte = end;
        }
      }
      andConditions.push({ createdAt: dateFilter });
    }

    const where: Prisma.OrderWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [totalRecords, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          orderItems: {
            include: {
              product: { select: { id: true, sku: true, name: true, priceCents: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
          },
          inventoryReservations: {
            select: {
              id: true,
              status: true,
              quantity: true,
            },
          },
        },
      }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  /**
   * Cancels an order, releases held stock if reserved, or restocks physical quantity if confirmed.
   */
  public async cancelOrder(
    orderId: string,
    user: { userId: string; role: UserRole },
    reason?: string
  ): Promise<any> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock Order row
      await tx.$executeRaw`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          inventoryReservations: {
            include: { inventory: true },
          },
          orderItems: true,
        },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      if (user.role !== UserRole.ADMIN && order.userId !== user.userId) {
        throw new ForbiddenError('You are not authorized to cancel this order');
      }

      // Idempotent cancellation check
      if (order.status === OrderStatus.CANCELLED) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          message: 'Order is already cancelled.',
          compensation: { stockReleased: false },
        };
      }

      // Terminal un-cancellable check
      if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) {
        throw new UnprocessableEntityError(
          `Cannot cancel an order in '${order.status}' status. Fulfillment has already commenced.`
        );
      }

      let stockReleased = false;

      // Handle active reservations across all pre-dispatch statuses
      // (RESERVED, PAYMENT_PENDING, PENDING, CONFIRMED, PROCESSING)
      if (
        order.status === OrderStatus.RESERVED ||
        order.status === OrderStatus.PAYMENT_PENDING ||
        order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.CONFIRMED ||
        order.status === OrderStatus.PROCESSING
      ) {
        for (const res of order.inventoryReservations) {
          if (res.status === ReservationStatus.ACTIVE) {
            // Lock inventory row
            await tx.$executeRaw`
              SELECT id FROM inventory WHERE id = ${res.inventoryId}::uuid FOR UPDATE
            `;

            await tx.inventory.update({
              where: { id: res.inventoryId },
              data: {
                quantityReserved: { decrement: res.quantity },
              },
            });

            await tx.inventoryReservation.update({
              where: { id: res.id },
              data: { status: ReservationStatus.RELEASED },
            });

            await tx.inventoryMovement.create({
              data: {
                productId: res.inventory.productId,
                warehouseId: res.inventory.warehouseId,
                quantityDelta: res.quantity,
                movementType: MovementType.RESERVATION_RELEASE,
                referenceId: order.id,
                notes: `Order cancelled in ${order.status} status. Released ${res.quantity} reserved unit(s). Reason: ${reason || 'Customer requested cancellation'}`,
              },
            });

            stockReleased = true;
          }
        }
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      // Record Transactional Outbox Event for Cancellation
      await outboxService.recordEvent(tx, {
        aggregateType: 'Order',
        aggregateId: updatedOrder.id,
        eventType: EVENT_TYPES.ORDER_CANCELLED,
        payload: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          userId: updatedOrder.userId,
          reason: reason || 'Customer requested cancellation',
          stockReleased,
          cancelledAt: new Date().toISOString(),
        },
      });

      // Evaluate stock after reservation release / restock
      for (const item of order.orderItems) {
        await thresholdEvaluationService.evaluateStockAfterChange(item.productId, item.warehouseId);
      }

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        message: 'Order cancelled successfully.',
        compensation: { stockReleased },
      };
    });
  }

  /**
   * Finalizes an order that had a shortage once BOTH manager approval and customer decision have been obtained.
   * Atomically verifies fresh inventory availability, acquires canonical row locks, commits reservations for the accepted
   * quantity, updates order line items and total amount, and transitions order status to RESERVED.
   */
  public async finalizeShortageOrderReservation(orderId: string) {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      if (order.status !== OrderStatus.PENDING) {
        // Already reserved or finalized
        return order;
      }

      // Find the linked ORDER_SHORTAGE ticket
      const shortageTicket = await tx.ticket.findFirst({
        where: { orderId, type: 'ORDER_SHORTAGE' as any },
      });

      if (!shortageTicket) {
        throw new NotFoundError(`Shortage ticket for order '${orderId}' not found`);
      }

      const allocations: Array<{
        warehouseId: string;
        warehouseCode: string;
        warehouseName: string;
        quantity: number;
      }> = (shortageTicket.metadata as any)?.allocations || [];

      if (allocations.length === 0) {
        throw new BadRequestError('No warehouse allocations found for shortage order');
      }

      const productId = shortageTicket.productId!;
      const prod = await tx.product.findUnique({ where: { id: productId } });
      if (!prod) {
        throw new NotFoundError(`Product '${productId}' not found`);
      }

      // Step A: Fetch inventory IDs for all allocated warehouses
      const warehouseIds = allocations.map((a) => a.warehouseId);
      const inventories = await tx.inventory.findMany({
        where: {
          productId,
          warehouseId: { in: warehouseIds },
        },
      });

      const invMap = new Map(inventories.map((i) => [i.warehouseId, i]));
      const inventoryIds = inventories.map((i) => i.id).sort();

      // Step B: Canonical Row-Level Locking (SELECT ... FOR UPDATE)
      const lockedRows: Array<{
        id: string;
        product_id: string;
        warehouse_id: string;
        quantity_on_hand: number;
        quantity_reserved: number;
      }> = await tx.$queryRaw`
        SELECT id, product_id, warehouse_id, quantity_on_hand, quantity_reserved
        FROM inventory
        WHERE id = ANY(${inventoryIds}::uuid[])
        ORDER BY id ASC
        FOR UPDATE
      `;

      const lockedMap = new Map(lockedRows.map((r) => [r.id, r]));

      // Step C: Recheck available stock under lock (Ensure no stale availability)
      for (const alloc of allocations) {
        const inv = invMap.get(alloc.warehouseId);
        if (!inv) {
          throw new ConflictError(`Inventory record missing for warehouse '${alloc.warehouseId}'`);
        }
        const locked = lockedMap.get(inv.id);
        if (!locked) {
          throw new ConflictError('Failed to lock inventory record');
        }
        const available = locked.quantity_on_hand - locked.quantity_reserved;
        if (available < alloc.quantity) {
          throw new ConflictError(
            `Inventory availability changed before reservation could be committed for warehouse '${alloc.warehouseCode || alloc.warehouseId}'. Stale stock detected. Available: ${available}, Required: ${alloc.quantity}`
          );
        }
      }

      // Step D: Delete previous placeholder order items and insert accepted items
      await tx.orderItem.deleteMany({ where: { orderId } });

      const expiresAt = new Date(Date.now() + APP_CONSTANTS.DEFAULT_RESERVATION_TTL_MINUTES * 60 * 1000);
      const newItems = [];
      const newReservations = [];

      let totalAcceptedAmountCents = 0;

      for (const alloc of allocations) {
        const inv = invMap.get(alloc.warehouseId)!;
        const subtotal = prod.priceCents * alloc.quantity;
        totalAcceptedAmountCents += subtotal;

        // 1. Create order item
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId,
            warehouseId: alloc.warehouseId,
            quantity: alloc.quantity,
            unitPriceCents: prod.priceCents,
            subtotalCents: subtotal,
          },
        });
        newItems.push(orderItem);

        // 2. Increment quantityReserved
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            quantityReserved: { increment: alloc.quantity },
          },
        });

        // 3. Create active reservation
        const reservation = await tx.inventoryReservation.create({
          data: {
            orderId: order.id,
            inventoryId: inv.id,
            quantity: alloc.quantity,
            status: ReservationStatus.ACTIVE,
            expiresAt,
          },
        });
        newReservations.push(reservation);

        // 4. Record audit ledger entry
        await tx.inventoryMovement.create({
          data: {
            productId,
            warehouseId: alloc.warehouseId,
            quantityDelta: alloc.quantity,
            movementType: MovementType.RESERVATION_HOLD,
            referenceId: order.id,
            notes: `Held ${alloc.quantity} unit(s) for accepted partial order '${order.orderNumber}'. Reservation TTL: ${APP_CONSTANTS.DEFAULT_RESERVATION_TTL_MINUTES}m.`,
          },
        });
      }

      // Step E: Update order status to RESERVED and update totalAmountCents to accepted total
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.RESERVED,
          totalAmountCents: totalAcceptedAmountCents,
        },
      });

      // Step F: Record Outbox Event
      await outboxService.recordEvent(tx, {
        aggregateType: 'Order',
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_CREATED,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          totalAmountCents: totalAcceptedAmountCents,
          shippingAddress: order.shippingAddress,
          items: newItems.map((item) => ({
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            subtotalCents: item.subtotalCents,
          })),
          createdAt: order.createdAt.toISOString(),
        },
      });

      // Step G: Evaluate stock against configured thresholds for affected warehouses
      for (const alloc of allocations) {
        await thresholdEvaluationService.evaluateStockAfterChange(productId, alloc.warehouseId);
      }

      return {
        ...updatedOrder,
        items: newItems,
        reservations: newReservations,
      };
    });
  }

  /**
   * Moves a confirmed order into PROCESSING.
   * Allowed roles: ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF (assigned to fulfilling facilities).
   * Safe against repeated idempotent requests.
   */
  public async processOrder(
    orderId: string,
    user: { userId: string; role: UserRole },
    _options?: { notes?: string }
  ) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Customers cannot process orders for fulfillment');
    }

    return prisma.$transaction(async (tx) => {
      // Row lock on order
      await tx.$executeRaw`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: true,
          inventoryReservations: true,
        },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      // Warehouse authorization check for warehouse managers and staff
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
        const orderWarehouseIds = [...new Set(order.orderItems.map((item) => item.warehouseId))];
        const isAssigned = orderWarehouseIds.some((whId) => (accessibleIds as string[]).includes(whId));
        if (!isAssigned) {
          throw new ForbiddenError(
            'Access denied: You are not assigned to any warehouse fulfilling this order',
            'FORBIDDEN_WAREHOUSE_ACCESS'
          );
        }
      }

      // Idempotency: safe against repeated requests
      if (order.status === OrderStatus.PROCESSING) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          message: 'Order is already in PROCESSING status.',
        };
      }

      if (order.status !== OrderStatus.CONFIRMED) {
        throw new UnprocessableEntityError(
          `Cannot process order in '${order.status}' status. Only CONFIRMED orders can be moved to PROCESSING.`
        );
      }

      // Verify active reservations exist
      const activeReservations = order.inventoryReservations.filter((r) => r.status === ReservationStatus.ACTIVE);
      if (activeReservations.length === 0) {
        throw new ConflictError('Cannot process order: No active reservations found for this order');
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PROCESSING },
      });

      // Record Transactional Outbox Event
      await outboxService.recordEvent(tx, {
        aggregateType: 'Order',
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_PROCESSING_STARTED,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: OrderStatus.PROCESSING,
          processedBy: user.userId,
          processedAt: new Date().toISOString(),
        },
      });

      return {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        message: 'Order moved to PROCESSING status. Warehouse picking and packing initiated.',
      };
    });
  }

  /**
   * Dispatches an order from warehouse facilities:
   * 1. Verifies order is PROCESSING.
   * 2. Verifies requesting user has access to every affected warehouse.
   * 3. Verifies active reservations.
   * 4. Acquires canonical row locks (SELECT ... FOR UPDATE) on affected inventory.
   * 5. Verifies physical stock and reserved balances.
   * 6. Deducts physical stock (quantityOnHand) and releases quantityReserved.
   * 7. Marks reservations as COMMITTED.
   * 8. Records DISPATCH inventory movement.
   * 9. Updates order status to SHIPPED.
   * 10. Emits order.shipped outbox event.
   */
  public async dispatchOrder(
    orderId: string,
    user: { userId: string; role: UserRole },
    options?: { warehouseId?: string; trackingNumber?: string; notes?: string }
  ) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Customers cannot dispatch orders');
    }

    return prisma.$transaction(async (tx) => {
      // Row lock on order
      await tx.$executeRaw`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: true,
          inventoryReservations: {
            include: {
              inventory: {
                include: {
                  warehouse: true,
                  product: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      // Idempotency: safe against repeated requests
      if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          message: `Order has already been dispatched (Status: ${order.status}).`,
        };
      }

      if (order.status !== OrderStatus.PROCESSING) {
        throw new UnprocessableEntityError(
          `Cannot dispatch order in '${order.status}' status. Order must be in PROCESSING status to be dispatched.`
        );
      }

      // Filter active reservations to dispatch
      let activeReservations = order.inventoryReservations.filter((r) => r.status === ReservationStatus.ACTIVE);

      if (options?.warehouseId) {
        activeReservations = activeReservations.filter(
          (r) => r.inventory.warehouseId === options.warehouseId
        );
      }

      if (activeReservations.length === 0) {
        // Check if reservations were released or expired
        const nonActive = order.inventoryReservations.filter(
          (r) => r.status === ReservationStatus.EXPIRED || r.status === ReservationStatus.RELEASED
        );
        if (nonActive.length > 0) {
          throw new ConflictError(
            'Cannot dispatch order: inventory reservations have expired or been released'
          );
        }
        throw new ConflictError('Cannot dispatch order: no active reservations available to dispatch');
      }

      // Multi-Warehouse Permissions Verification:
      // Verify user has authorized access to EVERY warehouse being dispatched
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
        const assignedIds = Array.isArray(accessibleIds) ? accessibleIds : [];

        const requiredWarehouseIds = [
          ...new Set(activeReservations.map((r) => r.inventory.warehouseId)),
        ];
        const unauthorizedWarehouses = requiredWarehouseIds.filter((id) => !assignedIds.includes(id));

        if (unauthorizedWarehouses.length > 0) {
          throw new ForbiddenError(
            `Access denied: You do not have permission to dispatch stock from warehouse '${unauthorizedWarehouses[0]}'`,
            'FORBIDDEN_WAREHOUSE_ACCESS'
          );
        }
      }

      // Canonical Row-Level Locking on affected inventory records
      const inventoryIds = [...new Set(activeReservations.map((r) => r.inventoryId))].sort();

      const lockedRows: Array<{
        id: string;
        product_id: string;
        warehouse_id: string;
        quantity_on_hand: number;
        quantity_reserved: number;
      }> = await tx.$queryRaw`
        SELECT id, product_id, warehouse_id, quantity_on_hand, quantity_reserved
        FROM inventory
        WHERE id = ANY(${inventoryIds}::uuid[])
        ORDER BY id ASC
        FOR UPDATE
      `;

      const lockedMap = new Map(lockedRows.map((r) => [r.id, r]));

      // Verify physical stock and reserved balances under lock
      for (const res of activeReservations) {
        const locked = lockedMap.get(res.inventoryId);
        if (!locked) {
          throw new ConflictError(`Inventory record '${res.inventoryId}' not found under lock`);
        }
        if (locked.quantity_on_hand < res.quantity) {
          throw new ConflictError(
            `Insufficient physical stock on hand at warehouse '${res.inventory.warehouse.name}' to dispatch order. Required: ${res.quantity}, On-hand: ${locked.quantity_on_hand}`
          );
        }
        if (locked.quantity_reserved < res.quantity) {
          throw new ConflictError(
            `Insufficient reserved balance at warehouse '${res.inventory.warehouse.name}' to dispatch order. Required: ${res.quantity}, Reserved: ${locked.quantity_reserved}`
          );
        }
      }

      // Atomically deduct physical stock, release reservation quantity, mark COMMITTED, and record DISPATCH movement
      for (const res of activeReservations) {
        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: {
            quantityOnHand: { decrement: res.quantity },
            quantityReserved: { decrement: res.quantity },
          },
        });

        await tx.inventoryReservation.update({
          where: { id: res.id },
          data: { status: ReservationStatus.COMMITTED },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: res.inventory.productId,
            warehouseId: res.inventory.warehouseId,
            quantityDelta: -res.quantity,
            movementType: MovementType.DISPATCH,
            referenceId: order.id,
            notes: `Physical dispatch: Order '${order.orderNumber}' dispatched ${res.quantity} unit(s) from warehouse '${res.inventory.warehouse.name}'. Dispatched by user ${user.userId}.${options?.trackingNumber ? ` Tracking: ${options.trackingNumber}` : ''}`,
          },
        });
      }

      // Transition order to SHIPPED
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SHIPPED },
      });

      // Record Transactional Outbox Event for Order Dispatched
      await outboxService.recordEvent(tx, {
        aggregateType: 'Order',
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_SHIPPED,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: OrderStatus.SHIPPED,
          dispatchedBy: user.userId,
          dispatchedAt: new Date().toISOString(),
          trackingNumber: options?.trackingNumber || null,
          items: activeReservations.map((r) => ({
            productId: r.inventory.productId,
            warehouseId: r.inventory.warehouseId,
            quantity: r.quantity,
          })),
        },
      });

      // Evaluate stock thresholds after physical deduction
      for (const res of activeReservations) {
        await thresholdEvaluationService.evaluateStockAfterChange(
          res.inventory.productId,
          res.inventory.warehouseId
        );
      }

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        message: 'Order successfully dispatched. Physical stock deducted and reservations committed.',
      };
    });
  }

  /**
   * Marks a SHIPPED order as DELIVERED.
   * Allowed roles: ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF.
   * Safe against repeated idempotent requests.
   */
  public async deliverOrder(
    orderId: string,
    user: { userId: string; role: UserRole },
    options?: { notes?: string; deliveryNotes?: string; deliveredAt?: string }
  ) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Customers cannot mark orders as delivered');
    }

    return prisma.$transaction(async (tx) => {
      // Row lock on order
      await tx.$executeRaw`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      // Warehouse authorization check
      if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.WAREHOUSE_STAFF) {
        const accessibleIds = await warehouseAccessService.getAccessibleWarehouseIds(user.userId, user.role);
        const orderWarehouseIds = [...new Set(order.orderItems.map((item) => item.warehouseId))];
        const isAssigned = orderWarehouseIds.some((whId) => (accessibleIds as string[]).includes(whId));
        if (!isAssigned) {
          throw new ForbiddenError(
            'Access denied: You are not assigned to any warehouse fulfilling this order',
            'FORBIDDEN_WAREHOUSE_ACCESS'
          );
        }
      }

      // Idempotency: safe against repeated requests
      if (order.status === OrderStatus.DELIVERED) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          message: 'Order has already been marked as DELIVERED.',
        };
      }

      if (order.status !== OrderStatus.SHIPPED) {
        throw new UnprocessableEntityError(
          `Cannot deliver order in '${order.status}' status. Order must be in SHIPPED status to be delivered.`
        );
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DELIVERED },
      });

      // Record Transactional Outbox Event for Delivery
      await outboxService.recordEvent(tx, {
        aggregateType: 'Order',
        aggregateId: order.id,
        eventType: EVENT_TYPES.ORDER_DELIVERED,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: OrderStatus.DELIVERED,
          deliveredBy: user.userId,
          deliveredAt: options?.deliveredAt || new Date().toISOString(),
          deliveryNotes: options?.deliveryNotes || options?.notes || null,
          notes: options?.notes || options?.deliveryNotes || null,
        },
      });

      return {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        message: 'Order successfully marked as DELIVERED.',
      };
    });
  }
}

export const orderService = new OrderService();
