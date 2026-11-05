import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ShoppingCart, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { OrderAnalyticsResult } from '../../types/analytics';
import { formatNumber } from '../../utils/formatters';

interface OrderAnalyticsChartsProps {
  analytics?: OrderAnalyticsResult;
  isLoading?: boolean;
}

export function OrderAnalyticsCharts({
  analytics,
  isLoading = false,
}: OrderAnalyticsChartsProps) {
  const byStatus = analytics?.byStatus || [];
  const ordersOverTime = analytics?.ordersOverTime || [];
  const backlog = analytics?.backlog || {
    awaitingProcessingCount: 0,
    awaitingDispatchCount: 0,
    totalBacklog: 0,
  };
  const deliveredCount = analytics?.deliveredCount || 0;
  const cancellationTrends = analytics?.cancellationTrends || {
    cancelledCount: 0,
    cancellationRate: 0,
  };

  // Status badge styling helper
  function getStatusBadgeVariant(status: string): BadgeVariant {
    switch (status) {
      case 'DELIVERED':
        return 'success';
      case 'SHIPPED':
      case 'PROCESSING':
        return 'brand';
      case 'CONFIRMED':
      case 'PAYMENT_PENDING':
        return 'warning';
      case 'CANCELLED':
      case 'PAYMENT_FAILED':
      case 'RESERVATION_EXPIRED':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Orders Over Time Timeline (Span 2 cols on lg) */}
      <Card className="lg:col-span-2 flex flex-col border-slate-200">
        <CardHeader
          title={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  Order Volume & Fulfillment Velocity
                </span>
                <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                  Orders submitted and fulfilled across the selected timeframe.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                  <Clock className="w-3 h-3" />
                  <span>Backlog: {backlog.totalBacklog}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Delivered: {deliveredCount}</span>
                </div>
              </div>
            </div>
          }
        />
        <CardContent className="flex-1 min-h-[260px]">
          {isLoading ? (
            <div className="h-[240px] w-full flex items-center justify-center bg-slate-50/50 rounded-lg">
              <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            </div>
          ) : ordersOverTime.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="w-6 h-6 text-slate-400" />}
              title="No Order Volume"
              description="No orders placed in this period matching your warehouse filter."
              className="py-12"
            />
          ) : (
            <div className="w-full h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={ordersOverTime}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickFormatter={(val) => {
                      const parts = val.split('-');
                      return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
                    }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.75rem',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalOrders"
                    name="Orders Placed"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#orderGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Order Status Breakdown Table & Backlog (Span 1 col) */}
      <Card className="flex flex-col border-slate-200">
        <CardHeader
          title={
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">Status Distribution</span>
              <span className="text-[11px] text-slate-400 font-normal">Active & terminal</span>
            </div>
          }
        />
        <CardContent className="flex-1 p-0 flex flex-col justify-between">
          <div className="p-3.5 space-y-2 max-h-[210px] overflow-y-auto divide-y divide-slate-100">
            {byStatus
              .filter((item) => item.count > 0)
              .map((item) => (
                <div
                  key={item.status}
                  className="pt-2 first:pt-0 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge size="sm" variant={getStatusBadgeVariant(item.status)}>
                      {item.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{formatNumber(item.count)}</span>
                    <span className="text-[10px] text-slate-400 font-medium w-9 text-right">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            {byStatus.every((item) => item.count === 0) && (
              <p className="text-xs text-slate-400 py-6 text-center">No orders in window</p>
            )}
          </div>

          {/* Quick Metrics Footer */}
          <div className="p-3 bg-slate-50/80 border-t border-slate-200/80 rounded-b-xl grid grid-cols-2 gap-2 text-center">
            <div className="p-2 rounded-lg bg-white border border-slate-200/60 shadow-2xs">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">
                Active Backlog
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                {backlog.totalBacklog} orders
              </span>
              <span className="text-[10px] text-purple-600 block">
                {backlog.awaitingProcessingCount} proc / {backlog.awaitingDispatchCount} disp
              </span>
            </div>
            <div className="p-2 rounded-lg bg-white border border-slate-200/60 shadow-2xs">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">
                Cancellations
              </span>
              <span className="text-sm font-bold text-rose-600 mt-0.5 block">
                {cancellationTrends.cancellationRate}%
              </span>
              <span className="text-[10px] text-slate-400 block flex items-center justify-center gap-0.5">
                <XCircle className="w-2.5 h-2.5 text-rose-500" />
                {cancellationTrends.cancelledCount} total
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
