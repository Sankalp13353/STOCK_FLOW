import { apiClient } from './client';
import { ApiResponse } from '../types';
import { AuthResult, LoginCredentials, RegisterCredentials, User } from '../types/auth';

export async function loginApi(credentials: LoginCredentials): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/login', credentials);
  return response.data.data;
}

export async function registerApi(credentials: RegisterCredentials): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/register', credentials);
  return response.data.data;
}

export async function getMeApi(): Promise<User> {
  const response = await apiClient.get<ApiResponse<User>>('/auth/me');
  return response.data.data;
}

