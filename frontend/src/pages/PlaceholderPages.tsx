import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Layers } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  endpoints: string[];
  plannedFeatures: string[];
}

export function PlaceholderPage({
  title,
  description,
  endpoints,
  plannedFeatures,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Badge variant="brand" size="md">
            Phase 2 Scope
          </Badge>
        }
      />

      <Card>
        <CardHeader
          title="Module Specification & API Readiness"
          subtitle="Backend endpoints and domain logic for this module are active and verified."
        />
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Connected Backend Endpoints
            </h4>
            <div className="flex flex-wrap gap-2">
              {endpoints.map((ep) => (
                <span
                  key={ep}
                  className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200"
                >
                  {ep}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Planned UI Capabilities (Phase 2)
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              {plannedFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-blue-50/60 border border-blue-100 flex items-start gap-3 text-xs text-blue-900">
            <Layers className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Phase 1 Architecture Complete:</strong> Foundation, authentication, routing,
              and application shell navigation are active. Full interactive data tables and
              management workflows will be implemented in Phase 2.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProductsPage() {
  return (
    <PlaceholderPage
      title="Product Catalog Management"
      description="Define, search, and manage product definitions, SKUs, pricing, and category hierarchies."
      endpoints={[
        'GET /api/v1/products',
        'POST /api/v1/products',
        'GET /api/v1/products/:id',
        'PUT /api/v1/products/:id',
        'DELETE /api/v1/products/:id',
      ]}
      plannedFeatures={[
        'Full-text product search and category filtering with debounce',
        'Paginated data table with sorting and SKU quick lookup',
        'Modal dialog to create and update product definitions',
        'Real-time price formatting and stock linkage',
      ]}
    />
  );
}

export function InventoryPage() {
  return (
    <PlaceholderPage
      title="Inventory & Stock Allocation"
      description="Manage multi-warehouse stock allocations, restock workflows, and monitor active reservations."
      endpoints={[
        'GET /api/v1/inventory',
        'POST /api/v1/inventory/restock',
        'POST /api/v1/inventory/expire-reservations',
        'GET /api/v1/inventory/warehouse/:id',
      ]}
      plannedFeatures={[
        'Warehouse-level stock breakdown table with available vs reserved columns',
        'Atomic restock modal triggering backend restock movement records',
        'Manual trigger button for expiring stale 15-minute reservations',
        'Inventory movement ledger audit log viewer',
      ]}
    />
  );
}

export function WarehousesPage() {
  return (
    <PlaceholderPage
      title="Warehouse Distribution Centers"
      description="Manage physical warehouse facilities, location codes, and storage capacity."
      endpoints={[
        'GET /api/v1/warehouses',
        'POST /api/v1/warehouses',
        'GET /api/v1/warehouses/:id',
      ]}
      plannedFeatures={[
        'Warehouse facility cards with live utilization statistics',
        'Facility registration form with location and operational status',
        'Warehouse-specific stock inventory drill-down',
      ]}
    />
  );
}

export function OrdersPage() {
  return (
    <PlaceholderPage
      title="Order Fulfillment & Lifecycle"
      description="Track customer orders, manage payment states, process fulfillment, and handle cancellations."
      endpoints={[
        'GET /api/v1/orders',
        'POST /api/v1/orders',
        'GET /api/v1/orders/:id',
        'POST /api/v1/orders/:id/cancel',
        'POST /api/v1/payments/process',
      ]}
      plannedFeatures={[
        'Order lifecycle kanban / table filtered by status (PENDING, CONFIRMED, CANCELLED)',
        'Order creation wizard with multi-item stock check and Idempotency-Key support',
        'Order detail view with itemized pricing, timeline, and cancellation trigger',
        'Payment simulation trigger testing distributed outbox event publishing',
      ]}
    />
  );
}

export function SettingsPage() {
  return (
    <PlaceholderPage
      title="System Settings & Security"
      description="Configure environment settings, security policies, and user management."
      endpoints={['GET /api/v1/auth/me', 'GET /api/v1/health']}
      plannedFeatures={[
        'Current operator profile and role permission breakdown',
        'API base URL and backend health check monitor',
        'Session storage security status indicator',
      ]}
    />
  );
}
