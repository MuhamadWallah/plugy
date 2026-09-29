import { Request } from 'express';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  rating_avg: string | number;
  rating_count: number;
  created_at: string | Date;
  updated_at?: string | Date;
}

export interface UserWithPassword extends User {
  password_hash: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
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
