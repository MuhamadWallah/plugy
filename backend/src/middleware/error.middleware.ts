import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  details?: unknown;
}

/**
 * 404 Not Found handler for undefined routes with consistent JSON response
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: `Cannot ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Global centralized error handler:
 * - Ensures consistent error response shape: { error: string, details?: unknown }
 * - Never leaks server stack traces or internal implementation details to clients
 * - Logs errors server-side with request ID for traceability
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const statusCode = err.status || err.statusCode || 500;
  const requestId = req.id || 'unknown';

  // Server-side logging (redacted of sensitive request payloads)
  if (!env.isTest || statusCode >= 500) {
    console.error(
      `[ERROR] [${requestId}] ${req.method} ${req.originalUrl} (${statusCode}):`,
      err.stack || err.message || err
    );
  }

  // Consistent client-safe response shape: never leak internal stack traces
  const clientMessage = statusCode >= 500 ? 'Internal server error' : (err.message || 'An error occurred');

  const responsePayload: { error: string; details?: unknown } = {
    error: clientMessage,
  };

  if (err.details && statusCode < 500) {
    responsePayload.details = err.details;
  }

  res.status(statusCode).json(responsePayload);
};
