import { apiClient } from './client';
import { ApiResponse } from '../types';
import {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
  PaginatedProductsResponse,
  ProductInventoryOverview,
} from '../types';

export async function fetchProducts(
  query: ListProductsQuery = {}
): Promise<PaginatedProductsResponse> {
  const params: Record<string, string | number | boolean> = {};
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  if (query.search && query.search.trim()) params.search = query.search.trim();
  if (typeof query.isActive === 'boolean') params.isActive = query.isActive;

  const response = await apiClient.get<ApiResponse<Product[]>>('/products', { params });
  return {
    products: response.data.data,
    pagination: response.data.meta.pagination ?? {
      page: 1,
      limit: response.data.data.length || 20,
      totalRecords: response.data.data.length,
      totalPages: 1,
    },
  };
}

export async function fetchProductById(id: string): Promise<Product> {
  const response = await apiClient.get<ApiResponse<Product>>(`/products/${id}`);
  return response.data.data;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const payload = {
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    priceCents: Math.round(input.priceCents),
    isActive: input.isActive ?? true,
  };
  const response = await apiClient.post<ApiResponse<Product>>('/products', payload);
  return response.data.data;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const payload: Record<string, unknown> = {};
  if (input.sku !== undefined) payload.sku = input.sku.trim().toUpperCase();
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.description !== undefined) payload.description = input.description.trim() || undefined;
  if (input.priceCents !== undefined) payload.priceCents = Math.round(input.priceCents);
  if (input.isActive !== undefined) payload.isActive = input.isActive;

  const response = await apiClient.put<ApiResponse<Product>>(`/products/${id}`, payload);
  return response.data.data;
}

export async function deleteProduct(id: string): Promise<Product> {
  const response = await apiClient.delete<ApiResponse<Product>>(`/products/${id}`);
  return response.data.data;
}

export async function fetchProductInventory(productId: string): Promise<ProductInventoryOverview> {
  const response = await apiClient.get<ApiResponse<ProductInventoryOverview>>('/inventory', {
    params: { productId },
  });
  return response.data.data;
}

