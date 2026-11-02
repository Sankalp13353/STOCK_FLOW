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
import { WarehouseInventoryChartData } from '../../types/dashboard';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { BarChart3 } from 'lucide-react';

interface InventoryChartProps {
  data: WarehouseInventoryChartData[];
  isLoading?: boolean;
}

export function InventoryChart({ data, isLoading }: InventoryChartProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader
        title="Inventory Overview by Warehouse"
        subtitle="Distribution of stock on hand, reservations, and available units across facilities."
      />
      <CardContent className="flex-1 min-h-[300px]">
        {isLoading ? (
          <div className="h-[280px] w-full flex items-center justify-center bg-slate-50/50 rounded-lg">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="w-6 h-6 text-slate-400" />}
            title="No Warehouse Inventory"
            description="Inventory records have not yet been assigned to warehouses. Restock items via the API to visualize stock distributions."
            className="py-12"
          />
        ) : (
          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                barSize={20}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="warehouseCode"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
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
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                  iconType="circle"
                />
                <Bar
                  dataKey="onHand"
                  name="Total On Hand"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="reserved"
                  name="Reserved"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="available"
                  name="Available"
                  fill="#10b981"
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

