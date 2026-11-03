import { Request, Response, NextFunction } from 'express';
import { productService } from './product.service';
import { sendSuccess } from '../../common/utils/response';
import { AuthenticatedRequest } from '../../common/types';

export class ProductController {
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productService.createProduct(req.body);
      sendSuccess(res, product, 201);
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const { product, source } = await productService.getProductByIdWithSource(id, false, user);
      res.setHeader('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
      sendSuccess(res, product, 200);
    } catch (error) {
      next(error);
    }
  }

  public async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const { result, source } = await productService.listProductsWithSource(req.query as any, false, user);
      res.setHeader('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
      sendSuccess(res, result.products, 200, { pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const product = await productService.updateProduct(id, req.body);
      sendSuccess(res, product, 200);
    } catch (error) {
      next(error);
    }
  }

  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const product = await productService.deleteProduct(id);
      sendSuccess(res, product, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
