import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Rate limiter for sensitive authentication endpoints (register, login)
 * Protects against credential brute-forcing and account enumeration.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.RATE_LIMIT_ENABLED ? env.RATE_LIMIT_AUTH_MAX : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  skip: () => !env.RATE_LIMIT_ENABLED,
});

/**
 * Rate limiter for job creation to prevent spam and board flooding.
 */
export const jobPostRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.RATE_LIMIT_ENABLED ? env.RATE_LIMIT_JOBS_MAX : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many jobs posted from this IP. Please wait before posting again.',
  },
  skip: () => !env.RATE_LIMIT_ENABLED,
});
