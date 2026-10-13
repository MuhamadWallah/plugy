import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAME, isSessionRevoked, verifyToken } from '../config/jwt.js';
import { query } from '../config/db.js';
import { isAdminEmail } from '../config/env.js';
import { User } from '../types/auth.types.js';

type SessionResult =
  | { user: User }
  | { user: null; error: string; status: 401 | 403 };

/**
 * Resolves the signed-in user from the session cookie (or Bearer header).
 */
const resolveSessionUser = async (req: Request): Promise<SessionResult> => {
  let token = req.cookies?.[COOKIE_NAME];

  // Optional fallback to Bearer header for flexibility/testing
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return { user: null, error: 'Authentication required. No session found.', status: 401 };
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return { user: null, error: 'Invalid or expired session token.', status: 401 };
  }

  const { rows } = await query(
    `SELECT id, name, email, phone, phone_verified, avatar_url, rating_avg, rating_count, created_at, updated_at,
            (id_verified_at IS NOT NULL) AS id_verified, password_changed_at, suspended_at
     FROM users
     WHERE id = $1`,
    [payload.userId]
  );

  if (rows.length === 0) {
    return { user: null, error: 'User associated with session not found.', status: 401 };
  }

  const { password_changed_at, suspended_at, ...user } = rows[0];

  if (isSessionRevoked(payload, password_changed_at)) {
    return { user: null, error: 'Your session has ended because the password was changed. Please sign in again.', status: 401 };
  }
  if (suspended_at) {
    return { user: null, error: 'This account has been suspended. Please contact support.', status: 403 };
  }

  return { user: { ...user, is_admin: isAdminEmail(user.email) } as User };
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const session = await resolveSessionUser(req);
    if (!session.user) {
      return res.status(session.status).json({ error: session.error });
    }

    req.user = session.user;
    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

/**
 * Only for accounts listed in ADMIN_EMAILS (use after requireAuth).
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
};

/**
 * Attaches req.user when a valid session exists, but lets anonymous requests through
 * (public endpoints that show extra details to signed-in participants).
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const session = await resolveSessionUser(req);
    if (session.user) {
      req.user = session.user;
    }
  } catch (error) {
    console.error('Optional auth error:', error);
  }
  return next();
};
