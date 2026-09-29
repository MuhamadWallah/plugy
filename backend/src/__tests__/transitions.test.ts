import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { query } from '../config/db.js';

const app = createApp();

describe('Job Lifecycle Status Transitions & Personal List (Step 5)', () => {
  const timestamp = Date.now();
  let posterCookie: string;
  let posterId: string;
  let workerCookie: string;
  let workerId: string;
  let bystanderCookie: string;
  let bystanderId: string;

  beforeAll(async () => {
    // 1. Poster
    const posterRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Lifecycle Poster',
        email: `lifecycle_poster_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    posterId = posterRes.body.user.id;
    posterCookie = (posterRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 2. Worker
    const workerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Lifecycle Worker',
        email: `lifecycle_worker_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    workerId = workerRes.body.user.id;
    workerCookie = (workerRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 3. Bystander (3rd party user)
    const bystanderRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Lifecycle Bystander',
        email: `lifecycle_bystander_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    bystanderId = bystanderRes.body.user.id;
    bystanderCookie = (bystanderRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];
  });

  afterAll(async () => {
    await query('DELETE FROM jobs WHERE poster_id = $1', [posterId]);
    await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [posterId, workerId, bystanderId]);
  });

  // Helper to create and accept a job
  const createAndAcceptJob = async () => {
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Cookie', posterCookie)
      .send({
        title: 'Transition Test Job',
        category: 'cleaning',
        description: 'Testing lifecycle',
        budget: 50,
      });

    const jobId = jobRes.body.job.id;

    await request(app)
      .post(`/api/jobs/${jobId}/accept`)
      .set('Cookie', workerCookie)
      .expect(200);

    return jobId;
  };

  describe('1. POST /api/jobs/:id/start (accepted -> in_progress)', () => {
    it('allows assigned worker to mark accepted job as in_progress (200 OK)', async () => {
      const jobId = await createAndAcceptJob();

      const res = await request(app)
        .post(`/api/jobs/${jobId}/start`)
        .set('Cookie', workerCookie)
        .expect(200);

      expect(res.body.job.status).toBe('in_progress');
    });

    it('rejects poster trying to start the job with 403 Forbidden', async () => {
      const jobId = await createAndAcceptJob();

      const res = await request(app)
        .post(`/api/jobs/${jobId}/start`)
        .set('Cookie', posterCookie)
        .expect(403);

      expect(res.body.error).toMatch(/only the assigned worker/i);
    });

    it('rejects bystander trying to start the job with 403 Forbidden', async () => {
      const jobId = await createAndAcceptJob();

      const res = await request(app)
        .post(`/api/jobs/${jobId}/start`)
        .set('Cookie', bystanderCookie)
        .expect(403);

      expect(res.body.error).toMatch(/only the assigned worker/i);
    });

    it('rejects starting a job that is still open (not accepted) with 400 Bad Request', async () => {
      const openJobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Unaccepted Job',
          category: 'ironing',
          budget: 25,
        });

      const openJobId = openJobRes.body.job.id;

      const res = await request(app)
        .post(`/api/jobs/${openJobId}/start`)
        .set('Cookie', workerCookie)
        .expect(403); // worker is not assigned yet

      expect(res.body.error).toMatch(/only the assigned worker/i);
    });

    it('rejects starting a job that is already in_progress with 400 Bad Request', async () => {
      const jobId = await createAndAcceptJob();
      // Start it once
      await request(app).post(`/api/jobs/${jobId}/start`).set('Cookie', workerCookie).expect(200);

      // Try starting it again
      const res = await request(app)
        .post(`/api/jobs/${jobId}/start`)
        .set('Cookie', workerCookie)
        .expect(400);

      expect(res.body.error).toMatch(/must be in accepted status/i);
    });
  });

  describe('2. POST /api/jobs/:id/complete (accepted or in_progress -> completed)', () => {
    it('allows assigned worker to mark job completed (200 OK)', async () => {
      const jobId = await createAndAcceptJob();
      await request(app).post(`/api/jobs/${jobId}/start`).set('Cookie', workerCookie).expect(200);

      const res = await request(app)
        .post(`/api/jobs/${jobId}/complete`)
        .set('Cookie', workerCookie)
        .expect(200);

      expect(res.body.job.status).toBe('completed');
      expect(res.body.job.completed_at).not.toBeNull();
    });

    it('allows poster to mark job completed (200 OK)', async () => {
      const jobId = await createAndAcceptJob();
      await request(app).post(`/api/jobs/${jobId}/start`).set('Cookie', workerCookie).expect(200);

      const res = await request(app)
        .post(`/api/jobs/${jobId}/complete`)
        .set('Cookie', posterCookie)
        .expect(200);

      expect(res.body.job.status).toBe('completed');
    });

    it('rejects bystander from marking job completed with 403 Forbidden', async () => {
      const jobId = await createAndAcceptJob();

      const res = await request(app)
        .post(`/api/jobs/${jobId}/complete`)
        .set('Cookie', bystanderCookie)
        .expect(403);

      expect(res.body.error).toMatch(/only the poster or assigned worker/i);
    });

    it('enforces terminal status: completed job cannot change status again (400 Bad Request)', async () => {
      const jobId = await createAndAcceptJob();
      await request(app).post(`/api/jobs/${jobId}/complete`).set('Cookie', posterCookie).expect(200);

      // Attempt to complete again
      const res1 = await request(app)
        .post(`/api/jobs/${jobId}/complete`)
        .set('Cookie', workerCookie)
        .expect(400);
      expect(res1.body.error).toMatch(/already completed/i);

      // Attempt to start a completed job
      const res2 = await request(app)
        .post(`/api/jobs/${jobId}/start`)
        .set('Cookie', workerCookie)
        .expect(400);
      expect(res2.body.error).toMatch(/must be in accepted status/i);

      // Attempt to cancel a completed job
      const res3 = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Cookie', posterCookie)
        .expect(400);
      expect(res3.body.error).toMatch(/completed jobs cannot be cancelled/i);
    });
  });

  describe('3. POST /api/jobs/:id/cancel (open or accepted -> cancelled)', () => {
    it('allows poster to cancel an open job (200 OK)', async () => {
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Open Cancel Test Job',
          category: 'gardening',
          budget: 45,
        });

      const jobId = jobRes.body.job.id;

      const res = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Cookie', posterCookie)
        .expect(200);

      expect(res.body.job.status).toBe('cancelled');
    });

    it('allows poster to cancel an accepted job (200 OK)', async () => {
      const jobId = await createAndAcceptJob();

      const res = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Cookie', posterCookie)
        .expect(200);

      expect(res.body.job.status).toBe('cancelled');
    });

    it('rejects worker trying to cancel a job with 403 Forbidden', async () => {
      const jobId = await createAndAcceptJob();

      const res = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Cookie', workerCookie)
        .expect(403);

      expect(res.body.error).toMatch(/only the job poster can cancel/i);
    });

    it('rejects cancelling a job that is already in_progress with 400 Bad Request', async () => {
      const jobId = await createAndAcceptJob();
      await request(app).post(`/api/jobs/${jobId}/start`).set('Cookie', workerCookie).expect(200);

      const res = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Cookie', posterCookie)
        .expect(400);

      expect(res.body.error).toMatch(/cannot cancel a job that is already in progress/i);
    });
  });

  describe('4. GET /api/jobs/mine (Personal Job List)', () => {
    it('returns jobs where user is poster or worker with roles and status', async () => {
      // Fetch poster's personal jobs
      const posterJobsRes = await request(app)
        .get('/api/jobs/mine')
        .set('Cookie', posterCookie)
        .expect(200);

      expect(Array.isArray(posterJobsRes.body.jobs)).toBe(true);
      expect(posterJobsRes.body.jobs.length).toBeGreaterThanOrEqual(1);

      const aJob = posterJobsRes.body.jobs[0];
      expect(aJob).toHaveProperty('is_poster', true);
      expect(aJob).toHaveProperty('status');

      // Fetch worker's personal jobs
      const workerJobsRes = await request(app)
        .get('/api/jobs/mine')
        .set('Cookie', workerCookie)
        .expect(200);

      expect(Array.isArray(workerJobsRes.body.jobs)).toBe(true);
      const acceptedWorkerJob = workerJobsRes.body.jobs.find((j: { is_worker: boolean }) => j.is_worker);
      expect(acceptedWorkerJob).toBeDefined();
    });

    it('rejects unauthenticated request to /api/jobs/mine with 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/api/jobs/mine')
        .expect(401);

      expect(res.body.error).toMatch(/authentication required/i);
    });
  });
});
