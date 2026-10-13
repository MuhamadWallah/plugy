import { Router } from 'express';
import {
  getJobs,
  getMyJobs,
  createJob,
  getJobById,
  raiseBudget,
  markEnRoute,
  markArrived,
  startJob,
  completeJob,
  cancelJob,
  releaseJob,
} from '../controllers/job.controller.js';
import {
  submitOffer,
  listOffers,
  acceptOffer,
  declineOffer,
  withdrawOffer,
} from '../controllers/offer.controller.js';
import {
  getJobMessages,
  sendJobMessage
} from '../controllers/message.controller.js';
import {
  rateJob,
  getJobRatings
} from '../controllers/rating.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';
import { jobPostRateLimiter, offerRateLimiter, uploadRateLimiter } from '../middleware/rateLimit.middleware.js';
import { addJobPhoto, deleteJobPhoto } from '../controllers/media.controller.js';
import { acceptImages } from '../services/upload.service.js';

const router = Router();

// Feed & Personal List
router.get('/', optionalAuth, getJobs);
router.get('/mine', requireAuth, getMyJobs);

// Job Posting & Details
router.post('/', requireAuth, jobPostRateLimiter, createJob);
router.get('/:id', optionalAuth, getJobById);
router.patch('/:id/budget', requireAuth, raiseBudget);
router.post('/:id/photos', requireAuth, uploadRateLimiter, acceptImages(['photo']), addJobPhoto);
router.delete('/:id/photos/:photoId', requireAuth, deleteJobPhoto);

// Offers: workers accept the price or counter-offer, the poster chooses
router.get('/:id/offers', requireAuth, listOffers);
router.post('/:id/offers', requireAuth, offerRateLimiter, submitOffer);
router.post('/:id/offers/withdraw', requireAuth, withdrawOffer);
router.post('/:id/offers/:offerId/accept', requireAuth, acceptOffer);
router.post('/:id/offers/:offerId/decline', requireAuth, declineOffer);

// Job Lifecycle Actions
router.post('/:id/en-route', requireAuth, markEnRoute);
router.post('/:id/arrived', requireAuth, markArrived);
router.post('/:id/start', requireAuth, startJob);
router.post('/:id/complete', requireAuth, completeJob);
router.post('/:id/cancel', requireAuth, cancelJob);
router.post('/:id/release', requireAuth, releaseJob);

// Job Chat & Realtime Messaging
router.get('/:id/messages', requireAuth, getJobMessages);
router.post('/:id/messages', requireAuth, sendJobMessage);

// Post-completion Ratings
router.post('/:id/rate', requireAuth, rateJob);
router.get('/:id/ratings', getJobRatings);

export default router;
