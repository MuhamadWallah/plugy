import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAME, verifyToken } from '../config/jwt.js';
import { query } from '../config/db.js';
import { User } from '../types/auth.types.js';

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let token = req.cookies?.[COOKIE_NAME];

    // Optional fallback to Bearer header for flexibility/testing
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. No session found.' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session token.' });
    }

    const { rows } = await query(
      `SELECT id, name, email, phone, avatar_url, rating_avg, rating_count, created_at, updated_at 
       FROM users 
       WHERE id = $1`,
      [payload.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User associated with session not found.' });
    }

    req.user = rows[0] as User;
    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};
