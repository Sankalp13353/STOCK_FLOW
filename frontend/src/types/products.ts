import { PaginationMeta } from './index';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  priceCents: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  priceCents: number;
  isActive?: boolean;
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string;
  priceCents?: number;
  isActive?: boolean;
}

export interface ListProductsQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface PaginatedProductsResponse {
  products: Product[];
  pagination: PaginationMeta;
}

