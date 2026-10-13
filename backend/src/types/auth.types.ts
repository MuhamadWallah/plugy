import { Request } from 'express';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phone_verified?: boolean;
  avatar_url: string | null;
  rating_avg: string | number;
  rating_count: number;
  created_at: string | Date;
  updated_at?: string | Date;
  /** Derived from ADMIN_EMAILS; never stored */
  is_admin?: boolean;
}

export interface UserWithPassword extends User {
  password_hash: string;
  suspended_at?: string | Date | null;
}

export interface JwtPayload {
  userId: string;
  email: string;
  /** Issued-at (seconds), added by jsonwebtoken */
  iat?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
