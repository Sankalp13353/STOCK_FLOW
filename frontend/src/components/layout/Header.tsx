import { useState, useRef, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Menu,
  Bell,
  LogOut,
  ChevronDown,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../context/CartContext';
import { Badge } from '../ui/Badge';
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../api/notifications';
import { AppNotification } from '../../types/ticket';

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch real in-app notifications
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications({ limit: 10 }),
    refetchInterval: 15000, // Poll every 15 seconds
    enabled: Boolean(user),
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifData?.unreadCount || 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    setIsNotifOpen(false);

    if (user?.role === 'CUSTOMER' && notif.orderId) {
      navigate(`/orders/${notif.orderId}`);
    } else if (notif.ticketId || notif.type.includes('TICKET') || notif.type.includes('SHORTAGE') || notif.type.includes('STOCK')) {
      navigate('/tickets');
    }
  };

  // Compute page title and breadcrumb from location
  const path = location.pathname.replace(/^\//, '');
  const pageTitle = path ? path.charAt(0).toUpperCase() + path.slice(1) : 'Dashboard';

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Left side: Hamburger button + Breadcrumbs + Page Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenSidebar}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 lg:hidden focus:outline-none"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 font-medium hidden sm:inline">StockFlow</span>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <h1 className="font-semibold text-slate-900 tracking-tight">{pageTitle}</h1>
        </div>
      </div>

      {/* Right side: Health/Environment status + Notifications + Profile Dropdown */}
      <div className="flex items-center gap-3">
        {/* Backend Environment Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-[11px]">API Online</span>
        </div>

        {/* Real In-App Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen((prev) => !prev)}
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:outline-none transition-colors"
            title="In-App Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Notifications</h3>
                  {unreadCount > 0 && (
                    <Badge variant="brand" size="sm">
                      {unreadCount} unread
                    </Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllMutation.mutate()}
                    className="text-[11px] text-brand-600 hover:text-brand-800 font-medium"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors flex items-start gap-3 ${
                        !n.isRead ? 'bg-brand-50/30' : ''
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {n.type.includes('SHORTAGE') ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : n.type.includes('LOW_STOCK') ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                        ) : n.type.includes('APPROVED') || n.type.includes('RESOLVED') ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${!n.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Shopping Cart Button */}
        <Link
          to="/cart"
          className="relative p-2 rounded-lg text-slate-600 hover:text-brand-600 hover:bg-slate-100 focus:outline-none transition-colors"
          title="View Shopping Cart"
          aria-label="Shopping Cart"
        >
          <ShoppingCart className="w-4 h-4" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
              {totalItems}
            </span>
          )}
        </Link>

        {/* User Profile Dropdown Menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 focus:outline-none transition-colors select-none"
            aria-expanded={isDropdownOpen}
          >
            <div className="w-7 h-7 rounded-full bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center text-xs font-bold">
              {user?.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="text-xs font-medium text-slate-700 hidden sm:inline max-w-[120px] truncate">
              {user?.fullName || 'User'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {user?.fullName || 'Operator'}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email}</p>
                <div className="mt-1.5">
                  <Badge variant="neutral" size="sm">
                    {user?.role || 'CUSTOMER'}
                  </Badge>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
