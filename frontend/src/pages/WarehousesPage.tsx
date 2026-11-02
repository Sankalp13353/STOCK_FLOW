import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { WarehouseFormModal } from '../features/warehouses/WarehouseFormModal';
import { WarehouseDetailModal } from '../features/warehouses/WarehouseDetailModal';
import { fetchWarehouses } from '../api/warehouses';
import { Warehouse } from '../types';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/formatters';
import {
  Warehouse as WarehouseIcon,
  Plus,
  Search,
  X,
  Eye,
  RefreshCw,
  CheckCircle2,
  Filter,
  MapPin,
  ShieldAlert,
} from 'lucide-react';

export function WarehousesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingWarehouse, setViewingWarehouse] = useState<Warehouse | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  function triggerNotification(message: string) {
    setNotification(message);
    setTimeout(() => {
      setNotification((curr) => (curr === message ? null : curr));
    }, 5000);
  }

  const queryParams = {
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'true',
  };

  const {
    data: warehouses,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['warehouses', queryParams],
    queryFn: () => fetchWarehouses(queryParams),
    staleTime: 30 * 1000,
  });

  // Client-side filtering for search query
  const filteredWarehouses = useMemo(() => {
    if (!warehouses) return [];
    if (!searchInput.trim()) return warehouses;
    const q = searchInput.toLowerCase().trim();
    return warehouses.filter(
      (w) =>
        w.code.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        w.city.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        w.address.toLowerCase().includes(q)
    );
  }, [warehouses, searchInput]);

  function handleOpenDetail(wh: Warehouse) {
    setViewingWarehouse(wh);
    setIsDetailOpen(true);
  }

  function handleCreateSuccess(created: Warehouse) {
    queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
    triggerNotification(`Facility "${created.code}" (${created.name}) was successfully registered.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Distribution Centers"
        description="Monitor physical fulfillment facilities, regional storage hubs, and stock allocations."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              isLoading={isFetching}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsFormOpen(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Warehouse
              </Button>
            )}
          </div>
        }
      />

      {/* Global Notification Banner */}
      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{notification}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Architectural Notice: Immutability Design */}
      <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-3 text-xs text-slate-600">
        <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-900 font-semibold">Backend Architecture Notice:</strong>{' '}
          Warehouse facilities serve as anchor entities for transactional inventory movements and
          order allocations. In accordance with the system specification, warehouse records are
          permanent and immutable once registered to safeguard referential ledger consistency.
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter by code, facility name, city, or country..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-400"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Status:</span>
          </div>
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('true')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'true'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('false')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'false'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Main Table / Grid View */}
      {error && (
        <ErrorMessage
          title="Failed to load warehouse facilities"
          message={error instanceof Error ? error.message : 'Backend connection error.'}
          onRetry={() => refetch()}
        />
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex justify-center">
          <LoadingSpinner size="lg" message="Loading distribution centers..." />
        </div>
      ) : filteredWarehouses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <EmptyState
            icon={<WarehouseIcon className="w-8 h-8 text-slate-400" />}
            title="No warehouses found"
            description={
              searchInput || statusFilter !== 'all'
                ? 'No warehouse facilities match your search query or status filter.'
                : 'No warehouse distribution centers are currently registered in StockFlow.'
            }
            actionLabel={
              searchInput || statusFilter !== 'all'
                ? 'Clear Filters'
                : isAdmin
                ? 'Provision First Facility'
                : undefined
            }
            onAction={
              searchInput || statusFilter !== 'all'
                ? () => {
                    setSearchInput('');
                    setStatusFilter('all');
                  }
                : isAdmin
                ? () => setIsFormOpen(true)
                : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Facility Code & Name</th>
                  <th className="px-4 py-3.5">Location & Street Address</th>
                  <th className="px-4 py-3.5">City & Country</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5">Registered Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredWarehouses.map((wh) => (
                  <tr
                    key={wh.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 shrink-0">
                          <WarehouseIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                            {wh.code}
                          </span>
                          <span className="text-xs text-slate-700 font-medium">
                            {wh.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-xs">{wh.address}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-700 font-medium">
                      {wh.city}, {wh.country}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <Badge variant={wh.isActive ? 'success' : 'neutral'} size="sm">
                        {wh.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {formatDate(wh.createdAt)}
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDetail(wh)}
                        className="h-8 px-2.5 text-xs text-slate-700 hover:text-brand-600 hover:border-brand-300"
                        title="View facility details and stock inventory"
                        aria-label={`View details for warehouse ${wh.code}`}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                      >
                        Inventory & Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <WarehouseFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <WarehouseDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        warehouse={viewingWarehouse}
      />
    </div>
  );
}
