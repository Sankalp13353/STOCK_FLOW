import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { OrderDetailView } from './OrderDetailView';
import { fetchOrderById } from '../../api/orders';

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  userRole?: string;
  accessibleWarehouseIds?: string[];
  onRefresh?: () => void;
}

export function OrderDetailModal({
  isOpen,
  onClose,
  orderId,
  userRole = 'ADMIN',
  accessibleWarehouseIds = [],
  onRefresh,
}: OrderDetailModalProps) {
  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrderById(orderId!),
    enabled: Boolean(orderId) && isOpen,
    staleTime: 5 * 1000,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={order ? `Operational Order Details — ${order.orderNumber}` : 'Order Details'}
      maxWidth="xl"
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-xs text-slate-500 font-medium">Loading complete order details...</p>
        </div>
      ) : error || !order ? (
        <div className="py-6">
          <ErrorMessage
            message={(error as any)?.message || 'Failed to load order details'}
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <OrderDetailView
            order={order}
            onRefresh={() => {
              refetch();
              onRefresh?.();
            }}
            userRole={userRole}
            accessibleWarehouseIds={accessibleWarehouseIds}
            isModal={true}
          />
        </div>
      )}
    </Modal>
  );
}
