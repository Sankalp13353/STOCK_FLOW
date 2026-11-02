import { useQuery } from '@tanstack/react-query';
import { Package, Warehouse, Boxes, Clock, RefreshCw } from 'lucide-react';
import { fetchDashboardData } from '../api/dashboard';
import { PageHeader } from '../components/layout/PageHeader';
import { StatCard } from '../features/dashboard/StatCard';
import { InventoryChart } from '../features/dashboard/InventoryChart';
import { RecentOrdersList } from '../features/dashboard/RecentOrdersList';
import { LowStockList } from '../features/dashboard/LowStockList';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';

export function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard-data'],
    queryFn: fetchDashboardData,
    staleTime: 30 * 1000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description="Real-time visibility across warehouses, stock levels, and order fulfillment."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            isLoading={isFetching}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
          >
            Refresh Data
          </Button>
        }
      />

      {error && (
        <ErrorMessage
          title="Failed to Load Dashboard Metrics"
          message={error instanceof Error ? error.message : 'Unable to connect to backend APIs.'}
          onRetry={() => refetch()}
        />
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={data?.stats.totalProducts ?? 0}
          subtitle="Catalog SKUs defined"
          icon={<Package className="w-5 h-5 text-blue-600" />}
          iconBgColor="bg-blue-50 text-blue-600 border-blue-100"
          isLoading={isLoading}
        />
        <StatCard
          title="Total Warehouses"
          value={data?.stats.totalWarehouses ?? 0}
          subtitle="Active distribution centers"
          icon={<Warehouse className="w-5 h-5 text-indigo-600" />}
          iconBgColor="bg-indigo-50 text-indigo-600 border-indigo-100"
          isLoading={isLoading}
        />
        <StatCard
          title="Total Inventory Units"
          value={data?.stats.totalInventoryUnits ?? 0}
          subtitle="Total physical stock on hand"
          icon={<Boxes className="w-5 h-5 text-emerald-600" />}
          iconBgColor="bg-emerald-50 text-emerald-600 border-emerald-100"
          isLoading={isLoading}
        />
        <StatCard
          title="Pending Orders"
          value={data?.stats.pendingOrdersCount ?? 0}
          subtitle="Awaiting reservation or payment"
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          iconBgColor="bg-amber-50 text-amber-600 border-amber-100"
          isLoading={isLoading}
        />
      </div>

      {/* Main Chart Section */}
      <div>
        <InventoryChart data={data?.chartData ?? []} isLoading={isLoading} />
      </div>

      {/* Recent Orders & Low Stock Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentOrdersList orders={data?.recentOrders ?? []} isLoading={isLoading} />
        <LowStockList items={data?.lowStockItems ?? []} isLoading={isLoading} />
      </div>
    </div>
  );
}

