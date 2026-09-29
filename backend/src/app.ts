import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.routes.js';
import jobRouter from './routes/job.routes.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export const createApp = (): Express => {
  const app = express();

  // 1. CORS Policy
  app.use(
    cors({
      origin: (origin, callback) => {
        // In development/test allow all origins or null origin (mobile apps, curl, server-to-server)
        if (!env.isProduction || !origin || origin === env.CORS_ORIGIN) {
          callback(null, true);
        } else {
          callback(new Error('CORS origin denied by policy'));
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
