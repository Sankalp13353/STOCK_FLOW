import { MovementType, Order, OrderStatus, Prisma, ReservationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { APP_CONSTANTS } from '../../config/constants';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../common/errors/app-error';
import { hashPayload } from '../../common/utils/crypto';
import { CancelOrderInput, CreateOrderInput, ListOrdersQuery } from './order.schemas';

export interface OrderCreationResult {
  order: Order & {
    items: any[];
    reservations: any[];
  };
  isIdempotentReplay?: boolean;
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
        // Return cached original response
        return {
          order: existingRecord.responseBody as any,
          isIdempotentReplay: true,
        };
      }
    }

    // 2. Validate all products exist and are active
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    });

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missing = productIds.find((id) => !foundIds.has(id));
      throw new NotFoundError(`Active product with ID '${missing}' not found`);
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 3. Execute Concurrency-Controlled Atomic Transaction
    try {
      return await prisma.$transaction(async (tx) => {
        // Step A: Resolve target inventory row for each item
        const resolvedItems: Array<{
          productId: string;
          warehouseId: string;
          quantity: number;
          inventoryId: string;
          unitPriceCents: number;
          subtotalCents: number;
        }> = [];

        for (const item of items) {
          const prod = productMap.get(item.productId)!;
          let targetInventoryId: string;
          let targetWarehouseId: string;

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

            targetInventoryId = inv.id;
            targetWarehouseId = item.warehouseId;
          } else {
            // Deterministic Allocation Policy:
            // Pick the first active warehouse with sufficient stock (on_hand - reserved >= quantity), sorted by warehouse code ASC.
            const candidateInventories = await tx.inventory.findMany({
              where: {
                productId: item.productId,
                warehouse: { isActive: true },
              },
              include: { warehouse: true },
              orderBy: { warehouse: { code: 'asc' } },
            });

            const match = candidateInventories.find(
              (inv) => inv.quantityOnHand - inv.quantityReserved >= item.quantity
            );

            if (!match) {
              throw new ConflictError(
                `Insufficient stock available across warehouses for product '${prod.name}' (SKU: ${prod.sku}). Requested: ${item.quantity}.`
              );
            }

            targetInventoryId = match.id;
            targetWarehouseId = match.warehouseId;
          }

          resolvedItems.push({
            productId: item.productId,
            warehouseId: targetWarehouseId,
            quantity: item.quantity,
            inventoryId: targetInventoryId,
            unitPriceCents: prod.priceCents,
            subtotalCents: prod.priceCents * item.quantity,
          });
        }

        // Step B: Deadlock Prevention — Sort inventory IDs deterministically before acquiring locks
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

        // Step G: Save Idempotency Record
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
   */
  public async getOrderById(orderId: string, user: { userId: string; role: UserRole }): Promise<any> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
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

    if (user.role !== UserRole.ADMIN && order.userId !== user.userId) {
      throw new ForbiddenError('You are not authorized to view this order');
    }

    return order;
  }

  /**
   * Lists customer orders (or all orders for Admin) with pagination and optional status filter.
   */
  public async listOrders(query: ListOrdersQuery, user: { userId: string; role: UserRole }) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (user.role !== UserRole.ADMIN) {
      where.userId = user.userId;
    }

    if (status) {
      where.status = status;
    }

    const [totalRecords, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          orderItems: {
            include: {
              product: { select: { sku: true, name: true } },
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

      // Handle uncommitted reservations (RESERVED, PAYMENT_PENDING)
      if (
        order.status === OrderStatus.RESERVED ||
        order.status === OrderStatus.PAYMENT_PENDING ||
        order.status === OrderStatus.PENDING
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
                notes: `Order cancelled. Released ${res.quantity} reserved unit(s). Reason: ${reason || 'Customer requested cancellation'}`,
              },
            });

            stockReleased = true;
          }
        }
      } else if (order.status === OrderStatus.CONFIRMED) {
        // Order was already confirmed: physical stock was deducted from on_hand!
        // We restock physical quantity back to quantity_on_hand.
        for (const item of order.orderItems) {
          await tx.$executeRaw`
            SELECT id FROM inventory WHERE product_id = ${item.productId}::uuid AND warehouse_id = ${item.warehouseId}::uuid FOR UPDATE
          `;

          await tx.inventory.update({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: item.warehouseId,
              },
            },
            data: {
              quantityOnHand: { increment: item.quantity },
            },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantityDelta: item.quantity,
              movementType: MovementType.RESTOCK,
              referenceId: order.id,
              notes: `Order cancellation restock. Returned ${item.quantity} unit(s) to physical stock. Reason: ${reason || 'Customer cancellation'}`,
            },
          });

          stockReleased = true;
        }
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        message: 'Order cancelled successfully.',
        compensation: { stockReleased },
      };
    });
  }
}

export const orderService = new OrderService();
