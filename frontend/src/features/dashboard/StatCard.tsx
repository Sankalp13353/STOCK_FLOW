import React from 'react';
import { Card } from '../../components/ui/Card';
import { formatNumber } from '../../utils/formatters';

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  isLoading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconBgColor = 'bg-brand-50 text-brand-600 border-brand-100',
  isLoading = false,
}: StatCardProps) {
  return (
    <Card className="hover:border-slate-300 transition-colors">
      <div className="p-5 flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            {title}
          </p>
          {isLoading ? (
            <div className="h-8 w-24 bg-slate-100 animate-pulse rounded my-1" />
          ) : (
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {formatNumber(value)}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${iconBgColor}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

