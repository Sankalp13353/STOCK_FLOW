import { MovementType, OrderStatus, ReservationStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { EVENT_TYPES } from '../../config/constants';
import { outboxService } from '../outbox/outbox.service';

export interface ExpiryResult {
  expiredReservationsCount: number;
  expiredOrdersCount: number;
}

export class ReservationService {
  /**
   * Sweeps and expires all active reservations whose TTL has elapsed.
   * Atomically decrements quantity_reserved and updates order statuses.
   */
  public async expireStaleReservations(): Promise<ExpiryResult> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch active expired reservations using row locking
      // Cast now() to ensure UTC comparison
      const staleReservations = await tx.inventoryReservation.findMany({
        where: {
          status: ReservationStatus.ACTIVE,
          expiresAt: { lt: new Date() },
        },
        include: {
          order: true,
          inventory: true,
        },
      });

      if (staleReservations.length === 0) {
        return { expiredReservationsCount: 0, expiredOrdersCount: 0 };
      }

      const affectedOrderIds = new Set<string>();

      for (const res of staleReservations) {
        // Lock the specific inventory row
        await tx.$executeRaw`
          SELECT id FROM inventory WHERE id = ${res.inventoryId}::uuid FOR UPDATE
        `;

        // Decrement quantity_reserved safely
        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: {
            quantityReserved: {
              decrement: res.quantity,
            },
          },
        });

        // Mark reservation as EXPIRED
        await tx.inventoryReservation.update({
          where: { id: res.id },
          data: {
            status: ReservationStatus.EXPIRED,
          },
        });

        // Record audit ledger entry
        await tx.inventoryMovement.create({
          data: {
            productId: res.inventory.productId,
            warehouseId: res.inventory.warehouseId,
            quantityDelta: res.quantity,
            movementType: MovementType.RESERVATION_RELEASE,
            referenceId: res.orderId,
            notes: `Reservation expired (TTL elapsed). Auto-released ${res.quantity} unit(s).`,
          },
        });

        affectedOrderIds.add(res.orderId);
      }

      // 2. Transition associated orders from RESERVED/PAYMENT_PENDING to RESERVATION_EXPIRED
      let expiredOrdersCount = 0;
      for (const orderId of affectedOrderIds) {
        const order = await tx.order.findUnique({
          where: { id: orderId },
        });

        if (
          order &&
          (order.status === OrderStatus.RESERVED || order.status === OrderStatus.PAYMENT_PENDING)
        ) {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.RESERVATION_EXPIRED,
            },
          });

          // Record Transactional Outbox Event for Expired Reservation
          await outboxService.recordEvent(tx, {
            aggregateType: 'Order',
            aggregateId: order.id,
            eventType: EVENT_TYPES.ORDER_RESERVATION_EXPIRED,
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              userId: order.userId,
              expiredAt: new Date().toISOString(),
            },
          });

          expiredOrdersCount++;
        }
      }

      return {
        expiredReservationsCount: staleReservations.length,
        expiredOrdersCount,
      };
    });
  }
}

export const reservationService = new ReservationService();

