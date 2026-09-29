import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';

// Extend Express Request interface to include request ID
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Basic request logging middleware:
 * - Generates / propagates unique X-Request-Id
 * - Records route, HTTP method, status code, and latency
 * - NEVER logs passwords, JWT tokens, or chat/message contents
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate or propagate request ID
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.length > 0 
    ? incomingId 
    : crypto.randomUUID().slice(0, 8);

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startMs = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - startMs;
    const route = req.originalUrl || req.url;
    const status = res.statusCode;

    // In test environment, suppress non-error logs to keep test output clean
    if (env.isTest && status < 400) {
      return;
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${requestId}] ${req.method} ${route} ${status} ${latencyMs}ms`);
  });

  next();
};
