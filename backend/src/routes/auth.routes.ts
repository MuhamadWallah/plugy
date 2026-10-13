import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  sendOtp,
  verifyOtpHandler,
  requestPasswordReset,
  confirmPasswordReset,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.post('/send-otp', authRateLimiter, sendOtp);
router.post('/verify-otp', authRateLimiter, verifyOtpHandler);
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/password-reset/request', authRateLimiter, requestPasswordReset);
router.post('/password-reset/confirm', authRateLimiter, confirmPasswordReset);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);

export default router;
