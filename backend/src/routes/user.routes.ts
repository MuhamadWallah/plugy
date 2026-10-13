import { Router } from 'express';
import { getUserProfile, reportUser } from '../controllers/user.controller.js';
import { getMyOffers } from '../controllers/offer.controller.js';
import { listReports, resolveReport, unsuspendUser } from '../controllers/admin.controller.js';
import { getMyAvailability, updateMyAvailability } from '../controllers/worker.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';

export const userRouter = Router();

userRouter.get('/:id', getUserProfile);
userRouter.post('/:id/report', requireAuth, reportUser);

export const offerRouter = Router();

offerRouter.get('/mine', requireAuth, getMyOffers);

export const workerRouter = Router();

workerRouter.get('/me/availability', requireAuth, getMyAvailability);
workerRouter.put('/me/availability', requireAuth, updateMyAvailability);

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
adminRouter.get('/reports', listReports);
adminRouter.post('/reports/:id/resolve', resolveReport);
adminRouter.post('/users/:id/unsuspend', unsuspendUser);
