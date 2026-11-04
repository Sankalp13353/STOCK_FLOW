import { NotificationType, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { NotFoundError, ForbiddenError } from '../../common/errors/app-error';

export interface CreateNotificationInput {
  userId: string;
  ticketId?: string | null;
  orderId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  dedupKey?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface ListNotificationsQuery {
  isRead?: boolean;
  page?: number;
  limit?: number;
}

export class NotificationService {
  /**
   * Creates an in-app notification idempotently using dedupKey.
   * If a notification with the same dedupKey already exists, returns the existing record.
   */
  public async createNotification(
    input: CreateNotificationInput,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || prisma;

    if (input.dedupKey) {
      const existing = await client.notification.findUnique({
        where: { dedupKey: input.dedupKey },
      });
      if (existing) {
        return existing;
      }
    }

    try {
      return await client.notification.create({
        data: {
          userId: input.userId,
          ticketId: input.ticketId || null,
          orderId: input.orderId || null,
          type: input.type,
          title: input.title,
          message: input.message,
          dedupKey: input.dedupKey || null,
          metadata: input.metadata || Prisma.JsonNull,
        },
      });
    } catch (error) {
      // Catch concurrent unique constraint violations on dedupKey
      if (
        input.dedupKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await client.notification.findUnique({
          where: { dedupKey: input.dedupKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Broadcasts a notification to all ADMIN users.
   */
  public async notifyAdmins(
    params: {
      ticketId?: string | null;
      orderId?: string | null;
      type: NotificationType;
      title: string;
      message: string;
      dedupKeyPrefix?: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || prisma;
    const admins = await client.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    const notifications = [];
    for (const admin of admins) {
      const dedupKey = params.dedupKeyPrefix
        ? `${params.dedupKeyPrefix}:${admin.id}`
        : undefined;

      const n = await this.createNotification(
        {
          userId: admin.id,
          ticketId: params.ticketId,
          orderId: params.orderId,
          type: params.type,
          title: params.title,
          message: params.message,
          dedupKey,
          metadata: params.metadata,
        },
        client
      );
      notifications.push(n);
    }
    return notifications;
  }

  /**
   * Broadcasts a notification to all managers assigned to the specified warehouses.
   */
  public async notifyWarehouseManagers(
    warehouseIds: string[],
    params: {
      ticketId?: string | null;
      orderId?: string | null;
      type: NotificationType;
      title: string;
      message: string;
      dedupKeyPrefix?: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || prisma;
    if (!warehouseIds || warehouseIds.length === 0) return [];

    const assignments = await client.userWarehouseAssignment.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        user: { role: UserRole.WAREHOUSE_MANAGER },
      },
      select: { userId: true },
    });

    const uniqueManagerIds = Array.from(new Set(assignments.map((a) => a.userId)));
    const notifications = [];

    for (const managerId of uniqueManagerIds) {
      const dedupKey = params.dedupKeyPrefix
        ? `${params.dedupKeyPrefix}:${managerId}`
        : undefined;

      const n = await this.createNotification(
        {
          userId: managerId,
          ticketId: params.ticketId,
          orderId: params.orderId,
          type: params.type,
          title: params.title,
          message: params.message,
          dedupKey,
          metadata: params.metadata,
        },
        client
      );
      notifications.push(n);
    }

    return notifications;
  }

  /**
   * Lists notifications for a specific user with pagination and optional isRead filter.
   */
  public async listUserNotifications(userId: string, query: ListNotificationsQuery = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
    };

    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              type: true,
              status: true,
              priority: true,
            },
          },
        },
      }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Marks a single notification as read, ensuring ownership.
   */
  public async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenError('Cannot modify another user notification', 'FORBIDDEN_NOTIFICATION_ACCESS');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  public async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updatedCount: result.count };
  }
}

export const notificationService = new NotificationService();
