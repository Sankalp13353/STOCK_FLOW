import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { createUser, updateUser } from '../../api/users';
import { fetchWarehouses } from '../../api/warehouses';
import { UserItem } from '../../types/users';
import { Warehouse, UserRole } from '../../types';
import { UserPlus, UserCheck, ShieldAlert, Building2 } from 'lucide-react';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userToEdit?: UserItem | null;
  onSuccess?: (msg: string) => void;
}

export function UserFormModal({
  isOpen,
  onClose,
  userToEdit,
  onSuccess,
}: UserFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(userToEdit);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('WAREHOUSE_STAFF');
  const [isActive, setIsActive] = useState(true);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch warehouses for assignment checkboxes
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['warehouses-dropdown'],
    queryFn: () => fetchWarehouses(),
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (isOpen) {
      if (userToEdit) {
        setFullName(userToEdit.fullName);
        setEmail(userToEdit.email);
        setPassword('');
        setRole(userToEdit.role);
        setIsActive(userToEdit.isActive);
        setSelectedWarehouseIds(
          userToEdit.warehouseAssignments?.map((a) => a.warehouseId) || []
        );
      } else {
        setFullName('');
        setEmail('');
        setPassword('');
        setRole('WAREHOUSE_STAFF');
        setIsActive(true);
        setSelectedWarehouseIds([]);
      }
      setFormError(null);
    }
  }, [isOpen, userToEdit]);

  function handleWarehouseToggle(whId: string) {
    setSelectedWarehouseIds((prev) =>
      prev.includes(whId) ? prev.filter((id) => id !== whId) : [...prev, whId]
    );
  }

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        warehouseIds: role !== 'CUSTOMER' ? selectedWarehouseIds : undefined,
      }),
    onSuccess: (newUser) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-users'] });
      if (onSuccess) onSuccess(`User ${newUser.fullName} (${newUser.email}) created successfully.`);
      onClose();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || err.message || 'Failed to create user.');
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: () =>
      updateUser(userToEdit!.id, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        isActive,
        warehouseIds: role !== 'CUSTOMER' ? selectedWarehouseIds : [],
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-users'] });
      if (onSuccess) onSuccess(`User ${updated.fullName} updated successfully.`);
      onClose();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || err.message || 'Failed to update user.');
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError('A valid email address is required.');
      return;
    }

    if (!isEditing && (!password || password.length < 8)) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit User: ${userToEdit?.fullName}` : 'Create Internal Organization User'}
      subtitle={
        isEditing
          ? 'Modify role permissions, account active status, and facility assignments.'
          : 'Provision a new Warehouse Manager, Warehouse Staff, or Customer account.'
      }
      maxWidth="md"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <ErrorMessage
            title={isEditing ? 'Update Failed' : 'Creation Failed'}
            message={formError}
            onRetry={() => setFormError(null)}
          />
        )}

        {/* Full Name */}
        <div>
          <label htmlFor="user-full-name" className="block text-xs font-semibold text-slate-700 mb-1">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="user-full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g., Alex Mercer"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            required
          />
        </div>

        {/* Email Address */}
        <div>
          <label htmlFor="user-email" className="block text-xs font-semibold text-slate-700 mb-1">
            Email Address <span className="text-rose-500">*</span>
          </label>
          <input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@stockflow.dev"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            required
          />
        </div>

        {/* Password (Only required on creation) */}
        {!isEditing && (
          <div>
            <label htmlFor="user-password" className="block text-xs font-semibold text-slate-700 mb-1">
              Temporary Password <span className="text-rose-500">*</span>
            </label>
            <input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Password will be securely hashed with bcrypt. Never displayed or stored in plaintext.
            </p>
          </div>
        )}

        {/* Role Selection */}
        <div>
          <label htmlFor="user-role" className="block text-xs font-semibold text-slate-700 mb-1">
            System Role <span className="text-rose-500">*</span>
          </label>
          <select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSubmitting || (isEditing && userToEdit?.role === 'ADMIN')}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            required
          >
            {isEditing && userToEdit?.role === 'ADMIN' && (
              <option value="ADMIN">ADMIN (System Administrator)</option>
            )}
            <option value="WAREHOUSE_MANAGER">WAREHOUSE_MANAGER (Facility Supervisor)</option>
            <option value="WAREHOUSE_STAFF">WAREHOUSE_STAFF (Fulfillment Operator)</option>
            <option value="CUSTOMER">CUSTOMER (B2B Client / Storefront Buyer)</option>
          </select>
          {!isEditing && (
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Admin accounts cannot be provisioned via form; use CLI <code>npm run admin:create</code>.</span>
            </p>
          )}
        </div>

        {/* Active Status (Only in Edit Mode) */}
        {isEditing && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-800">Account Active Status</span>
              <p className="text-[11px] text-slate-500">
                Deactivated accounts are immediately barred from logging in and accessing APIs.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isSubmitting || userToEdit?.role === 'ADMIN'}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        )}

        {/* Facility Assignments (Only for Staff and Manager) */}
        {role !== 'CUSTOMER' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Assigned Warehouse Facilities</span>
            </label>
            {warehouses.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No warehouses registered yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                {warehouses.map((w) => (
                  <label
                    key={w.id}
                    className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer text-xs select-none transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedWarehouseIds.includes(w.id)}
                      onChange={() => handleWarehouseToggle(w.id)}
                      disabled={isSubmitting}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                    />
                    <span className="font-mono font-bold text-slate-800">[{w.code}]</span>
                    <span className="text-slate-600 truncate">{w.name} ({w.city})</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              Managers and staff can only inspect and operate orders for assigned facilities.
            </p>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            leftIcon={isEditing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          >
            {isEditing ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

