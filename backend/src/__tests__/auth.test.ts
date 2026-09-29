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
});
