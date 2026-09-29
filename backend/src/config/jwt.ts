import { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.types.js';

import { env } from './env.js';

export const JWT_SECRET = env.JWT_SECRET;
export const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;
export const COOKIE_NAME = 'plugy_token';

export const getCookieOptions = (): CookieOptions => {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
  };
};

export const signToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};
