import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Boxes,
  Warehouse,
  ShoppingCart,
  ShoppingBag,
  Settings,
  LogOut,
  X,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../ui/Badge';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Products', path: '/products', icon: Package },
  { name: 'Inventory', path: '/inventory', icon: Boxes },
  { name: 'Warehouses', path: '/warehouses', icon: Warehouse },
  { name: 'Orders', path: '/orders', icon: ShoppingCart },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();

  const isCustomer = user?.role === 'CUSTOMER';

  const visibleNavItems = useMemo(() => {
    if (isCustomer) {
      return [
        { name: 'Storefront', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Product Catalog', path: '/products', icon: Package },
        { name: 'Shopping Cart', path: '/cart', icon: ShoppingBag },
        { name: 'My Orders', path: '/orders', icon: ShoppingCart },
        { name: 'Settings', path: '/settings', icon: Settings },
      ];
    }
    return NAV_ITEMS;
  }, [isCustomer]);

  const roleBadgeVariant =
    user?.role === 'ADMIN'
      ? 'purple'
      : user?.role === 'WAREHOUSE_MANAGER'
      ? 'brand'
      : user?.role === 'WAREHOUSE_STAFF'
      ? 'brand'
      : 'neutral';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white tracking-tight text-base">StockFlow</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  B2B
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Distributed Inventory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden focus:outline-none"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase text-slate-500">
            Operations
          </div>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white border-l-2 border-brand-500 pl-[12px]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 text-current" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile Card & Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/80">
          <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-white shrink-0 border border-slate-600">
                  {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {user?.fullName || 'Active User'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
              <Badge variant={roleBadgeVariant} size="sm">
                {user?.role || 'CUSTOMER'}
              </Badge>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition-colors focus:outline-none"
                title="Sign out of StockFlow"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
