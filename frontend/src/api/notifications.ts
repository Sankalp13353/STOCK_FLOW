import { apiClient } from './client';
import { ApiResponse } from '../types';
import { AppNotification } from '../types/ticket';

export interface FetchNotificationsParams {
  isRead?: boolean;
  page?: number;
  limit?: number;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export async function fetchNotifications(
  params?: FetchNotificationsParams
): Promise<NotificationsResponse> {
  const response = await apiClient.get<ApiResponse<NotificationsResponse>>(
    '/notifications',
    { params }
  );
  return response.data.data;
}

export async function markNotificationAsRead(
  id: string
): Promise<AppNotification> {
  const response = await apiClient.post<ApiResponse<AppNotification>>(
    `/notifications/${id}/read`
  );
  return response.data.data;
}

export async function markAllNotificationsAsRead(): Promise<{ updatedCount: number }> {
  const response = await apiClient.post<ApiResponse<{ updatedCount: number }>>(
    '/notifications/read-all'
  );
  return response.data.data;
}

