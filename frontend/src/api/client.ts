import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '../utils/tokenStorage';
import { ApiResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Bearer token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Centralized error handling & 401 handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401) {
      // Clear expired credentials
      tokenStorage.clear();
      // Dispatch custom event to notify React AuthContext without circular dependencies
      window.dispatchEvent(new CustomEvent('stockflow:unauthorized'));
    }

    // Extract standardized message if backend provided one
    const backendMessage = error.response?.data?.error?.message;
    const errorMessage = backendMessage || error.message || 'An unexpected error occurred';

    const customError = new Error(errorMessage) as Error & {
      status?: number;
      code?: string;
      details?: unknown;
    };
    customError.status = error.response?.status;
    customError.code = error.response?.data?.error?.code;
    customError.details = error.response?.data?.error?.details;

    return Promise.reject(customError);
  }
);

