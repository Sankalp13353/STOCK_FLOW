import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { useAuth } from '../hooks/useAuth';
import { fetchUsers, updateUserStatus } from '../api/users';
import { UserItem } from '../types/users';
import { UserFormModal } from '../features/users/UserFormModal';
import { UserDetailModal } from '../features/users/UserDetailModal';
import { WarehouseAssignmentModal } from '../features/users/WarehouseAssignmentModal';
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Search,
  Plus,
  RefreshCw,
  Eye,
  Pencil,
  Power,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

export function UsersPage() {
  const { user: currentOperator } = useAuth();
  const isAdmin = currentOperator?.role === 'ADMIN';
  const queryClient = useQueryClient();

  // Filter & Pagination state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserItem | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [userForAssignment, setUserForAssignment] = useState<UserItem | null>(null);

  // 1. Fetch Users List
  const {
    data: usersData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['users', page, limit, roleFilter, statusFilter, search],
    queryFn: () =>
      fetchUsers({
        page,
        limit,
        role: roleFilter || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search.trim() || undefined,
      }),
    staleTime: 30 * 1000,
  });

  const users = usersData?.users || [];
  const pagination = usersData?.pagination;

  // 2. Fetch full users list for metrics calculations
  const { data: allUsersData } = useQuery({
    queryKey: ['users', 'metrics-summary'],
    queryFn: () => fetchUsers({ limit: 100 }),
    staleTime: 60 * 1000,
  });

  const allUsers = allUsersData?.users || [];
  const totalUsersCount = allUsers.length;
  const managersCount = allUsers.filter((u) => u.role === 'WAREHOUSE_MANAGER' && u.isActive).length;
  const staffCount = allUsers.filter((u) => u.role === 'WAREHOUSE_STAFF' && u.isActive).length;
  const customersCount = allUsers.filter((u) => u.role === 'CUSTOMER' && u.isActive).length;
  const deactivatedCount = allUsers.filter((u) => !u.isActive).length;

  // Mutation: Quick toggle status
  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      updateUserStatus(userId, isActive),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setToastMessage(
        `User ${updated.fullName} has been ${updated.isActive ? 'reactivated' : 'deactivated'}.`
      );
      setTimeout(() => setToastMessage(null), 5000);
    },
    onError: (err: any) => {
      setToastMessage(
        err.response?.data?.error?.message || err.message || 'Failed to update account status.'
      );
      setTimeout(() => setToastMessage(null), 5000);
    },
  });

  function handleOpenCreate() {
    setUserToEdit(null);
    setIsFormModalOpen(true);
  }

  function handleOpenEdit(user: UserItem) {
    setUserToEdit(user);
    setIsFormModalOpen(true);
  }

  function handleOpenDetail(user: UserItem) {
    setSelectedUser(user);
    setIsDetailModalOpen(true);
  }

  function handleOpenAssignment(user: UserItem) {
    setUserForAssignment(user);
    setIsAssignmentModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="User Administration & Roles"
        description="Manage organizational personnel, configure staff facility assignments, enforce RBAC boundaries, and oversee account security."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              title="Refresh users list"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>

            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreate}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create User
              </Button>
            )}
          </div>
        }
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Users */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Users
              </span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 font-mono">
                {totalUsersCount}
              </span>
              <span className="text-[10px] text-slate-500">registered</span>
            </div>
          </CardContent>
        </Card>

        {/* Warehouse Managers */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-purple-700 uppercase tracking-wider">
                Managers
              </span>
              <Shield className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-purple-700 font-mono">
                {managersCount}
              </span>
              <span className="text-[10px] text-purple-600">supervisors</span>
            </div>
          </CardContent>
        </Card>

        {/* Warehouse Staff */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-brand-700 uppercase tracking-wider">
                Staff
              </span>
              <UserCheck className="w-4 h-4 text-brand-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand-700 font-mono">
                {staffCount}
              </span>
              <span className="text-[10px] text-brand-600">fulfillment</span>
            </div>
          </CardContent>
        </Card>

        {/* Customers */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Customers
              </span>
              <Users className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-800 font-mono">
                {customersCount}
              </span>
              <span className="text-[10px] text-slate-500">B2B accounts</span>
            </div>
          </CardContent>
        </Card>

        {/* Deactivated */}
        <Card className={`border-slate-200 ${deactivatedCount > 0 ? 'bg-rose-50/40 border-rose-200' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-rose-700 uppercase tracking-wider">
                Deactivated
              </span>
              <UserX className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-700 font-mono">
                {deactivatedCount}
              </span>
              <span className="text-[10px] text-rose-600">suspended</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by full name or email address..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 placeholder-slate-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Roles</option>
              <option value="ADMIN">ADMIN</option>
              <option value="WAREHOUSE_MANAGER">WAREHOUSE_MANAGER</option>
              <option value="WAREHOUSE_STAFF">WAREHOUSE_STAFF</option>
              <option value="CUSTOMER">CUSTOMER</option>
            </select>

            {/* Account Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Account Statuses</option>
              <option value="ACTIVE">Active Accounts</option>
              <option value="DEACTIVATED">Deactivated Accounts</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Users Data Table */}
      <Card>
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner size="lg" message="Loading users ledger..." />
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorMessage
              title="Failed to Load Users"
              message={(error as any)?.response?.data?.error?.message || 'Error fetching users.'}
              onRetry={() => refetch()}
            />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8 text-slate-400" />}
            title="No Users Found"
            description={
              search || roleFilter || statusFilter !== 'ALL'
                ? 'No users match your active filter criteria. Try resetting the filters.'
                : 'No users registered in the system.'
            }
            actionLabel={isAdmin ? 'Create First User' : undefined}
            onAction={isAdmin ? handleOpenCreate : undefined}
            className="border-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">User Details</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Assigned Warehouses</th>
                  <th className="py-3 px-4 text-right">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {users.map((u) => {
                  const roleVariant =
                    u.role === 'ADMIN'
                      ? 'purple'
                      : u.role === 'WAREHOUSE_MANAGER'
                      ? 'brand'
                      : u.role === 'WAREHOUSE_STAFF'
                      ? 'brand'
                      : 'neutral';

                  const isSelf = currentOperator?.id === u.id;
                  const assignments = u.warehouseAssignments || [];

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{u.fullName}</span>
                          {isSelf && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                              You
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-4">
                        <Badge variant={roleVariant} size="sm">
                          {u.role}
                        </Badge>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        {u.isActive ? (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="danger" size="sm">
                            Deactivated
                          </Badge>
                        )}
                      </td>

                      {/* Assigned Facilities */}
                      <td className="py-3 px-4">
                        {u.role === 'CUSTOMER' ? (
                          <span className="text-slate-400 italic text-[11px]">N/A (Customer)</span>
                        ) : assignments.length === 0 ? (
                          <span className="text-amber-600 italic text-[11px] font-medium">Unassigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {assignments.map((a) => (
                              <span
                                key={a.id}
                                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                title={`${a.warehouse.name} (${a.warehouse.city})`}
                              >
                                {a.warehouse.code}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(u)}
                            className="p-1 h-7 w-7 text-slate-600 hover:text-slate-900"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {isAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(u)}
                                className="p-1 h-7 w-7 text-slate-600 hover:text-slate-900"
                                title="Edit User Details"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>

                              {u.role !== 'CUSTOMER' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenAssignment(u)}
                                  className="p-1 h-7 w-7 text-brand-600 hover:text-brand-800"
                                  title="Manage Facility Assignments"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {(!isSelf || u.role !== 'ADMIN') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const confirmMsg = u.isActive
                                      ? `Deactivate account for ${u.fullName}?`
                                      : `Reactivate account for ${u.fullName}?`;
                                    if (window.confirm(confirmMsg)) {
                                      toggleStatusMutation.mutate({
                                        userId: u.id,
                                        isActive: !u.isActive,
                                      });
                                    }
                                  }}
                                  className={`p-1 h-7 w-7 ${
                                    u.isActive
                                      ? 'text-rose-600 hover:text-rose-800'
                                      : 'text-emerald-600 hover:text-emerald-800'
                                  }`}
                                  title={u.isActive ? 'Deactivate User' : 'Reactivate User'}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalRecords > 0 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalRecords={pagination.totalRecords}
            limit={pagination.limit}
            onPageChange={(p) => setPage(p)}
          />
        )}
      </Card>

      {/* Create / Edit User Modal */}
      <UserFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setUserToEdit(null);
        }}
        userToEdit={userToEdit}
        onSuccess={(msg) => {
          setToastMessage(msg);
          setTimeout(() => setToastMessage(null), 5000);
          refetch();
        }}
      />

      {/* User Details Modal */}
      <UserDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onEdit={(u) => handleOpenEdit(u)}
        onManageAssignments={(u) => handleOpenAssignment(u)}
        onSuccess={(msg) => {
          setToastMessage(msg);
          setTimeout(() => setToastMessage(null), 5000);
          refetch();
        }}
      />

      {/* Warehouse Assignment Modal */}
      <WarehouseAssignmentModal
        isOpen={isAssignmentModalOpen}
        onClose={() => {
          setIsAssignmentModalOpen(false);
          setUserForAssignment(null);
        }}
        user={userForAssignment}
        onSuccess={(msg) => {
          setToastMessage(msg);
          setTimeout(() => setToastMessage(null), 5000);
          refetch();
        }}
      />
    </div>
  );
}
export default UsersPage;
