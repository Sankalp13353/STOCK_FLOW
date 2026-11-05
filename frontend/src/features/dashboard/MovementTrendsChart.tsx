import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TrendingUp, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { MovementTrendDataPoint } from '../../types/analytics';
import { formatNumber } from '../../utils/formatters';

interface MovementTrendsChartProps {
  data: MovementTrendDataPoint[];
  isLoading?: boolean;
}

export function MovementTrendsChart({ data, isLoading = false }: MovementTrendsChartProps) {
  const totalRestocked = data.reduce((sum, d) => sum + d.restockQuantity, 0);
  const totalDispatched = data.reduce((sum, d) => sum + d.dispatchQuantity, 0);

  return (
    <Card className="flex flex-col h-full border-slate-200">
      <CardHeader
        title={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold text-slate-900 text-sm">
                Physical Inventory Flow (Restock vs Dispatch)
              </span>
              <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                Physical units added to warehouse shelves vs physically dispatched to fulfilled orders.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span className="font-bold">{formatNumber(totalRestocked)}</span>
                <span className="text-[10px] text-emerald-600">Restocked</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span className="font-bold">{formatNumber(totalDispatched)}</span>
                <span className="text-[10px] text-blue-600">Dispatched</span>
              </div>
            </div>
          </div>
        }
      />
      <CardContent className="flex-1 min-h-[300px]">
        {isLoading ? (
          <div className="h-[280px] w-full flex items-center justify-center bg-slate-50/50 rounded-lg">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="w-6 h-6 text-slate-400" />}
            title="No Movement History"
            description="No restock or dispatch movements recorded within the selected timeframe."
            className="py-12"
          />
        ) : (
          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                barSize={16}
              >
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
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  iconType="circle"
                />
                <Bar
                  dataKey="restockQuantity"
                  name="Restocked Units (+)"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="dispatchQuantity"
                  name="Dispatched Units (-)"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

