import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, LoginCredentials, RegisterCredentials } from '../types/auth';
import { tokenStorage } from '../utils/tokenStorage';
import { getMeApi, loginApi, registerApi } from '../api/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStorage.getToken());
  const [user, setUser] = useState<User | null>(() => tokenStorage.getUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize and validate token on application startup
  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      const storedToken = tokenStorage.getToken();
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getMeApi();
        if (isMounted) {
          setUser(currentUser);
          tokenStorage.setUser(currentUser);
          setToken(storedToken);
        }
      } catch (err) {
        console.warn('Initial session validation failed or token expired:', err);
        if (isMounted) {
          tokenStorage.clear();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    // Listen for 401 events dispatched by Axios interceptor
    const handleUnauthorized = () => {
      tokenStorage.clear();
      setUser(null);
      setToken(null);
    };

    window.addEventListener('stockflow:unauthorized', handleUnauthorized);
    return () => {
      isMounted = false;
      window.removeEventListener('stockflow:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const result = await loginApi(credentials);
    tokenStorage.setToken(result.token);
    tokenStorage.setUser(result.user);
    setToken(result.token);
    setUser(result.user);
  };

  const register = async (credentials: RegisterCredentials) => {
    const result = await registerApi(credentials);
    tokenStorage.setToken(result.token);
    tokenStorage.setUser(result.user);
    setToken(result.token);
    setUser(result.user);
  };

  const logout = () => {
    tokenStorage.clear();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

