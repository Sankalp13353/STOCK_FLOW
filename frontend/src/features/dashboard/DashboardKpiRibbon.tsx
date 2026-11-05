import {
  Package,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Ticket,
  Warehouse as WarehouseIcon,
  ShoppingBag,
} from 'lucide-react';
import { DashboardKPIs } from '../../types/analytics';
import { StatCard } from './StatCard';

interface DashboardKpiRibbonProps {
  kpis?: DashboardKPIs;
  isLoading?: boolean;
}

export function DashboardKpiRibbon({ kpis, isLoading = false }: DashboardKpiRibbonProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      {/* 1. Total Products / SKUs */}
      <StatCard
        title="Active SKUs"
        value={kpis?.totalProducts ?? 0}
        subtitle="Catalog products"
        icon={<Package className="w-5 h-5" />}
        iconBgColor="bg-slate-50 text-slate-700 border-slate-200"
        isLoading={isLoading}
      />

      {/* 2. Total Physical Inventory */}
      <StatCard
        title="Physical Stock"
        value={kpis?.totalPhysicalInventory ?? 0}
        subtitle="Total on-hand units"
        icon={<Layers className="w-5 h-5" />}
        iconBgColor="bg-blue-50 text-blue-600 border-blue-200"
        isLoading={isLoading}
      />

      {/* 3. Total Reserved Inventory */}
      <StatCard
        title="Reserved Stock"
        value={kpis?.totalReservedInventory ?? 0}
        subtitle="Allocated to active orders"
        icon={<Clock className="w-5 h-5" />}
        iconBgColor="bg-amber-50 text-amber-600 border-amber-200"
        isLoading={isLoading}
      />

      {/* 4. Total Available Inventory */}
      <StatCard
        title="Available Stock"
        value={kpis?.totalAvailableInventory ?? 0}
        subtitle="Unallocated physical units"
        icon={<CheckCircle2 className="w-5 h-5" />}
        iconBgColor="bg-emerald-50 text-emerald-600 border-emerald-200"
        isLoading={isLoading}
      />

      {/* 5. Low-Stock Records */}
      <StatCard
        title="Low-Stock Alerts"
        value={kpis?.lowStockCount ?? 0}
        subtitle="SKUs below threshold"
        icon={<AlertTriangle className="w-5 h-5" />}
        iconBgColor="bg-rose-50 text-rose-600 border-rose-200"
        isLoading={isLoading}
      />

      {/* 6. Pending Orders */}
      <StatCard
        title="Pending Orders"
        value={kpis?.pendingOrders ?? 0}
        subtitle="Awaiting payment or action"
        icon={<ShoppingBag className="w-5 h-5" />}
        iconBgColor="bg-indigo-50 text-indigo-600 border-indigo-200"
        isLoading={isLoading}
      />

      {/* 7. Orders Awaiting Processing */}
      <StatCard
        title="Awaiting Processing"
        value={kpis?.ordersAwaitingProcessing ?? 0}
        subtitle="Payment confirmed"
        icon={<Clock className="w-5 h-5" />}
        iconBgColor="bg-purple-50 text-purple-600 border-purple-200"
        isLoading={isLoading}
      />

      {/* 8. Orders Awaiting Dispatch */}
      <StatCard
        title="Ready to Dispatch"
        value={kpis?.ordersAwaitingDispatch ?? 0}
        subtitle="In warehouse processing"
        icon={<Send className="w-5 h-5" />}
        iconBgColor="bg-cyan-50 text-cyan-600 border-cyan-200"
        isLoading={isLoading}
      />

      {/* 9. Active Tickets */}
      <StatCard
        title="Active Tickets"
        value={kpis?.activeTickets ?? 0}
        subtitle="Shortages & approvals"
        icon={<Ticket className="w-5 h-5" />}
        iconBgColor="bg-orange-50 text-orange-600 border-orange-200"
        isLoading={isLoading}
      />

      {/* 10. Active Facilities */}
      <StatCard
        title="Active Warehouses"
        value={kpis?.activeWarehouses ?? 0}
        subtitle="Accessible facilities"
        icon={<WarehouseIcon className="w-5 h-5" />}
        iconBgColor="bg-teal-50 text-teal-600 border-teal-200"
        isLoading={isLoading}
      />
    </div>
  );
}

