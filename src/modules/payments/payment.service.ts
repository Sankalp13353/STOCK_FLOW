import { MovementType, OrderStatus, Payment, PaymentStatus, ReservationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../common/errors/app-error';
import { ProcessPaymentInput } from './payment.schemas';
import { EVENT_TYPES } from '../../config/constants';
import { outboxService } from '../outbox/outbox.service';

export interface PaymentProcessResult {
  payment: Payment;
  orderId: string;
  orderStatus: OrderStatus;
  message: string;
}

export class PaymentService {
  public async processPayment(
    input: ProcessPaymentInput,
    user: { userId: string; role: UserRole }
  ): Promise<PaymentProcessResult> {
    const { orderId, amountCents, paymentMethod, simulateOutcome } = input;

    return prisma.$transaction(async (tx) => {
      // 1. Lock Order row for update
      await tx.$executeRaw`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          inventoryReservations: {
            include: { inventory: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      // 2. Authorization check
      if (user.role !== UserRole.ADMIN && order.userId !== user.userId) {
        throw new ForbiddenError('You are not authorized to process payment for this order');
      }

      // 3. State verification
      if (order.status === OrderStatus.CONFIRMED) {
        throw new UnprocessableEntityError('Order is already confirmed and paid');
      }

      if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.PAYMENT_FAILED ||
        order.status === OrderStatus.RESERVATION_EXPIRED
      ) {
        throw new UnprocessableEntityError(`Cannot pay for an order in '${order.status}' status`);
      }

      // 4. Validate amount
      if (amountCents !== order.totalAmountCents) {
        throw new BadRequestError(
          `Payment amount (${amountCents} cents) does not match order total (${order.totalAmountCents} cents)`
        );
      }

      const txRef = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      // 5. Outcome branch
      if (simulateOutcome === 'SUCCESS') {
        // Record payment
        const payment = await tx.payment.create({
          data: {
            orderId,
            amountCents,
            status: PaymentStatus.SUCCESS,
            paymentMethod,
            transactionReference: txRef,
          },
        });

        // Commit active reservations: deduct from on_hand & reserved
        for (const res of order.inventoryReservations) {
          if (res.status === ReservationStatus.ACTIVE) {
            // Lock inventory row
            await tx.$executeRaw`
              SELECT id FROM inventory WHERE id = ${res.inventoryId}::uuid FOR UPDATE
            `;

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
                movementType: MovementType.FULFILLMENT_DEDUCTION,
                referenceId: order.id,
                notes: `Order payment confirmed. Committed ${res.quantity} unit(s).`,
              },
            });
          }
        }

        // Update Order to CONFIRMED
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CONFIRMED },
        });

        // Record Transactional Outbox Event for Payment Success & Order Confirmation
        await outboxService.recordEvent(tx, {
          aggregateType: 'Order',
          aggregateId: order.id,
          eventType: EVENT_TYPES.ORDER_CONFIRMED,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            userId: order.userId,
            paymentId: payment.id,
            amountCents: payment.amountCents,
            confirmedAt: new Date().toISOString(),
          },
        });

        return {
          payment,
          orderId,
          orderStatus: OrderStatus.CONFIRMED,
          message: 'Payment processed successfully. Order confirmed.',
        };
      } else {
        // Payment Failure Simulation
        const payment = await tx.payment.create({
          data: {
            orderId,
            amountCents,
            status: PaymentStatus.FAILED,
            paymentMethod,
            transactionReference: txRef,
            failureReason: 'Card authorization failed: Simulated bank decline',
          },
        });

        // Release active reservations: decrement reserved stock
        for (const res of order.inventoryReservations) {
          if (res.status === ReservationStatus.ACTIVE) {
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
                notes: `Payment failed. Released ${res.quantity} unit(s) back to available inventory.`,
              },
            });
          }
        }

        // Update Order to PAYMENT_FAILED
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAYMENT_FAILED },
        });

        // Record Transactional Outbox Event for Payment Failure
        await outboxService.recordEvent(tx, {
          aggregateType: 'Order',
          aggregateId: order.id,
          eventType: EVENT_TYPES.ORDER_PAYMENT_FAILED,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            userId: order.userId,
            paymentId: payment.id,
            amountCents: payment.amountCents,
            failureReason: payment.failureReason || 'Simulated bank decline',
            failedAt: new Date().toISOString(),
          },
        });

        return {
          payment,
          orderId,
          orderStatus: OrderStatus.PAYMENT_FAILED,
          message: 'Payment simulation declined. Reserved stock released.',
        };
      }
    });
  }
}

export const paymentService = new PaymentService();

