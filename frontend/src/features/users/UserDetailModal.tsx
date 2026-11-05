import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { updateUserStatus } from '../../api/users';
import { UserItem } from '../../types/users';
import { useAuth } from '../../hooks/useAuth';
import {
  User as UserIcon,
  Mail,
  Shield,
  Calendar,
  Building2,
  Power,
  Pencil,
  Sliders,
  AlertTriangle,
} from 'lucide-react';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserItem | null;
  onEdit: (user: UserItem) => void;
  onManageAssignments: (user: UserItem) => void;
  onSuccess?: (msg: string) => void;
}

export function UserDetailModal({
  isOpen,
  onClose,
  user,
  onEdit,
  onManageAssignments,
  onSuccess,
}: UserDetailModalProps) {
  const { user: currentOperator } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const isSelf = currentOperator?.id === user?.id;

  const toggleStatusMutation = useMutation({
    mutationFn: (newActive: boolean) => updateUserStatus(user!.id, newActive),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-users'] });
      if (onSuccess) {
        onSuccess(
          `Account for ${updated.fullName} has been ${updated.isActive ? 'reactivated' : 'deactivated'}.`
        );
      }
      onClose();
    },
    onError: (err: any) => {
      setActionError(
        err.response?.data?.error?.message || err.message || 'Failed to update account status.'
      );
    },
  });

  if (!user) return null;

  const roleBadgeVariant =
    user.role === 'ADMIN'
      ? 'purple'
      : user.role === 'WAREHOUSE_MANAGER'
      ? 'brand'
      : user.role === 'WAREHOUSE_STAFF'
      ? 'brand'
      : 'neutral';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <span>{user.fullName}</span>
          <Badge variant={user.isActive ? 'success' : 'danger'} size="sm">
            {user.isActive ? 'ACTIVE' : 'DEACTIVATED'}
          </Badge>
          <Badge variant={roleBadgeVariant} size="sm">
            {user.role}
          </Badge>
        </div>
      }
      subtitle={`User UUID: ${user.id}`}
      maxWidth="md"
    >
      <div className="space-y-5">
        {actionError && (
          <ErrorMessage
            title="Action Failed"
            message={actionError}
            onRetry={() => setActionError(null)}
          />
        )}

        {/* Identity & Details Card */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Full Name
              </span>
              <p className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                {user.fullName}
              </p>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Email Address
              </span>
              <p className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {user.email}
              </p>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                System Role
              </span>
              <p className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                {user.role}
              </p>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Account Created
              </span>
              <p className="font-mono text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Warehouse Assignments Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-brand-600" />
              <span>Assigned Warehouse Facilities</span>
            </h4>
            {user.role !== 'CUSTOMER' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onManageAssignments(user);
                }}
                leftIcon={<Sliders className="w-3.5 h-3.5" />}
                className="text-xs py-1 px-2 h-7"
              >
                Manage
              </Button>
            )}
          </div>

          {user.role === 'CUSTOMER' ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 italic">
              Customer accounts do not hold facility assignments.
            </div>
          ) : !user.warehouseAssignments || user.warehouseAssignments.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500">
              <p className="font-medium text-slate-700">No warehouse facilities assigned.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                This operator cannot view or fulfill orders until assigned to at least one facility.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {user.warehouseAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100">
                      {assignment.warehouse.code}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-800">{assignment.warehouse.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {assignment.warehouse.city}, {assignment.warehouse.country}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Assigned: {new Date(assignment.assignedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            {user.role !== 'ADMIN' || !isSelf ? (
              <Button
                variant={user.isActive ? 'danger' : 'primary'}
                size="sm"
                onClick={() => {
                  const confirmMsg = user.isActive
                    ? `Are you sure you want to deactivate ${user.fullName}'s account? They will be immediately blocked from accessing the system.`
                    : `Reactivate account for ${user.fullName}?`;
                  if (window.confirm(confirmMsg)) {
                    toggleStatusMutation.mutate(!user.isActive);
                  }
                }}
                isLoading={toggleStatusMutation.isPending}
                leftIcon={<Power className="w-3.5 h-3.5" />}
              >
                {user.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            ) : (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Self-deactivation disabled
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(user);
              }}
              leftIcon={<Pencil className="w-3.5 h-3.5" />}
            >
              Edit Details
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
