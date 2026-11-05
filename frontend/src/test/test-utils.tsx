import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../context/CartContext';
import { tokenStorage } from '../utils/tokenStorage';
import { User } from '../types/auth';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  user?: Partial<User> | null;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const {
    route = '/',
    user = null,
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    }),
    ...renderOptions
  } = options;

  if (user) {
    const fullUser: User = {
      id: user.id || 'test-user-id',
      email: user.email || 'operator@stockflow.dev',
      fullName: user.fullName || 'Test Operator',
      role: user.role || 'ADMIN',
      isActive: user.isActive !== undefined ? user.isActive : true,
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: user.updatedAt || new Date().toISOString(),
    };
    tokenStorage.setToken('mock-jwt-test-token');
    tokenStorage.setUser(fullUser);
  } else {
    tokenStorage.clear();
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <CartProvider>{children}</CartProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

export * from '@testing-library/react';

