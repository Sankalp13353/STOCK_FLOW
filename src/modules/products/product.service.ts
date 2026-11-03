import { Product, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.schemas';
import { redis } from '../../infra/redis/redis.client';
import { env } from '../../config/env';
import { CACHE_KEYS } from '../../config/constants';

export interface PaginatedProducts {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

export type CacheSource = 'cache' | 'database';

export class ProductService {
  /**
   * Generates a deterministic cache key for a product detail.
   */
  public getDetailCacheKey(id: string): string {
    return `${CACHE_KEYS.PRODUCT_DETAIL_PREFIX}${id}`;
  }

  /**
   * Generates a deterministic cache key for product list queries.
   */
  public getListCacheKey(query: ListProductsQuery, isCustomer: boolean = false): string {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = (query.search || '').trim().toLowerCase();
    const active = isCustomer ? 'true' : query.isActive !== undefined ? String(query.isActive) : 'all';
    return `${CACHE_KEYS.PRODUCT_LIST_PREFIX}page=${page}:limit=${limit}:search=${search}:active=${active}`;
  }

  /**
   * Invalidate product detail cache and all product list caches.
   */
  public async invalidateProductCache(id?: string): Promise<void> {
    if (id) {
      await redis.del(this.getDetailCacheKey(id));
    }
    // Invalidate all list query caches using non-blocking SCAN
    await redis.delByPattern(`${CACHE_KEYS.PRODUCT_LIST_PREFIX}*`);
  }

  public async createProduct(input: CreateProductInput): Promise<Product> {
    const existing = await prisma.product.findUnique({
      where: { sku: input.sku.toUpperCase() },
    });

    if (existing) {
      throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
    }

    const product = await prisma.product.create({
      data: {
        sku: input.sku.toUpperCase(),
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        isActive: input.isActive ?? true,
      },
    });

    // Invalidate list caches so new product appears in listings
    await this.invalidateProductCache();

    return product;
  }

  public async getProductByIdWithSource(
    id: string,
    skipCache: boolean = false,
    user?: { userId: string; role: UserRole }
  ): Promise<{ product: Product; source: CacheSource }> {
    const cacheKey = this.getDetailCacheKey(id);

    // 1. Try reading from Redis cache
    if (!skipCache) {
      const cached = await redis.get<Product>(cacheKey);
      if (cached) {
        if (user?.role === UserRole.CUSTOMER && !cached.isActive) {
          throw new NotFoundError(`Product with ID '${id}' not found`);
        }
        return { product: cached, source: 'cache' };
      }
    }

    // 2. Fetch from PostgreSQL on cache miss
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundError(`Product with ID '${id}' not found`);
    }

    const isCustomer = !user || user.role === UserRole.CUSTOMER;
    if (isCustomer && !product.isActive) {
      throw new NotFoundError(`Product with ID '${id}' not found`);
    }

    // 3. Populate Redis cache with configured TTL
    if (!skipCache) {
      await redis.set(cacheKey, product, env.CACHE_TTL);
    }

    return { product, source: 'database' };
  }

  public async getProductById(
    id: string,
    skipCache: boolean = false,
    user?: { userId: string; role: UserRole }
  ): Promise<Product> {
    const { product } = await this.getProductByIdWithSource(id, skipCache, user);
    return product;
  }

  public async listProductsWithSource(
    query: ListProductsQuery,
    skipCache: boolean = false,
    user?: { userId: string; role: UserRole }
  ): Promise<{ result: PaginatedProducts; source: CacheSource }> {
    const isCustomer = !user || user.role === UserRole.CUSTOMER;
    const cacheKey = this.getListCacheKey(query, isCustomer);

    // 1. Try reading from Redis cache
    if (!skipCache) {
      const cached = await redis.get<PaginatedProducts>(cacheKey);
      if (cached) {
        return { result: cached, source: 'cache' };
      }
    }

    // 2. Fetch from PostgreSQL on cache miss
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    // Customers must strictly never see inactive products
    if (isCustomer) {
      where.isActive = true;
    } else if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [totalRecords, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const result: PaginatedProducts = {
      products,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };

    // 3. Populate Redis cache with configured TTL
    if (!skipCache) {
      await redis.set(cacheKey, result, env.CACHE_TTL);
    }

    return { result, source: 'database' };
  }

  public async listProducts(
    query: ListProductsQuery,
    skipCache: boolean = false,
    user?: { userId: string; role: UserRole }
  ): Promise<PaginatedProducts> {
    const { result } = await this.listProductsWithSource(query, skipCache, user);
    return result;
  }

  public async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    // 1. Verify existence
    await this.getProductById(id);

    // 2. If SKU is being updated, verify it is not taken by another product
    if (input.sku) {
      const existingSku = await prisma.product.findUnique({
        where: { sku: input.sku.toUpperCase() },
      });
      if (existingSku && existingSku.id !== id) {
        throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(input.sku ? { sku: input.sku.toUpperCase() } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    // Invalidate product detail cache and list caches
    await this.invalidateProductCache(id);

    return updated;
  }

  public async deleteProduct(id: string): Promise<Product> {
    // Verify existence
    await this.getProductById(id);

    const deleted = await prisma.product.delete({
      where: { id },
    });

    // Invalidate detail cache and list caches
    await this.invalidateProductCache(id);

    return deleted;
  }
}

export const productService = new ProductService();
