import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTickets } from '../api/tickets';
import { Ticket, TicketPriority, TicketStatus, TicketType } from '../types/ticket';
import { TicketDetailModal } from '../features/tickets/TicketDetailModal';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Pagination } from '../components/ui/Pagination';
import {
  AlertTriangle,
  Clock,
  Layers,
  RefreshCw,
  Ticket as TicketIcon,
} from 'lucide-react';

export function TicketsPage() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'ORDER_SHORTAGE' | 'LOW_STOCK' | 'PENDING_APPROVAL'>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Build query params
  const queryParams = {
    page,
    limit,
    ...(activeTab === 'ORDER_SHORTAGE' && { type: 'ORDER_SHORTAGE' as TicketType }),
    ...(activeTab === 'LOW_STOCK' && { type: 'LOW_STOCK' as TicketType }),
    ...(activeTab === 'PENDING_APPROVAL' && { type: 'ORDER_SHORTAGE' as TicketType }),
    ...(selectedPriority !== 'ALL' && { priority: selectedPriority as TicketPriority }),
    ...(selectedStatus !== 'ALL' && { status: selectedStatus as TicketStatus }),
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['tickets', activeTab, selectedPriority, selectedStatus, page, limit],
    queryFn: () => fetchTickets(queryParams),
  });

  const tickets = data?.tickets || [];
  const pagination = data?.pagination;

  // Filter pending approvals tab locally if needed
  const displayedTickets = activeTab === 'PENDING_APPROVAL'
    ? tickets.filter((t) => t.approvalStatus === 'PENDING')
    : tickets;

  // Summary counts
  const totalCount = pagination?.totalRecords || tickets.length;
  const shortageCount = tickets.filter((t) => t.type === 'ORDER_SHORTAGE').length;
  const lowStockCount = tickets.filter((t) => t.type === 'LOW_STOCK').length;
  const pendingApprovalCount = tickets.filter((t) => t.approvalStatus === 'PENDING').length;

  const typeBadgeVariant: Record<string, BadgeVariant> = {
    ORDER_SHORTAGE: 'warning',
    CUSTOMER_DECISION: 'brand',
    LOW_STOCK: 'danger',
  };

  const statusBadgeVariant: Record<string, BadgeVariant> = {
    OPEN: 'warning',
    ASSIGNED: 'brand',
    IN_PROGRESS: 'purple',
    RESOLVED: 'success',
    CANCELLED: 'neutral',
    CLOSED: 'neutral',
    PENDING: 'warning',
    ACCEPTED: 'success',
    REJECTED: 'danger',
    EXPIRED: 'neutral',
  };

  const priorityBadgeVariant: Record<string, BadgeVariant> = {
    LOW: 'neutral',
    MEDIUM: 'brand',
    HIGH: 'warning',
    CRITICAL: 'danger',
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ticket Center</h1>
          <p className="text-sm text-slate-500 mt-1">
            Intelligent shortage governance, customer decisions, and low-stock threshold management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Active</span>
            <TicketIcon className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pending Approval</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-2">{pendingApprovalCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Low Stock Alerts</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-900 mt-2">{lowStockCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Order Shortages</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-900 mt-2">{shortageCount}</p>
        </div>
      </div>

      {/* Filter Tabs & Selectors */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Tickets' },
              { id: 'ORDER_SHORTAGE', label: 'Order Shortages' },
              { id: 'LOW_STOCK', label: 'Low Stock Alerts' },
              { id: 'PENDING_APPROVAL', label: 'Pending Approval' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-brand-50 text-brand-700 font-semibold border border-brand-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Granular Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value);
                setPage(1);
              }}
              className="text-xs rounded-lg border-slate-200 text-slate-700 py-1.5 pl-2.5 pr-8 focus:border-brand-500 focus:ring-brand-500"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs rounded-lg border-slate-200 text-slate-700 py-1.5 pl-2.5 pr-8 focus:border-brand-500 focus:ring-brand-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="PENDING">Pending</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Tickets Table */}
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <p className="text-xs text-slate-500 mt-2 font-medium">Loading tickets...</p>
          </div>
        ) : displayedTickets.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <TicketIcon className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No Tickets Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no tickets matching your current filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-50/75">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Ticket #</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Type</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Priority</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Item / Reference</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Facility</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Created</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayedTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={typeBadgeVariant[ticket.type] || 'neutral'}>
                        {ticket.type.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={statusBadgeVariant[ticket.status] || 'neutral'}>
                        {ticket.status}
                      </Badge>
                      {ticket.approvalStatus === 'PENDING' && ticket.type === 'ORDER_SHORTAGE' && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-semibold">
                          Approval Req
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={priorityBadgeVariant[ticket.priority] || 'neutral'}>
                        {ticket.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {ticket.product ? (
                        <div>
                          <p className="font-semibold text-slate-900 truncate max-w-[180px]">{ticket.product.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">{ticket.product.sku}</p>
                        </div>
                      ) : ticket.order ? (
                        <span className="font-mono">{ticket.order.orderNumber}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {ticket.warehouse ? (
                        <span className="font-mono">{ticket.warehouse.code}</span>
                      ) : (
                        <span className="text-slate-400">Multi-Facility</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setIsModalOpen(true);
                        }}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="pt-2">
            <Pagination
              currentPage={page}
              totalPages={pagination.totalPages}
              totalRecords={pagination.totalRecords}
              limit={limit}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Ticket Details Inspection Modal */}
      <TicketDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTicket(null);
        }}
        ticket={selectedTicket}
        onTicketUpdated={() => refetch()}
      />
    </div>
  );
}
