import { UserRole, UserWarehouseAssignment, Warehouse } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error';

export interface UserWarehouseAssignmentWithDetails extends UserWarehouseAssignment {
  warehouse: Warehouse;
}

export class WarehouseAccessService {
  /**
   * Checks whether a user has permission to access a specific warehouse.
   * - ADMIN: Organization-wide access to all warehouses.
   * - WAREHOUSE_MANAGER & WAREHOUSE_STAFF: Access only to specifically assigned warehouses.
   * - CUSTOMER: No access to internal warehouse facilities.
   */
  public async hasWarehouseAccess(
    userId: string,
    role: UserRole,
    warehouseId: string
  ): Promise<boolean> {
    if (role === UserRole.ADMIN) {
      return true;
    }

    if (role === UserRole.CUSTOMER) {
      return false;
    }

    // Role is WAREHOUSE_MANAGER or WAREHOUSE_STAFF
    const assignment = await prisma.userWarehouseAssignment.findUnique({
      where: {
        userId_warehouseId: {
          userId,
          warehouseId,
        },
      },
    });

    return Boolean(assignment);
  }

  /**
   * Enforces warehouse access, throwing ForbiddenError if unauthorized.
   */
  public async ensureWarehouseAccess(
    userId: string,
    role: UserRole,
    warehouseId: string
  ): Promise<void> {
    const hasAccess = await this.hasWarehouseAccess(userId, role, warehouseId);
    if (!hasAccess) {
      throw new ForbiddenError(
        `Access denied to warehouse '${warehouseId}'. You do not have an active assignment to this facility.`,
        'FORBIDDEN_WAREHOUSE_ACCESS'
      );
    }
  }

  /**
   * Returns list of warehouse IDs accessible by the user, or 'ALL' for ADMIN.
   */
  public async getAccessibleWarehouseIds(
    userId: string,
    role: UserRole
  ): Promise<string[] | 'ALL'> {
    if (role === UserRole.ADMIN) {
      return 'ALL';
    }

    if (role === UserRole.CUSTOMER) {
      return [];
    }

    const assignments = await prisma.userWarehouseAssignment.findMany({
      where: { userId },
      select: { warehouseId: true },
    });

    return assignments.map((a) => a.warehouseId);
  }

  /**
   * Assigns a user to a warehouse facility.
   * Prevents duplicate assignments and verifies entity existence.
   */
  public async assignUserToWarehouse(
    userId: string,
    warehouseId: string,
    assignmentRole?: UserRole
  ): Promise<UserWarehouseAssignment> {
    // 1. Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found`);
    }

    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError(
        'Cannot assign warehouse facilities to users with CUSTOMER role. Promote user to WAREHOUSE_STAFF or WAREHOUSE_MANAGER first.',
        'INVALID_ROLE_ASSIGNMENT'
      );
    }

    // 2. Verify warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID '${warehouseId}' not found`);
    }

    // 3. Check for duplicate assignment
    const existing = await prisma.userWarehouseAssignment.findUnique({
      where: {
        userId_warehouseId: {
          userId,
          warehouseId,
        },
      },
    });

    if (existing) {
      throw new ConflictError(
        `User '${user.fullName}' is already assigned to warehouse '${warehouse.code}'`,
        'DUPLICATE_WAREHOUSE_ASSIGNMENT'
      );
    }

    // 4. Create assignment record
    return prisma.userWarehouseAssignment.create({
      data: {
        userId,
        warehouseId,
        role: assignmentRole || user.role,
      },
    });
  }

  /**
   * Removes a user's assignment from a warehouse, immediately revoking access.
   */
  public async removeUserWarehouseAssignment(
    userId: string,
    warehouseId: string
  ): Promise<void> {
    const existing = await prisma.userWarehouseAssignment.findUnique({
      where: {
        userId_warehouseId: {
          userId,
          warehouseId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundError(
        `Assignment between user '${userId}' and warehouse '${warehouseId}' does not exist.`
      );
    }

    await prisma.userWarehouseAssignment.delete({
      where: {
        userId_warehouseId: {
          userId,
          warehouseId,
        },
      },
    });
  }

  /**
   * Retrieves all warehouse assignments for a given user.
   */
  public async getUserWarehouseAssignments(
    userId: string
  ): Promise<UserWarehouseAssignmentWithDetails[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found`);
    }

    return prisma.userWarehouseAssignment.findMany({
      where: { userId },
      include: {
        warehouse: true,
      },
      orderBy: { assignedAt: 'desc' },
    });
  }
}

export const warehouseAccessService = new WarehouseAccessService();

