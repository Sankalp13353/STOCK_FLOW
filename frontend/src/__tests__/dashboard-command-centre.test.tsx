import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import { DashboardKpiRibbon } from '../features/dashboard/DashboardKpiRibbon';
import { OperationalAlertsSection } from '../features/dashboard/OperationalAlertsSection';
import { WarehousePerformanceTable } from '../features/dashboard/WarehousePerformanceTable';
import { DashboardKPIs, OperationalAlertItem, WarehousePerformanceItem } from '../types/analytics';

describe('Frontend — Dashboard Command Centre Components', () => {
  const mockKpis: DashboardKPIs = {
    totalProducts: 14,
    totalPhysicalInventory: 1250,
    totalReservedInventory: 180,
    totalAvailableInventory: 1070,
    lowStockCount: 3,
    pendingOrders: 5,
    ordersAwaitingProcessing: 2,
    ordersAwaitingDispatch: 4,
    activeTickets: 6,
    activeWarehouses: 8,
  };

  it('renders all 10 operational KPI cards with formatted values', () => {
    renderWithProviders(<DashboardKpiRibbon kpis={mockKpis} />);

    expect(screen.getByText('Active SKUs')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();

    expect(screen.getByText('Physical Stock')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();

    expect(screen.getByText('Reserved Stock')).toBeInTheDocument();
    expect(screen.getByText('180')).toBeInTheDocument();

    expect(screen.getByText('Available Stock')).toBeInTheDocument();
    expect(screen.getByText('1,070')).toBeInTheDocument();

    expect(screen.getByText('Low-Stock Alerts')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    expect(screen.getByText('Pending Orders')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    expect(screen.getByText('Awaiting Processing')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    expect(screen.getByText('Ready to Dispatch')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    expect(screen.getByText('Active Tickets')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();

    expect(screen.getByText('Active Warehouses')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders empty operational alerts state when zero alerts exist', () => {
    renderWithProviders(<OperationalAlertsSection alerts={[]} />);

    expect(screen.getByText(/all systems operational/i)).toBeInTheDocument();
    expect(screen.getByText(/no stock shortages, order bottlenecks/i)).toBeInTheDocument();
  });

  it('renders actionable alert items with priority badges and links', () => {
    const mockAlerts: OperationalAlertItem[] = [
      {
        id: 'alert-1',
        type: 'AWAITING_PROCESSING',
        title: 'Order #ORD-101 Awaiting Processing',
        description: 'Confirmed payment from Enterprise Corp.',
        priority: 'HIGH',
        timestamp: new Date().toISOString(),
        targetUrl: '/orders/ord-101',
        entityId: 'ord-101',
      },
      {
        id: 'alert-2',
        type: 'LOW_STOCK',
        title: 'Low Stock: Widget Pro (SKU-WIDGET-01)',
        description: 'Only 3 units available at WH-DAL-01.',
        priority: 'CRITICAL',
        timestamp: new Date().toISOString(),
        targetUrl: '/inventory?warehouseId=wh-1',
        entityId: 'inv-1',
      },
    ];

    renderWithProviders(<OperationalAlertsSection alerts={mockAlerts} />);

    expect(screen.getByText('2 Active')).toBeInTheDocument();
    expect(screen.getByText('Order #ORD-101 Awaiting Processing')).toBeInTheDocument();
    expect(screen.getByText('Low Stock: Widget Pro (SKU-WIDGET-01)')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders multi-warehouse performance table with comparative metrics', () => {
    const mockWarehouses: WarehousePerformanceItem[] = [
      {
        warehouseId: 'wh-1',
        warehouseCode: 'WH-DAL-01',
        warehouseName: 'Dallas Center',
        isActive: true,
        city: 'Dallas',
        country: 'USA',
        inventoryOnHand: 800,
        inventoryReserved: 100,
        inventoryAvailable: 700,
        lowStockCount: 1,
        ordersFulfilledCount: 25,
        dispatchedVolume: 120,
        activeTicketsCount: 2,
      },
    ];

    const onSelect = vi.fn();
    renderWithProviders(
      <WarehousePerformanceTable
        warehouses={mockWarehouses}
        selectedWarehouseId={null}
        onSelectWarehouse={onSelect}
      />
    );

    expect(screen.getByText('WH-DAL-01')).toBeInTheDocument();
    expect(screen.getByText('Dallas Center')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('700')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filter scope/i })).toBeInTheDocument();
  });
});
