import { useAuth } from '../hooks/useAuth';
import { UsersPage } from './UsersPage';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { User, Mail, Shield, Lock, CheckCircle2 } from 'lucide-react';

export function SettingsPage() {
  const { user } = useAuth();

  // If Admin: show full User Administration
  if (user?.role === 'ADMIN') {
    return <UsersPage />;
  }

  // If Non-Admin: show Operator Profile and Security Breakdown
  const roleBadgeVariant =
    user?.role === 'WAREHOUSE_MANAGER' || user?.role === 'WAREHOUSE_STAFF'
      ? 'brand'
      : 'neutral';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Profile & Security"
        description="Inspect active session credentials, role authorizations, and assigned facility access."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Details */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Operator Identity</h3>
              <Badge variant="success" size="sm">
                Active Session
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Full Name
                </span>
                <p className="font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
                  <User className="w-4 h-4 text-slate-400" />
                  {user?.fullName || 'Operator'}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Email Address
                </span>
                <p className="font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
                  <Mail className="w-4 h-4 text-slate-400" />
                  {user?.email}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  System Role
                </span>
                <div className="mt-1">
                  <Badge variant={roleBadgeVariant} size="sm">
                    {user?.role}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security & Access Policies */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Security Policies</h3>
              <Shield className="w-4 h-4 text-brand-600" />
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <Lock className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800">RBAC Enforcement:</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Permissions are strictly validated on both client-side and backend database transactions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800">Credential Safety:</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Passwords are salted and hashed using bcrypt. Passwords and hashes are never exposed in logs or APIs.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
export default SettingsPage;
