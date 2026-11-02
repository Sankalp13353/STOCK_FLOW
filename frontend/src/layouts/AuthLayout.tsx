import { Outlet } from 'react-router-dom';
import { Layers } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-500/20 mb-4">
          <Layers className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">StockFlow</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Distributed Inventory & Order Management Platform
        </p>
      </div>

      {/* Main Auth Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 rounded-2xl sm:px-10">
          <Outlet />
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} StockFlow Systems Inc. Enterprise Edition.
        </p>
      </div>
    </div>
  );
}

