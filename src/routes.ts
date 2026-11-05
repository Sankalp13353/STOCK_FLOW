import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { productRouter } from './modules/products/product.routes';
import { warehouseRouter } from './modules/warehouses/warehouse.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { orderRouter } from './modules/orders/order.routes';
import { paymentRouter } from './modules/payments/payment.routes';
import { userRouter } from './modules/users/user.routes';
import { ticketRouter } from './modules/tickets/ticket.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';

const rootRouter = Router();

rootRouter.use('/auth', authRouter);
rootRouter.use('/users', userRouter);
rootRouter.use('/products', productRouter);
rootRouter.use('/warehouses', warehouseRouter);
rootRouter.use('/inventory', inventoryRouter);
rootRouter.use('/orders', orderRouter);
rootRouter.use('/payments', paymentRouter);
rootRouter.use('/tickets', ticketRouter);
rootRouter.use('/notifications', notificationRouter);
rootRouter.use('/analytics', analyticsRouter);
rootRouter.use('/dashboard', analyticsRouter);

export { rootRouter };
