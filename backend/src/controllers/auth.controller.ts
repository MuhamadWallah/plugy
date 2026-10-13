import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from '../validators/auth.validator.js';
import { COOKIE_NAME, getCookieOptions, signToken } from '../config/jwt.js';
import { User, UserWithPassword } from '../types/auth.types.js';
import { otpService } from '../services/otp.service.js';
import { env, isAdminEmail } from '../config/env.js';

/**
 * POST /api/auth/send-otp
 * Dispatches a 6-digit one-time password to the specified phone number
 */
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const parseResult = sendOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { phone } = parseResult.data;
    const normalizedPhone = otpService.normalizePhone(phone);

    // Check for existing user with this verified phone number
    const existing = await query(
      'SELECT id FROM users WHERE phone = $1 AND phone_verified = TRUE',
      [normalizedPhone]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'An account with this phone number is already registered',
      });
    }

    const result = await otpService.sendOtp(normalizedPhone);

    if (!result.success) {
      return res.status(result.statusCode ?? 429).json({
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return res.status(200).json({
      message: result.message,
      phone: result.phone,
      devOtp: result.devOtp,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ error: 'Failed to send one-time password' });
  }
};

/**
 * POST /api/auth/verify-otp
 * Verifies a 6-digit one-time password for a phone number
 */
export const verifyOtpHandler = async (req: Request, res: Response) => {
  try {
    const parseResult = verifyOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { phone, otp } = parseResult.data;
    const result = await otpService.verifyOtp(phone, otp);

    if (!result.valid) {
      return res.status(400).json({
        error: result.error || 'Invalid verification code',
      });
    }

    return res.status(200).json({
      verified: true,
      message: 'Phone number verified successfully',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Failed to verify code' });
  }
};

/**
 * POST /api/auth/register
 * Registers a new account, enforcing phone number verification via OTP
 */
export const register = async (req: Request, res: Response) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, email, password, phone, otp } = parseResult.data;
    // Store the same normalized form the OTP service uses, so duplicate checks and cleanup match
    const trimmedPhone = phone && phone.trim() !== '' ? otpService.normalizePhone(phone) : null;

    // Check for existing user with case-insensitive email match
    const existingEmail = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists',
      });
    }

    // Check for existing user with this phone number (if phone provided)
    if (trimmedPhone) {
      const existingPhone = await query(
        'SELECT id FROM users WHERE phone = $1',
        [trimmedPhone]
      );

      if (existingPhone.rows.length > 0) {
        return res.status(409).json({
          error: 'An account with this phone number already exists',
        });
      }
    }

    // Verify phone OTP
    let phoneVerified = false;

    if (trimmedPhone) {
      if (otp) {
        const verifyResult = await otpService.verifyOtp(trimmedPhone, otp);
        if (!verifyResult.valid) {
          return res.status(400).json({
            error: verifyResult.error || 'Invalid or expired phone verification code',
          });
        }
        phoneVerified = true;
      } else {
        // In production, OTP is mandatory if phone is provided
        if (env.NODE_ENV === 'production') {
          return res.status(400).json({
            error: 'Phone verification code (OTP) is required to complete registration',
          });
        }
        phoneVerified = true;
      }
    }

    // Hash the password securely
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const insertResult = await query(
      `INSERT INTO users (name, email, password_hash, phone, phone_verified)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, phone_verified, avatar_url, rating_avg, rating_count, created_at, updated_at`,
      [name, email, password_hash, trimmedPhone, phoneVerified]
    );

    const user = { ...insertResult.rows[0], is_admin: isAdminEmail(insertResult.rows[0].email) } as User;

    // Clean up consumed phone verification records
    if (trimmedPhone) {
      await query('DELETE FROM phone_verifications WHERE phone = $1', [trimmedPhone]);
    }

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

/**
 * POST /api/auth/login
 */
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
      `SELECT id, name, email, password_hash, phone, phone_verified, avatar_url, rating_avg, rating_count, created_at, updated_at,
              (id_verified_at IS NOT NULL) AS id_verified, suspended_at
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

    if (userWithPw.suspended_at) {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    }

    // Sanitize user object (omit password_hash and moderation fields)
    const { password_hash: _, suspended_at: _suspended, ...publicUser } = userWithPw;
    const user = { ...publicUser, is_admin: isAdminEmail(publicUser.email) };

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

/**
 * POST /api/auth/password-reset/request { phone }
 * Sends a reset code by SMS to the account's verified phone. The response is the same whether
 * or not an account exists, so it can't be used to discover registered numbers.
 */
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const parsed = passwordResetRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const phone = otpService.normalizePhone(parsed.data.phone);
    const genericResponse = {
      message: 'If an account uses this phone number, a reset code has been sent by SMS.',
      phone,
    };

    const account = await query(
      'SELECT id FROM users WHERE phone = $1 AND phone_verified = TRUE AND suspended_at IS NULL',
      [phone]
    );
    if (account.rows.length === 0) {
      return res.status(200).json(genericResponse);
    }

    const result = await otpService.sendOtp(phone);
    if (!result.success) {
      return res.status(result.statusCode ?? 429).json({
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return res.status(200).json({ ...genericResponse, devOtp: result.devOtp });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ error: 'Failed to start password reset' });
  }
};

/**
 * POST /api/auth/password-reset/confirm { phone, otp, password }
 * Sets a new password, signs out every other device, and signs this one in.
 */
export const confirmPasswordReset = async (req: Request, res: Response) => {
  try {
    const parsed = passwordResetConfirmSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const phone = otpService.normalizePhone(parsed.data.phone);
    const { otp, password } = parsed.data;

    const account = await query(
      'SELECT id FROM users WHERE phone = $1 AND phone_verified = TRUE AND suspended_at IS NULL',
      [phone]
    );
    if (account.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const verification = await otpService.verifyOtp(phone, otp);
    if (!verification.valid) {
      return res.status(400).json({ error: verification.error || 'Invalid or expired reset code' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const updated = await query(
      `UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, phone, phone_verified, avatar_url, rating_avg, rating_count, created_at, updated_at`,
      [password_hash, account.rows[0].id]
    );
    await query('DELETE FROM phone_verifications WHERE phone = $1', [phone]);

    const user = { ...updated.rows[0], is_admin: isAdminEmail(updated.rows[0].email) } as User;
    const token = signToken({ userId: user.id, email: user.email });
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.status(200).json({
      message: 'Password updated. You are now signed in, and other devices have been signed out.',
      user,
    });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};

/**
 * POST /api/auth/logout
 */
export const logout = (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0,
  });

  return res.status(200).json({
    message: 'Logged out successfully',
  });
};

/**
 * GET /api/auth/me
 */
export const getMe = (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.status(200).json({
    user: req.user,
  });
};
