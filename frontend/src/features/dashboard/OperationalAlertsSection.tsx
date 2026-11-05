import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  Send,
  Ticket,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { OperationalAlertItem } from '../../types/analytics';
import { formatDate } from '../../utils/formatters';

interface OperationalAlertsSectionProps {
  alerts: OperationalAlertItem[];
  isLoading?: boolean;
}

export function OperationalAlertsSection({
  alerts,
  isLoading = false,
}: OperationalAlertsSectionProps) {
  function getAlertIcon(type: OperationalAlertItem['type']) {
    switch (type) {
      case 'LOW_STOCK':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case 'AWAITING_PROCESSING':
        return <Clock className="w-4 h-4 text-purple-600" />;
      case 'AWAITING_DISPATCH':
        return <Send className="w-4 h-4 text-cyan-600" />;
      case 'SHORTAGE_TICKET':
        return <Ticket className="w-4 h-4 text-orange-600" />;
      case 'CUSTOMER_DECISION':
        return <HelpCircle className="w-4 h-4 text-indigo-600" />;
      case 'MANAGER_APPROVAL':
        return <ShieldAlert className="w-4 h-4 text-amber-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-600" />;
    }
  }

  function getBadgeVariant(priority: OperationalAlertItem['priority']): BadgeVariant {
    switch (priority) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'brand';
      default:
        return 'neutral';
    }
  }

  return (
    <Card className="flex flex-col h-full border-slate-200">
      <CardHeader
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">Operational Action Items</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700">
                {alerts.length} Active
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-normal">Real-time alerts & bottlenecks</span>
          </div>
        }
      />
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-16 bg-slate-50 animate-pulse rounded-lg border border-slate-100"
              />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5 border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-800">All Systems Operational</p>
            <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
              No stock shortages, order bottlenecks, or pending approvals requiring immediate intervention.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
            {alerts.map((alert) => (
              <Link
                key={alert.id}
                to={alert.targetUrl}
                className="p-3.5 flex items-start justify-between gap-3 hover:bg-slate-50/80 transition-colors group block"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100 group-hover:bg-white group-hover:shadow-xs transition-all border border-slate-200/60 shrink-0">
                    {getAlertIcon(alert.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors truncate">
                        {alert.title}
                      </p>
                      <Badge size="sm" variant={getBadgeVariant(alert.priority)}>
                        {alert.priority}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                      {alert.description}
                    </p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {formatDate(alert.timestamp)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all pt-1">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
