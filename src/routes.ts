import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { productRouter } from './modules/products/product.routes';
import { warehouseRouter } from './modules/warehouses/warehouse.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { orderRouter } from './modules/orders/order.routes';
import { paymentRouter } from './modules/payments/payment.routes';

const rootRouter = Router();

rootRouter.use('/auth', authRouter);
rootRouter.use('/products', productRouter);
rootRouter.use('/warehouses', warehouseRouter);
rootRouter.use('/inventory', inventoryRouter);
rootRouter.use('/orders', orderRouter);
rootRouter.use('/payments', paymentRouter);

export { rootRouter };
