import { Router } from 'express';
import { 
  getJobs, 
  getMyJobs, 
  createJob, 
  getJobById, 
  acceptJob, 
  startJob, 
  completeJob, 
  cancelJob 
} from '../controllers/job.controller.js';
import { 
  getJobMessages, 
  sendJobMessage 
} from '../controllers/message.controller.js';
import { 
  rateJob, 
  getJobRatings 
} from '../controllers/rating.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { jobPostRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// Feed & Personal List
router.get('/', getJobs);
router.get('/mine', requireAuth, getMyJobs);

// Job Posting & Details
router.post('/', requireAuth, jobPostRateLimiter, createJob);
router.get('/:id', getJobById);

// Job Lifecycle Actions
router.post('/:id/accept', requireAuth, acceptJob);
router.post('/:id/start', requireAuth, startJob);
router.post('/:id/complete', requireAuth, completeJob);
router.post('/:id/cancel', requireAuth, cancelJob);

// Job Chat & Realtime Messaging
router.get('/:id/messages', requireAuth, getJobMessages);
router.post('/:id/messages', requireAuth, sendJobMessage);

// Post-completion Ratings
router.post('/:id/rate', requireAuth, rateJob);
router.get('/:id/ratings', getJobRatings);

export default router;
