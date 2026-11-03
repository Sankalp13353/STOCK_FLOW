import { apiClient } from './client';
import { ApiResponse, ProcessPaymentInput, PaymentProcessResult } from '../types';

export async function processPayment(input: ProcessPaymentInput): Promise<PaymentProcessResult> {
  const response = await apiClient.post<ApiResponse<PaymentProcessResult>>('/payments/process', input);
  return response.data.data;
}

