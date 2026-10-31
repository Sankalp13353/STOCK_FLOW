import { Product, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.schemas';

export interface PaginatedProducts {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

export class ProductService {
  public async createProduct(input: CreateProductInput): Promise<Product> {
    const existing = await prisma.product.findUnique({
      where: { sku: input.sku.toUpperCase() },
    });

    if (existing) {
      throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
    }

    return prisma.product.create({
      data: {
        sku: input.sku.toUpperCase(),
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        isActive: input.isActive ?? true,
      },
    });
  }

  public async getProductById(id: string): Promise<Product> {
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundError(`Product with ID '${id}' not found`);
    }

    return product;
  }

  public async listProducts(query: ListProductsQuery): Promise<PaginatedProducts> {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (typeof isActive === 'boolean') {
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

    return {
      products,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
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

    return prisma.product.update({
      where: { id },
      data: {
        ...(input.sku ? { sku: input.sku.toUpperCase() } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }
}

export const productService = new ProductService();

