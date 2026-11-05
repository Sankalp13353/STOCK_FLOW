import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';
import { AuthLayout } from '../layouts/AuthLayout';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ProductsPage } from '../pages/ProductsPage';
import { WarehousesPage } from '../pages/WarehousesPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { MyOrdersPage } from '../pages/MyOrdersPage';
import { OrderTrackingPage } from '../pages/OrderTrackingPage';
import { OrdersPage } from '../pages/OrdersPage';
import { OperationalOrderDetailPage } from '../pages/OperationalOrderDetailPage';
import { TicketsPage } from '../pages/TicketsPage';
import { InventoryPage } from '../pages/InventoryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { UsersPage } from '../pages/UsersPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { useAuth } from '../hooks/useAuth';

function OrdersRoute() {
  const { user } = useAuth();
  if (user?.role === 'CUSTOMER') {
    return <MyOrdersPage />;
  }
  return <OrdersPage />;
}

function OrderDetailRoute() {
  const { user } = useAuth();
  if (user?.role === 'CUSTOMER') {
    return <OrderTrackingPage />;
  }
  return <OperationalOrderDetailPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      {/* Protected Application Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/warehouses" element={<WarehousesPage />} />
          <Route path="/orders" element={<OrdersRoute />} />
          <Route path="/orders/:id" element={<OrderDetailRoute />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Catch-all 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
