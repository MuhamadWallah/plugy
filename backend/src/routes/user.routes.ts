import { Router } from 'express';
import { getUserProfile, reportUser } from '../controllers/user.controller.js';
import { getMyOffers } from '../controllers/offer.controller.js';
import { listReports, resolveReport, unsuspendUser } from '../controllers/admin.controller.js';
import { getMyAvailability, updateMyAvailability } from '../controllers/worker.controller.js';
import { deleteAvatar, uploadAvatar } from '../controllers/media.controller.js';
import {
  getMyVerification,
  getVerificationFile,
  listVerifications,
  reviewVerification,
  submitVerification,
} from '../controllers/verification.controller.js';
import { acceptImages } from '../services/upload.service.js';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';

export const userRouter = Router();

userRouter.post('/me/avatar', requireAuth, uploadRateLimiter, acceptImages(['photo']), uploadAvatar);
userRouter.delete('/me/avatar', requireAuth, deleteAvatar);
userRouter.get('/me/verification', requireAuth, getMyVerification);
userRouter.post('/me/verification', requireAuth, uploadRateLimiter, acceptImages(['document', 'selfie']), submitVerification);
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
adminRouter.get('/verifications', listVerifications);
adminRouter.get('/verifications/:id/files/:kind', getVerificationFile);
adminRouter.post('/verifications/:id/review', reviewVerification);
