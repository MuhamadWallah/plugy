import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool, query } from '../config/db.js';

const app = createApp();

describe('Authentication API & Protected Routes', () => {
  const timestamp = Date.now();
  const testUser = {
    name: 'Alice Johnson',
    email: `alice_${timestamp}@plugy.dev`,
    password: 'SecurePassword123!',
    phone: '+1 555-0199',
  };

  let authCookie: string;

  beforeAll(async () => {
    // Ensure DB connection is active
    await query('SELECT 1');
  });

  afterAll(async () => {
    // Clean up specific test user
    await query('DELETE FROM users WHERE email = $1', [testUser.email]);
  });

  describe('1. Registration (POST /api/auth/register)', () => {
    it('successfully registers a new user, hashes password, and returns httpOnly cookie', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        name: testUser.name,
        email: testUser.email,
        phone: testUser.phone,
      });
      // Ensure password_hash is NEVER leaked
      expect(response.body.user).not.toHaveProperty('password_hash');
      expect(response.body.user).not.toHaveProperty('password');

      // Verify Set-Cookie header contains plugy_token with HttpOnly
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const tokenCookie = cookies.find((c) => c.startsWith('plugy_token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
    });

    it('rejects registration with duplicate email with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/already exists/i);
    });

    it('rejects registration with invalid input (short password, invalid email)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'A',
          email: 'not-an-email',
          password: '123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('2. Login (POST /api/auth/login)', () => {
    it('successfully logs in with valid credentials and sets session cookie', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password_hash');

      // Save session cookie for subsequent protected route tests
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const tokenCookie = cookies.find((c) => c.startsWith('plugy_token='));
      expect(tokenCookie).toBeDefined();
      authCookie = tokenCookie!.split(';')[0];
    });

    it('rejects login with incorrect password with 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword999!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid email or password/i);
    });

    it('rejects login with non-existent email with 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent_user_9999@plugy.dev',
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid email or password/i);
    });
  });

  describe('3. Protected Routes & Middleware Security', () => {
    it('rejects access to protected test route when no session is provided', async () => {
      const response = await request(app)
        .get('/api/protected-test')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/authentication required/i);
    });

    it('rejects GET /api/auth/me when no session cookie is present', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/authentication required/i);
    });

    it('allows access to GET /api/auth/me with valid session cookie and returns current user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.name).toBe(testUser.name);
    });

    it('allows access to custom protected route with valid session cookie', async () => {
      const response = await request(app)
        .get('/api/protected-test')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Access granted to protected route');
      expect(response.body.user.email).toBe(testUser.email);
    });
  });

  describe('4. Logout (POST /api/auth/logout)', () => {
    it('clears session cookie on logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Logged out successfully');

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) => c.startsWith('plugy_token='));
      expect(clearedCookie).toBeDefined();
      // Cookie is cleared with Max-Age=0
      expect(clearedCookie).toMatch(/Max-Age=0/);
    });
  });

  describe('5. Phone Number OTP Verification & Registration', () => {
    const otpTestPhone = `+1555${Math.floor(100000 + Math.random() * 900000)}`;
    let generatedOtp: string;

    it('sends 6-digit one-time password to a valid phone number', async () => {
      const response = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: otpTestPhone })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('devOtp');
      expect(response.body.devOtp).toMatch(/^[0-9]{6}$/);
      generatedOtp = response.body.devOtp;
    });

    it('rejects sending OTP to invalid phone number format with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: '123' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
    });

    it('enforces 60-second cooldown on repeated OTP dispatch with 429 Too Many Requests', async () => {
      const response = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: otpTestPhone })
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/wait 60 seconds/i);
    });

    it('rejects verify-otp with incorrect 6-digit code with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          phone: otpTestPhone,
          otp: '000000',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid verification code/i);
    });

    it('rejects registration with invalid OTP code with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'OTP Test User',
          email: `otptest_${Date.now()}@plugy.dev`,
          password: 'Password123!',
          phone: otpTestPhone,
          otp: '999999',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid.*code/i);
    });

    it('successfully verifies phone OTP with correct code', async () => {
      const response = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          phone: otpTestPhone,
          otp: generatedOtp,
        })
        .expect(200);

      expect(response.body).toHaveProperty('verified', true);
    });

    it('completes registration with verified phone number and marks phone_verified = true', async () => {
      const newPhone = `+1555${Math.floor(100000 + Math.random() * 900000)}`;
      // Send OTP to new phone
      const otpRes = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: newPhone })
        .expect(200);

      const code = otpRes.body.devOtp;

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Verified Courier',
          email: `verified_${Date.now()}@plugy.dev`,
          password: 'Password123!',
          phone: newPhone,
          otp: code,
        })
        .expect(201);

      expect(regRes.body).toHaveProperty('user');
      expect(regRes.body.user).toHaveProperty('phone_verified', true);

      // Subsequent attempt to send OTP for this verified phone returns 409 Conflict
      const dupOtpRes = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: newPhone })
        .expect(409);

      expect(dupOtpRes.body).toHaveProperty('error');
      expect(dupOtpRes.body.error).toMatch(/already registered/i);
    });
  });
});
