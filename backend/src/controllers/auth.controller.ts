import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import { COOKIE_NAME, getCookieOptions, signToken } from '../config/jwt.js';
import { User, UserWithPassword } from '../types/auth.types.js';

export const register = async (req: Request, res: Response) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, email, password, phone } = parseResult.data;

    // Check for existing user with case-insensitive email match
    const existing = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists',
      });
    }

    // Hash the password securely
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const insertResult = await query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, avatar_url, rating_avg, rating_count, created_at, updated_at`,
      [name, email, password_hash, phone || null]
    );

    const user = insertResult.rows[0] as User;

    // Create session token and set httpOnly cookie
    const token = signToken({ userId: user.id, email: user.email });
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.status(201).json({
      message: 'Account created successfully',
      user,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parseResult.data;

    // Look up user by email
    const result = await query(
      `SELECT id, name, email, password_hash, phone, avatar_url, rating_avg, rating_count, created_at, updated_at
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userWithPw = result.rows[0] as UserWithPassword;

    // Verify password hash
    const isMatch = await bcrypt.compare(password, userWithPw.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Sanitize user object (omit password_hash)
    const { password_hash: _, ...user } = userWithPw;

    // Issue session token in httpOnly cookie
    const token = signToken({ userId: user.id, email: user.email });
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.status(200).json({
      message: 'Login successful',
      user,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0,
  });

  return res.status(200).json({
    message: 'Logged out successfully',
  });
};

export const getMe = (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.status(200).json({
    user: req.user,
  });
};
