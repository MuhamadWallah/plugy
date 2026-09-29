import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { query } from '../config/db.js';

const app = createApp();

describe('Job Feed, Posting & Race-Condition Safe Acceptance (Step 4)', () => {
  const timestamp = Date.now();
  let posterCookie: string;
  let posterId: string;
  let worker1Cookie: string;
  let worker1Id: string;
  let worker2Cookie: string;
  let worker2Id: string;

  beforeAll(async () => {
    // 1. Create Poster User
    const posterRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Poster User',
        email: `poster_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    posterId = posterRes.body.user.id;
    posterCookie = (posterRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 2. Create Worker 1 User
    const worker1Res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Worker One',
        email: `worker1_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    worker1Id = worker1Res.body.user.id;
    worker1Cookie = (worker1Res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 3. Create Worker 2 User
    const worker2Res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Worker Two',
        email: `worker2_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    worker2Id = worker2Res.body.user.id;
    worker2Cookie = (worker2Res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];
  });

  afterAll(async () => {
    await query('DELETE FROM jobs WHERE poster_id = $1', [posterId]);
    await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [posterId, worker1Id, worker2Id]);
  });

  describe('GET /api/jobs (Job Feed & Filtering)', () => {
    let cleaningJobId: string;
    let gardeningJobId: string;

    beforeAll(async () => {
      // Seed two test jobs in different categories
      const job1 = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Feed Test Cleaning Job',
          category: 'cleaning',
          description: 'Quick kitchen cleaning',
          location_text: 'Midtown',
          budget: 55,
        });
      cleaningJobId = job1.body.job.id;

      const job2 = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Feed Test Gardening Job',
          category: 'gardening',
          description: 'Hedge trimming',
          location_text: 'Suburbs',
          budget: 70,
        });
      gardeningJobId = job2.body.job.id;
    });

    it('returns a paginated list of open jobs, newest first', async () => {
      const response = await request(app)
        .get('/api/jobs?status=open&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.jobs)).toBe(true);
      expect(response.body.jobs.length).toBeGreaterThanOrEqual(2);

      // Verify jobs have poster metadata joined
      const foundJob = response.body.jobs.find((j: { id: string }) => j.id === cleaningJobId);
      expect(foundJob).toBeDefined();
      expect(foundJob.poster).toHaveProperty('name', 'Poster User');
      expect(foundJob.status).toBe('open');
    });

    it('filters open jobs by category', async () => {
      const response = await request(app)
        .get('/api/jobs?category=gardening&status=open')
        .expect(200);

      const gardeningJobs = response.body.jobs;
      expect(gardeningJobs.some((j: { id: string }) => j.id === gardeningJobId)).toBe(true);
      expect(gardeningJobs.some((j: { id: string }) => j.id === cleaningJobId)).toBe(false);
    });
  });

  describe('POST /api/jobs/:id/accept (Self-Acceptance & Permission Guard)', () => {
    it('rejects poster trying to accept their own job with 400 Bad Request', async () => {
      // Create a fresh open job
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Self Accept Test Job',
          category: 'ironing',
          description: 'Try self accept',
          budget: 30,
        });

      const jobId = jobRes.body.job.id;

      // Poster tries to accept their own job
      const response = await request(app)
        .post(`/api/jobs/${jobId}/accept`)
        .set('Cookie', posterCookie)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/cannot accept your own job/i);
    });

    it('rejects unauthenticated user trying to accept a job with 401 Unauthorized', async () => {
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Unauth Accept Test Job',
          category: 'car_wash',
          description: 'Try unauthenticated accept',
          budget: 40,
        });

      const jobId = jobRes.body.job.id;

      const response = await request(app)
        .post(`/api/jobs/${jobId}/accept`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/authentication required/i);
    });
  });

  describe('CONCURRENCY TEST: Two simultaneous accept requests on the same job', () => {
    it('ensures atomic race-condition safety: ONLY ONE concurrent request succeeds (200), and the other fails with 409 Conflict', async () => {
      // Step A: Create a brand new open job
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'High-Demand Courier Delivery / Errand Job',
          category: 'care_taking',
          description: 'Two workers see this job at the exact same millisecond and tap Accept simultaneously.',
          location_text: 'Central Station Platform 2',
          budget: 120.0,
        })
        .expect(201);

      const targetJobId = jobRes.body.job.id;

      // Confirm job starts open with no worker assigned
      const initialJob = await query('SELECT status, worker_id FROM jobs WHERE id = $1', [targetJobId]);
      expect(initialJob.rows[0].status).toBe('open');
      expect(initialJob.rows[0].worker_id).toBeNull();

      // Step B: Simulate simultaneous concurrent accept requests from Worker 1 and Worker 2
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/jobs/${targetJobId}/accept`)
          .set('Cookie', worker1Cookie),
        request(app)
          .post(`/api/jobs/${targetJobId}/accept`)
          .set('Cookie', worker2Cookie),
      ]);

      const statuses = [res1.status, res2.status].sort();

      // CRITICAL ASSERTION: Exactly ONE request must get 200 OK, and exactly ONE must get 409 Conflict
      expect(statuses).toEqual([200, 409]);

      // Identify winner and runner-up
      const successRes = res1.status === 200 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;
      const winningWorkerId = res1.status === 200 ? worker1Id : worker2Id;

      // Check success response
      expect(successRes.body).toHaveProperty('message', 'Job accepted successfully');
      expect(successRes.body.job.status).toBe('accepted');
      expect(successRes.body.job.worker_id).toBe(winningWorkerId);

      // Check 409 Conflict response
      expect(conflictRes.body).toHaveProperty('error');
      expect(conflictRes.body.error).toMatch(/no longer open or has already been accepted/i);

      // Step C: Verify in Database directly
      const dbCheck = await query(
        'SELECT status, worker_id, accepted_at FROM jobs WHERE id = $1',
        [targetJobId]
      );

      expect(dbCheck.rows[0].status).toBe('accepted');
      expect(dbCheck.rows[0].worker_id).toBe(winningWorkerId);
      expect(dbCheck.rows[0].accepted_at).not.toBeNull();
    });
  });
});
