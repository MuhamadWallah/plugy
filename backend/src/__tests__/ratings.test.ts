import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { query } from '../config/db.js';

const app = createApp();

describe('Job Ratings API (Step 7)', () => {
  const timestamp = Date.now();
  let posterCookie: string;
  let posterId: string;
  let workerCookie: string;
  let workerId: string;
  let bystanderCookie: string;
  let bystanderId: string;

  let jobId: string;
  let job2Id: string;
  let job3Id: string;

  beforeAll(async () => {
    // 1. Register Poster
    const posterRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Rating Poster',
        email: `rating_poster_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    posterId = posterRes.body.user.id;
    posterCookie = (posterRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 2. Register Worker
    const workerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Rating Worker',
        email: `rating_worker_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    workerId = workerRes.body.user.id;
    workerCookie = (workerRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 3. Register Bystander (Third-party user)
    const bystanderRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Rating Bystander',
        email: `rating_bystander_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    bystanderId = bystanderRes.body.user.id;
    bystanderCookie = (bystanderRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 4. Create Job 1 (starts "open")
    const j1 = await request(app)
      .post('/api/jobs')
      .set('Cookie', posterCookie)
      .send({
        title: 'Rating Test Job 1',
        category: 'cleaning',
        description: 'Deep house cleaning',
        budget: 90,
      });
    jobId = j1.body.job.id;
  });

  afterAll(async () => {
    const jobIds = [jobId, job2Id, job3Id].filter(Boolean);
    if (jobIds.length > 0) {
      await query('DELETE FROM ratings WHERE job_id = ANY($1)', [jobIds]);
      await query('DELETE FROM jobs WHERE id = ANY($1)', [jobIds]);
    }
    await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [posterId, workerId, bystanderId]);
  });

  describe('Validation: Can\'t rate before completion', () => {
    it('rejects rating when job is "open"', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 5, comment: 'Too early' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/before it is completed/i);
    });

    it('rejects rating when job is "accepted"', async () => {
      // Worker accepts
      await request(app)
        .post(`/api/jobs/${jobId}/accept`)
        .set('Cookie', workerCookie);

      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', workerCookie)
        .send({ score: 5, comment: 'Still too early' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/before it is completed/i);
    });

    it('rejects rating when job is "in_progress"', async () => {
      // Worker starts
      await request(app)
        .post(`/api/jobs/${jobId}/start`)
        .set('Cookie', workerCookie);

      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 5, comment: 'Job in progress, cannot rate yet' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/before it is completed/i);
    });
  });

  describe('Authorization: Bystanders and Self-Rating', () => {
    beforeAll(async () => {
      // Complete Job 1
      await request(app)
        .post(`/api/jobs/${jobId}/complete`)
        .set('Cookie', workerCookie);
    });

    it('bystander (third user) gets 403 when trying to rate', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', bystanderCookie)
        .send({ score: 5, comment: 'I am a third party' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only the poster or worker/i);
    });

    it('unauthenticated user gets 401', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .send({ score: 5 });

      expect(res.status).toBe(401);
    });
  });

  describe('Score Validation', () => {
    it('rejects score < 1 with 400', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/integer between 1 and 5/i);
    });

    it('rejects score > 5 with 400', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 6 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/integer between 1 and 5/i);
    });

    it('rejects decimal score with 400', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 4.5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/integer between 1 and 5/i);
    });
  });

  describe('Post-Completion Rating & Duplicate Prevention', () => {
    it('poster can successfully rate the worker', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 5, comment: 'Punctual, thorough, and clean!' });

      expect(res.status).toBe(201);
      expect(res.body.rating).toBeDefined();
      expect(res.body.rating.score).toBe(5);
      expect(res.body.rating.comment).toBe('Punctual, thorough, and clean!');
      expect(res.body.rating.rater_id).toBe(posterId);
      expect(res.body.rating.ratee_id).toBe(workerId);
      expect(res.body.ratee).toBeDefined();
      expect(Number(res.body.ratee.rating_avg)).toBe(5.00);
      expect(res.body.ratee.rating_count).toBe(1);
    });

    it('can\'t rate twice: poster cannot submit a second rating for the same job', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 4, comment: 'Trying to rate again' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already rated/i);
    });

    it('worker can rate the poster on the same job', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', workerCookie)
        .send({ score: 5, comment: 'Clear instructions and friendly communication!' });

      expect(res.status).toBe(201);
      expect(res.body.rating.score).toBe(5);
      expect(res.body.rating.rater_id).toBe(workerId);
      expect(res.body.rating.ratee_id).toBe(posterId);
      expect(Number(res.body.ratee.rating_avg)).toBe(5.00);
      expect(res.body.ratee.rating_count).toBe(1);
    });

    it('can\'t rate twice: worker cannot submit a second rating for the same job', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/rate`)
        .set('Cookie', workerCookie)
        .send({ score: 3 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already rated/i);
    });
  });

  describe('Average Recalculates Correctly', () => {
    it('recalculates worker rating average as 4.50 after second rating of 4', async () => {
      // Create and complete Job 2 with same worker
      const j2 = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Rating Test Job 2',
          category: 'ironing',
          budget: 40,
        });
      job2Id = j2.body.job.id;

      await request(app).post(`/api/jobs/${job2Id}/accept`).set('Cookie', workerCookie);
      await request(app).post(`/api/jobs/${job2Id}/complete`).set('Cookie', posterCookie);

      // Rate worker with score 4
      const res = await request(app)
        .post(`/api/jobs/${job2Id}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 4, comment: 'Good job overall' });

      expect(res.status).toBe(201);
      // Previous rating was 5, new is 4 -> (5 + 4) / 2 = 4.50
      expect(Number(res.body.ratee.rating_avg)).toBe(4.50);
      expect(res.body.ratee.rating_count).toBe(2);

      // Verify directly in DB
      const userDb = await query('SELECT rating_avg, rating_count FROM users WHERE id = $1', [workerId]);
      expect(Number(userDb.rows[0].rating_avg)).toBe(4.50);
      expect(userDb.rows[0].rating_count).toBe(2);
    });

    it('recalculates worker rating average as 3.67 after third rating of 2', async () => {
      // Create and complete Job 3 with same worker
      const j3 = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Rating Test Job 3',
          category: 'gardening',
          budget: 55,
        });
      job3Id = j3.body.job.id;

      await request(app).post(`/api/jobs/${job3Id}/accept`).set('Cookie', workerCookie);
      await request(app).post(`/api/jobs/${job3Id}/complete`).set('Cookie', workerCookie);

      // Rate worker with score 2
      const res = await request(app)
        .post(`/api/jobs/${job3Id}/rate`)
        .set('Cookie', posterCookie)
        .send({ score: 2, comment: 'Arrived very late' });

      expect(res.status).toBe(201);
      // Ratings: 5, 4, 2 -> (5 + 4 + 2) / 3 = 11 / 3 = 3.6666... -> 3.67
      expect(Number(res.body.ratee.rating_avg)).toBe(3.67);
      expect(res.body.ratee.rating_count).toBe(3);

      const userDb = await query('SELECT rating_avg, rating_count FROM users WHERE id = $1', [workerId]);
      expect(Number(userDb.rows[0].rating_avg)).toBe(3.67);
      expect(userDb.rows[0].rating_count).toBe(3);
    });
  });

  describe('GET /api/jobs/:id/ratings & Enriched Job Details', () => {
    it('retrieves ratings for a completed job', async () => {
      const res = await request(app).get(`/api/jobs/${jobId}/ratings`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.ratings)).toBe(true);
      expect(res.body.ratings.length).toBe(2); // Poster rating & Worker rating
      expect(res.body.ratings[0].rater).toBeDefined();
      expect(res.body.ratings[0].ratee).toBeDefined();
    });

    it('GET /api/jobs/:id includes aggregated ratings array', async () => {
      const res = await request(app).get(`/api/jobs/${jobId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.job.ratings)).toBe(true);
      expect(res.body.job.ratings.length).toBe(2);
    });
  });
});
