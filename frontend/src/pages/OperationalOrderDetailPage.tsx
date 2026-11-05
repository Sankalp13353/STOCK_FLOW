import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { OrderDetailView } from '../components/orders/OrderDetailView';
import { fetchOrderById } from '../api/orders';
import { fetchWarehouses } from '../api/warehouses';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export function OperationalOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    data: order,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrderById(id!),
    enabled: Boolean(id),
    staleTime: 10 * 1000,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => fetchWarehouses(),
    staleTime: 60 * 1000,
  });

  const accessibleWarehouseIds = warehouses.map((w) => w.id);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-slate-500 font-medium">Loading operational order data...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Order Not Found"
          description="Could not load the requested order details."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/orders')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Orders
            </Button>
          }
        />
        <ErrorMessage
          message={
            (error as any)?.response?.data?.error?.message ||
            (error as any)?.message ||
            'Order could not be found or you do not have permission to view it.'
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Fulfilment Management — ${order.orderNumber}`}
        description="Inspect warehouse allocations, track physical inventory movements, and execute state transitions."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/orders')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Orders
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              isLoading={isFetching}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <OrderDetailView
        order={order}
        onRefresh={() => refetch()}
        userRole={user?.role}
        accessibleWarehouseIds={accessibleWarehouseIds}
        isModal={false}
      />
    </div>
  );
}

