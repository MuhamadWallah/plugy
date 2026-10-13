import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, isOriginAllowed } from './config/env.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.routes.js';
import jobRouter from './routes/job.routes.js';
import { adminRouter, offerRouter, userRouter, workerRouter } from './routes/user.routes.js';
import { configRouter, pushRouter } from './routes/system.routes.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { initPush } from './services/push.service.js';
import { ensureUploadDirs, publicUploadDir } from './services/upload.service.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export const createApp = (): Express => {
  const app = express();

  initPush();
  ensureUploadDirs();

  app.disable('x-powered-by');

  // Behind nginx / a load balancer, derive client IP from X-Forwarded-For (used by rate limiting)
  app.set('trust proxy', env.TRUST_PROXY);

  // 1. CORS Policy
  app.use(
    cors({
      origin: (origin, callback) => {
        // In development/test allow all origins or null origin (mobile apps, curl, server-to-server)
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(Object.assign(new Error(`Origin ${origin} is not allowed by CORS policy`), { status: 403 }));
        }
      },
      credentials: true,
    })
  );

  // 2. Request body parsing & cookies
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // 3. Request Logging with Request ID (never logs passwords or tokens)
  app.use(requestLogger);

  // 4. API Endpoints
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/jobs', jobRouter);
  app.use('/api/offers', offerRouter);
  app.use('/api/users', userRouter);
  app.use('/api/workers', workerRouter);

  // Public photos (profile and job photos): random names, so they can be cached forever
  app.use(
    '/uploads',
    express.static(publicUploadDir(), {
      index: false,
      immutable: true,
      maxAge: '365d',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    })
  );
  app.use('/api/admin', adminRouter);
  app.use('/api/config', configRouter);
  app.use('/api/push', pushRouter);

  // Dedicated protected endpoint for testing middleware auth rejection
  app.get('/api/protected-test', requireAuth, (req, res) => {
    res.status(200).json({
      message: 'Access granted to protected route',
      user: req.user,
    });
  });

  // 5. 404 Catch-All Handler (Consistent JSON error shape)
  app.use(notFoundHandler);

  // 6. Centralized Error Handler (Never leaks stack traces to client)
  app.use(errorHandler);

  return app;
};
