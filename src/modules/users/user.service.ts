import bcrypt from 'bcrypt';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { APP_CONSTANTS } from '../../config/constants';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app-error';
import { warehouseAccessService } from '../warehouses/warehouse-access.service';
import { outboxService } from '../outbox/outbox.service';
import {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './user.schemas';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  warehouseAssignments?: Array<{
    id: string;
    warehouseId: string;
    role: UserRole | null;
    assignedAt: Date;
    warehouse: {
      id: string;
      code: string;
      name: string;
      city: string;
      country: string;
      isActive: boolean;
    };
  }>;
}

export interface CallerContext {
  userId: string;
  email: string;
  role: UserRole;
}

export class UserService {
  /**
   * Lists users with role filtering, search, status filtering, and pagination.
   * Never exposes password hashes or sensitive security material.
   */
  public async listUsers(query: ListUsersQuery): Promise<{
    users: UserSummary[];
    pagination: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
    };
  }> {
    const { page, limit, role, status, isActive, search } = query;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.UserWhereInput[] = [];

    if (role) {
      andConditions.push({ role });
    }

    if (status === 'ACTIVE' || isActive === 'true') {
      andConditions.push({ isActive: true });
    } else if (status === 'DEACTIVATED' || isActive === 'false') {
      andConditions.push({ isActive: false });
    }

    if (search && search.trim()) {
      const q = search.trim();
      andConditions.push({
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { fullName: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [totalRecords, rawUsers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          warehouseAssignments: {
            select: {
              id: true,
              warehouseId: true,
              role: true,
              assignedAt: true,
              warehouse: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  city: true,
                  country: true,
                  isActive: true,
                },
              },
            },
            orderBy: { assignedAt: 'desc' },
          },
        },
      }),
    ]);

    return {
      users: rawUsers,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single user details and warehouse assignments by ID.
   */
  public async getUserById(id: string): Promise<UserSummary> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        warehouseAssignments: {
          select: {
            id: true,
            warehouseId: true,
            role: true,
            assignedAt: true,
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
                city: true,
                country: true,
                isActive: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundError(`User with ID '${id}' not found`);
    }

    return user;
  }

  /**
   * Creates an internal organization user (Manager, Staff, Customer).
   * Safeguards:
   * - Cannot create ADMIN through standard form (must use secure CLI bootstrap/create).
   * - Never exposes passwords.
   * - Enforces email uniqueness.
   * - Forbids customer warehouse assignments.
   * - Persists audit event in transactional outbox.
   */
  public async createUser(input: CreateUserInput, caller: CallerContext): Promise<UserSummary> {
    // 1. Guard against standard form Admin provisioning
    if (input.role === UserRole.ADMIN) {
      throw new BadRequestError(
        'Administrator accounts cannot be created via standard user management. Use the administrative provisioning CLI (npm run admin:create).',
        'ADMIN_CREATION_RESTRICTED'
      );
    }

    // 2. Validate email uniqueness
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictError(`User with email '${normalizedEmail}' already exists`);
    }

    // 3. Customers cannot be assigned to warehouses
    if (input.role === UserRole.CUSTOMER && input.warehouseIds && input.warehouseIds.length > 0) {
      throw new BadRequestError(
        'Cannot assign warehouse facilities to users with CUSTOMER role.',
        'INVALID_ROLE_ASSIGNMENT'
      );
    }

    // 4. Validate warehouse existence if provided
    const uniqueWarehouseIds = input.warehouseIds ? Array.from(new Set(input.warehouseIds)) : [];
    if (uniqueWarehouseIds.length > 0) {
      const existingWarehouses = await prisma.warehouse.findMany({
        where: { id: { in: uniqueWarehouseIds } },
        select: { id: true },
      });
      if (existingWarehouses.length !== uniqueWarehouseIds.length) {
        throw new NotFoundError('One or more specified warehouse IDs do not exist.');
      }
    }

    // 5. Hash password
    const passwordHash = await bcrypt.hash(input.password, APP_CONSTANTS.PASSWORD_SALT_ROUNDS);

    // 6. Execute atomic creation + warehouse assignments + outbox audit event
    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName: input.fullName.trim(),
          role: input.role,
          isActive: true,
        },
      });

      if (uniqueWarehouseIds.length > 0) {
        await tx.userWarehouseAssignment.createMany({
          data: uniqueWarehouseIds.map((whId) => ({
            userId: user.id,
            warehouseId: whId,
            role: input.role,
          })),
        });
      }

      // Record audit event in outbox
      await outboxService.recordEvent(tx, {
        aggregateType: 'USER',
        aggregateId: user.id,
        eventType: 'user.created',
        payload: {
          actor: {
            userId: caller.userId,
            email: caller.email,
            role: caller.role,
          },
          action: 'USER_CREATED',
          targetUserId: user.id,
          targetEmail: user.email,
          targetFullName: user.fullName,
          assignedRole: user.role,
          warehouseIds: uniqueWarehouseIds,
          timestamp: new Date().toISOString(),
        },
      });

      return user;
    });

    return this.getUserById(createdUser.id);
  }

  /**
   * Updates an existing user's details, role, active status, or warehouse assignments.
   * Safeguards:
   * - Last active Admin cannot be deactivated or demoted.
   * - Accidental self-lockout prevented (cannot self-deactivate or self-demote).
   * - Direct role elevation to ADMIN rejected.
   * - Customer accounts cannot hold warehouse assignments (cleaned up automatically if demoted to customer).
   * - Deactivation takes effect immediately.
   * - Transactional audit logging.
   */
  public async updateUser(
    id: string,
    input: UpdateUserInput,
    caller: CallerContext
  ): Promise<UserSummary> {
    const target = await this.getUserById(id);

    // 1. Last Admin Protection
    if (target.role === UserRole.ADMIN) {
      const isDemotion = input.role !== undefined && input.role !== UserRole.ADMIN;
      const isDeactivation = input.isActive === false;

      if (isDemotion || isDeactivation) {
        const activeAdminCount = await prisma.user.count({
          where: { role: UserRole.ADMIN, isActive: true },
        });

        if (activeAdminCount <= 1) {
          throw new BadRequestError(
            'Cannot deactivate or demote the last active administrator.',
            'LAST_ADMIN_PROTECTION'
          );
        }
      }
    }

    // 2. Self-Lockout Protection
    if (caller.userId === target.id) {
      if (input.role !== undefined && input.role !== UserRole.ADMIN && caller.role === UserRole.ADMIN) {
        throw new BadRequestError(
          'Cannot modify your own administrator role to prevent self-lockout.',
          'SELF_LOCKOUT_PREVENTION'
        );
      }
      if (input.isActive === false) {
        throw new BadRequestError(
          'Cannot deactivate your own account to prevent self-lockout.',
          'SELF_LOCKOUT_PREVENTION'
        );
      }
    }

    // 3. Direct Privilege Escalation Protection
    if (input.role === UserRole.ADMIN && target.role !== UserRole.ADMIN) {
      throw new BadRequestError(
        'Direct role elevation to ADMIN is restricted. Use the administrative provisioning CLI (npm run admin:create).',
        'ELEVATION_RESTRICTED'
      );
    }

    // 4. Email uniqueness validation if updated
    let normalizedEmail: string | undefined = undefined;
    if (input.email) {
      normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== target.email) {
        const existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (existing && existing.id !== target.id) {
          throw new ConflictError(`User with email '${normalizedEmail}' already exists`);
        }
      }
    }

    const effectiveRole = input.role || target.role;

    // 5. Customer role restrictions on warehouse assignments
    if (effectiveRole === UserRole.CUSTOMER && input.warehouseIds && input.warehouseIds.length > 0) {
      throw new BadRequestError(
        'Cannot assign warehouse facilities to users with CUSTOMER role.',
        'INVALID_ROLE_ASSIGNMENT'
      );
    }

    // 6. Validate warehouses if updating assignments
    let uniqueWarehouseIds: string[] | undefined = undefined;
    if (input.warehouseIds !== undefined) {
      uniqueWarehouseIds = Array.from(new Set(input.warehouseIds));
      if (uniqueWarehouseIds.length > 0) {
        const count = await prisma.warehouse.count({
          where: { id: { in: uniqueWarehouseIds } },
        });
        if (count !== uniqueWarehouseIds.length) {
          throw new NotFoundError('One or more specified warehouse IDs do not exist.');
        }
      }
    }

    // 7. Execute atomic update
    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.UserUpdateInput = {};
      if (input.fullName !== undefined) updateData.fullName = input.fullName.trim();
      if (normalizedEmail !== undefined) updateData.email = normalizedEmail;
      if (input.role !== undefined) updateData.role = input.role;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      await tx.user.update({
        where: { id },
        data: updateData,
      });

      // If user is now a customer, wipe existing assignments
      if (effectiveRole === UserRole.CUSTOMER) {
        await tx.userWarehouseAssignment.deleteMany({
          where: { userId: id },
        });
      } else if (uniqueWarehouseIds !== undefined) {
        // Sync warehouse assignments
        await tx.userWarehouseAssignment.deleteMany({
          where: { userId: id },
        });

        if (uniqueWarehouseIds.length > 0) {
          await tx.userWarehouseAssignment.createMany({
            data: uniqueWarehouseIds.map((whId) => ({
              userId: id,
              warehouseId: whId,
              role: effectiveRole,
            })),
          });
        }
      }

      // Record audit event
      await outboxService.recordEvent(tx, {
        aggregateType: 'USER',
        aggregateId: id,
        eventType: 'user.updated',
        payload: {
          actor: {
            userId: caller.userId,
            email: caller.email,
            role: caller.role,
          },
          action: 'USER_UPDATED',
          targetUserId: id,
          previous: {
            fullName: target.fullName,
            email: target.email,
            role: target.role,
            isActive: target.isActive,
          },
          new: {
            fullName: input.fullName ?? target.fullName,
            email: normalizedEmail ?? target.email,
            role: input.role ?? target.role,
            isActive: input.isActive ?? target.isActive,
            warehouseIds: uniqueWarehouseIds,
          },
          timestamp: new Date().toISOString(),
        },
      });
    });

    return this.getUserById(id);
  }

  /**
   * Assigns a user to a warehouse facility.
   */
  public async assignWarehouse(
    userId: string,
    warehouseId: string,
    role: UserRole | undefined,
    caller: CallerContext
  ) {
    const assignment = await warehouseAccessService.assignUserToWarehouse(userId, warehouseId, role);

    // Audit event
    await prisma.$transaction(async (tx) => {
      await outboxService.recordEvent(tx, {
        aggregateType: 'WAREHOUSE',
        aggregateId: warehouseId,
        eventType: 'warehouse.user_assigned',
        payload: {
          actor: { userId: caller.userId, email: caller.email, role: caller.role },
          action: 'WAREHOUSE_ASSIGNED',
          targetUserId: userId,
          targetWarehouseId: warehouseId,
          role: assignment.role,
          timestamp: new Date().toISOString(),
        },
      });
    });

    return assignment;
  }

  /**
   * Removes a user's warehouse assignment immediately.
   */
  public async removeWarehouseAssignment(
    userId: string,
    warehouseId: string,
    caller: CallerContext
  ): Promise<void> {
    await warehouseAccessService.removeUserWarehouseAssignment(userId, warehouseId);

    // Audit event
    await prisma.$transaction(async (tx) => {
      await outboxService.recordEvent(tx, {
        aggregateType: 'WAREHOUSE',
        aggregateId: warehouseId,
        eventType: 'warehouse.user_unassigned',
        payload: {
          actor: { userId: caller.userId, email: caller.email, role: caller.role },
          action: 'WAREHOUSE_UNASSIGNED',
          targetUserId: userId,
          targetWarehouseId: warehouseId,
          timestamp: new Date().toISOString(),
        },
      });
    });
  }

  /**
   * Atomically synchronizes a user's warehouse assignments.
   */
  public async syncUserWarehouses(
    userId: string,
    warehouseIds: string[],
    caller: CallerContext
  ): Promise<UserSummary> {
    const user = await this.getUserById(userId);

    if (user.role === UserRole.CUSTOMER) {
      throw new BadRequestError(
        'Cannot assign warehouse facilities to users with CUSTOMER role.',
        'INVALID_ROLE_ASSIGNMENT'
      );
    }

    const uniqueWarehouseIds = Array.from(new Set(warehouseIds));
    if (uniqueWarehouseIds.length > 0) {
      const count = await prisma.warehouse.count({
        where: { id: { in: uniqueWarehouseIds } },
      });
      if (count !== uniqueWarehouseIds.length) {
        throw new NotFoundError('One or more specified warehouse IDs do not exist.');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userWarehouseAssignment.deleteMany({
        where: { userId },
      });

      if (uniqueWarehouseIds.length > 0) {
        await tx.userWarehouseAssignment.createMany({
          data: uniqueWarehouseIds.map((whId) => ({
            userId,
            warehouseId: whId,
            role: user.role,
          })),
        });
      }

      await outboxService.recordEvent(tx, {
        aggregateType: 'USER',
        aggregateId: userId,
        eventType: 'user.warehouses_synced',
        payload: {
          actor: { userId: caller.userId, email: caller.email, role: caller.role },
          action: 'WAREHOUSE_ASSIGNMENTS_SYNCED',
          targetUserId: userId,
          warehouseIds: uniqueWarehouseIds,
          timestamp: new Date().toISOString(),
        },
      });
    });

    return this.getUserById(userId);
  }

  /**
   * Retrieves all warehouse assignments for a given user.
   */
  public async getUserWarehouses(userId: string) {
    return warehouseAccessService.getUserWarehouseAssignments(userId);
  }

  /**
   * Retrieves all users assigned to a warehouse grouped by role (Managers, Staff).
   * RBAC:
   * - ADMIN: Org-wide.
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Only if assigned to this warehouse.
   * - CUSTOMER: Forbidden.
   */
  public async getWarehouseUsers(warehouseId: string, caller?: CallerContext) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${warehouseId}' not found`);
    }

    if (caller) {
      if (caller.role === UserRole.CUSTOMER) {
        throw new ForbiddenError('Access denied.', 'FORBIDDEN');
      }
      if (caller.role === UserRole.WAREHOUSE_MANAGER || caller.role === UserRole.WAREHOUSE_STAFF) {
        await warehouseAccessService.ensureWarehouseAccess(caller.userId, caller.role, warehouseId);
      }
    }

    const assignments = await prisma.userWarehouseAssignment.findMany({
      where: { warehouseId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const managers = assignments
      .filter((a) => (a.role || a.user.role) === UserRole.WAREHOUSE_MANAGER)
      .map((a) => ({
        ...a.user,
        assignmentId: a.id,
        assignedAt: a.assignedAt,
      }));

    const staff = assignments
      .filter((a) => (a.role || a.user.role) === UserRole.WAREHOUSE_STAFF)
      .map((a) => ({
        ...a.user,
        assignmentId: a.id,
        assignedAt: a.assignedAt,
      }));

    return {
      warehouseId,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      totalAssigned: assignments.length,
      managers,
      staff,
      assignments,
    };
  }
}

export const userService = new UserService();
