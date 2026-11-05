import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { fetchWarehouses } from '../../api/warehouses';
import { syncUserWarehouses, fetchWarehouseUsers, assignWarehouseToUser, removeUserWarehouse, fetchUsers } from '../../api/users';
import { UserItem } from '../../types/users';
import { Warehouse, UserRole } from '../../types';
import { Building2, Check, UserPlus, Trash2, Shield, Users } from 'lucide-react';

interface WarehouseAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Mode 1: Edit assignments for a specific user
  user?: UserItem | null;
  // Mode 2: Edit assignments for a specific warehouse
  warehouse?: Warehouse | null;
  onSuccess?: (msg: string) => void;
}

export function WarehouseAssignmentModal({
  isOpen,
  onClose,
  user,
  warehouse,
  onSuccess,
}: WarehouseAssignmentModalProps) {
  const queryClient = useQueryClient();
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If in warehouse mode: select user to add
  const [userToAddId, setUserToAddId] = useState('');
  const [userToAddRole, setUserToAddRole] = useState<UserRole>('WAREHOUSE_STAFF');

  // Mode 1: Fetch all warehouses
  const { data: allWarehouses = [], isLoading: isLoadingWarehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses-assignment-list'],
    queryFn: () => fetchWarehouses(),
    enabled: isOpen && Boolean(user),
  });

  // Mode 2: Fetch team members of this warehouse
  const {
    data: warehouseTeam,
    isLoading: isLoadingTeam,
    refetch: refetchTeam,
  } = useQuery({
    queryKey: ['warehouse-team', warehouse?.id],
    queryFn: () => (warehouse?.id ? fetchWarehouseUsers(warehouse.id) : null),
    enabled: isOpen && Boolean(warehouse),
  });

  // Mode 2: Fetch all staff and managers to add
  const { data: staffAndManagersData } = useQuery({
    queryKey: ['potential-warehouse-operators'],
    queryFn: () => fetchUsers({ limit: 100 }),
    enabled: isOpen && Boolean(warehouse),
  });

  const availableOperators =
    staffAndManagersData?.users.filter(
      (u) => (u.role === 'WAREHOUSE_MANAGER' || u.role === 'WAREHOUSE_STAFF') && u.isActive
    ) || [];

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (user) {
        setSelectedWarehouseIds(
          user.warehouseAssignments?.map((a) => a.warehouseId) || []
        );
      }
      setUserToAddId('');
      setUserToAddRole('WAREHOUSE_STAFF');
    }
  }, [isOpen, user, warehouse]);

  function handleToggle(whId: string) {
    setSelectedWarehouseIds((prev) =>
      prev.includes(whId) ? prev.filter((id) => id !== whId) : [...prev, whId]
    );
  }

  // Mutation: Sync User Warehouses (Mode 1)
  const syncMutation = useMutation({
    mutationFn: () => syncUserWarehouses(user!.id, selectedWarehouseIds),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-team'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      if (onSuccess) onSuccess(`Warehouse assignments for ${updated.fullName} updated.`);
      onClose();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error?.message || err.message || 'Failed to update assignments.');
    },
  });

  // Mutation: Add user to warehouse (Mode 2)
  const addOperatorMutation = useMutation({
    mutationFn: () => assignWarehouseToUser(userToAddId, warehouse!.id, userToAddRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-team'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      refetchTeam();
      setUserToAddId('');
      if (onSuccess) onSuccess('Operator assigned to facility.');
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error?.message || err.message || 'Failed to assign operator.');
    },
  });

  // Mutation: Remove user from warehouse (Mode 2)
  const removeOperatorMutation = useMutation({
    mutationFn: (userId: string) => removeUserWarehouse(userId, warehouse!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-team'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      refetchTeam();
      if (onSuccess) onSuccess('Operator assignment removed.');
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error?.message || err.message || 'Failed to remove operator.');
    },
  });

  // MODE 1: Editing a user's warehouse assignments
  if (user) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Facility Assignments: ${user.fullName}`}
        subtitle={`Select all warehouses where this ${user.role} is authorized to operate.`}
        maxWidth="md"
      >
        <div className="space-y-4">
          {errorMessage && (
            <ErrorMessage
              title="Update Failed"
              message={errorMessage}
              onRetry={() => setErrorMessage(null)}
            />
          )}

          {isLoadingWarehouses ? (
            <p className="text-xs text-slate-500 py-4">Loading warehouses...</p>
          ) : allWarehouses.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 italic">No warehouses registered in system.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
              {allWarehouses.map((wh) => {
                const isSelected = selectedWarehouseIds.includes(wh.id);
                return (
                  <label
                    key={wh.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer border text-xs transition-colors ${
                      isSelected
                        ? 'bg-brand-50/80 border-brand-200 text-brand-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(wh.id)}
                        disabled={syncMutation.isPending}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">[{wh.code}]</span>
                          <span>{wh.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {wh.city}, {wh.country}
                        </span>
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-brand-600" />}
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {selectedWarehouseIds.length} facility(ies) selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={syncMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => syncMutation.mutate()}
                isLoading={syncMutation.isPending}
              >
                Save Assignments
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // MODE 2: Managing team for a specific warehouse
  if (warehouse) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-600" />
            <span>Manage Team: [{warehouse.code}] {warehouse.name}</span>
          </div>
        }
        subtitle="Assign managers and staff authorized to inspect and operate this facility."
        maxWidth="lg"
      >
        <div className="space-y-5">
          {errorMessage && (
            <ErrorMessage
              title="Assignment Error"
              message={errorMessage}
              onRetry={() => setErrorMessage(null)}
            />
          )}

          {/* Quick Add Form */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-brand-600" />
              <span>Assign New Operator to Facility</span>
            </h4>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={userToAddId}
                onChange={(e) => {
                  setUserToAddId(e.target.value);
                  const selectedUser = availableOperators.find((u) => u.id === e.target.value);
                  if (selectedUser) setUserToAddRole(selectedUser.role);
                }}
                className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">-- Select Manager or Staff Member --</option>
                {availableOperators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email}) — [{u.role}]
                  </option>
                ))}
              </select>

              <select
                value={userToAddRole}
                onChange={(e) => setUserToAddRole(e.target.value as UserRole)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shrink-0"
              >
                <option value="WAREHOUSE_STAFF">Staff Operator</option>
                <option value="WAREHOUSE_MANAGER">Warehouse Manager</option>
              </select>

              <Button
                variant="primary"
                size="sm"
                onClick={() => addOperatorMutation.mutate()}
                disabled={!userToAddId || addOperatorMutation.isPending}
                isLoading={addOperatorMutation.isPending}
                className="shrink-0"
              >
                Assign
              </Button>
            </div>
          </div>

          {/* Currently Assigned Team */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Assigned Personnel ({warehouseTeam?.totalAssigned || 0})</span>
            </h4>

            {isLoadingTeam ? (
              <p className="text-xs text-slate-400 py-3">Loading facility team...</p>
            ) : !warehouseTeam || warehouseTeam.assignments.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                No managers or staff are currently assigned to this facility.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {warehouseTeam.assignments.map((assignment: any) => (
                  <div
                    key={assignment.id}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Shield
                        className={`w-4 h-4 ${
                          assignment.role === 'WAREHOUSE_MANAGER'
                            ? 'text-purple-600'
                            : 'text-brand-600'
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-slate-900">
                          {assignment.user?.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500">{assignment.user?.email}</div>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 ml-1">
                        {assignment.role || assignment.user?.role}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${assignment.user?.fullName} from warehouse ${warehouse.code}?`
                          )
                        ) {
                          removeOperatorMutation.mutate(assignment.userId);
                        }
                      }}
                      className="text-rose-600 hover:text-rose-700 hover:border-rose-300 h-7 px-2 text-xs"
                      title="Remove assignment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
}
