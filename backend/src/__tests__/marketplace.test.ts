import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { query } from '../config/db.js';
import { hireWorker } from './helpers.js';

const app = createApp();

const register = async (name: string, email: string, phone?: string) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'Password123!', ...(phone ? { phone } : {}) });
  return {
    id: res.body.user.id as string,
    cookie: (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('plugy_token='))!.split(';')[0],
  };
};

describe('Hiring flow: arrival, contact sharing, back-outs, profiles & safety', () => {
  const stamp = Date.now();
  const rand = () => String(Math.floor(1000000 + Math.random() * 8999999));
  let poster: { id: string; cookie: string };
  let worker: { id: string; cookie: string };
  let worker2: { id: string; cookie: string };
  let bystander: { id: string; cookie: string };
  const posterPhone = `+1555${rand()}`;
  const workerPhone = `+1555${rand()}`;

  const createJob = async (extra: Record<string, unknown> = {}) => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', poster.cookie)
      .send({ title: 'Flow test job', category: 'cleaning', budget: 30, latitude: -17.81, longitude: 31.05, location_text: 'Avondale', ...extra });
    return res.body.job.id as string;
  };

  beforeAll(async () => {
    poster = await register('Flow Poster', `flow_poster_${stamp}@plugy.dev`, posterPhone);
    worker = await register('Flow Worker', `flow_worker_${stamp}@plugy.dev`, workerPhone);
    worker2 = await register('Flow Worker Two', `flow_worker2_${stamp}@plugy.dev`);
    bystander = await register('Flow Bystander', `flow_bystander_${stamp}@plugy.dev`);
  });

  afterAll(async () => {
    const ids = [poster.id, worker.id, worker2.id, bystander.id];
    await query('DELETE FROM jobs WHERE poster_id = $1', [poster.id]);
    await query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  });

  describe('Arrival milestones', () => {
    let jobId: string;

    beforeAll(async () => {
      jobId = await createJob();
      await hireWorker(app, jobId, poster.cookie, worker.cookie, 30);
    });

    it('only the hired worker can report being on the way or arrived', async () => {
      await request(app).post(`/api/jobs/${jobId}/en-route`).set('Cookie', poster.cookie).expect(403);
      await request(app).post(`/api/jobs/${jobId}/en-route`).set('Cookie', bystander.cookie).expect(403);
    });

    it('worker goes on the way, arrives, then starts the job', async () => {
      const enRoute = await request(app).post(`/api/jobs/${jobId}/en-route`).set('Cookie', worker.cookie).expect(200);
      expect(enRoute.body.job.en_route_at).not.toBeNull();
      expect(enRoute.body.job.arrived_at).toBeNull();

      const arrived = await request(app).post(`/api/jobs/${jobId}/arrived`).set('Cookie', worker.cookie).expect(200);
      expect(arrived.body.job.arrived_at).not.toBeNull();
      expect(arrived.body.job.status).toBe('accepted');

      const started = await request(app).post(`/api/jobs/${jobId}/start`).set('Cookie', worker.cookie).expect(200);
      expect(started.body.job.status).toBe('in_progress');
      expect(started.body.job.started_at).not.toBeNull();

      // Milestones are only valid before the job starts
      await request(app).post(`/api/jobs/${jobId}/arrived`).set('Cookie', worker.cookie).expect(400);
      // ...and the worker can no longer back out
      await request(app).post(`/api/jobs/${jobId}/release`).set('Cookie', worker.cookie).expect(400);
    });
  });

  describe('Contact details and exact location are shared only between matched parties', () => {
    let jobId: string;

    beforeAll(async () => {
      jobId = await createJob({ latitude: -17.812345, longitude: 31.056789 });
    });

    it('nobody sees phone numbers before a worker is hired', async () => {
      const posterView = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', poster.cookie).expect(200);
      expect(posterView.body.job.poster).not.toHaveProperty('phone');
      const workerView = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', worker.cookie).expect(200);
      expect(workerView.body.job.poster).not.toHaveProperty('phone');
      expect(workerView.body.job.location_precision).toBe('approximate');
    });

    it('after hiring, each side sees the other\'s phone and the worker sees the exact pin', async () => {
      await hireWorker(app, jobId, poster.cookie, worker.cookie, 30);

      const workerView = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', worker.cookie).expect(200);
      expect(workerView.body.job.poster.phone).toBe(posterPhone);
      expect(workerView.body.job.latitude).toBeCloseTo(-17.812345, 6);
      expect(workerView.body.job.location_precision).toBe('exact');

      const posterView = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', poster.cookie).expect(200);
      expect(posterView.body.job.worker.phone).toBe(workerPhone);

      const outsider = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', bystander.cookie).expect(200);
      expect(outsider.body.job.poster).not.toHaveProperty('phone');
      expect(outsider.body.job.worker).not.toHaveProperty('phone');
      expect(outsider.body.job.location_precision).toBe('approximate');

      const anonymous = await request(app).get('/api/jobs?status=accepted&limit=100').expect(200);
      const listed = anonymous.body.jobs.find((j: { id: string }) => j.id === jobId);
      expect(listed.worker).not.toHaveProperty('phone');
    });
  });

  describe('Backing out and cancelling', () => {
    it("a new worker never sees the previous worker's chat after a back-out", async () => {
      const jobId = await createJob();
      await hireWorker(app, jobId, poster.cookie, worker.cookie, 30);

      await request(app).post(`/api/jobs/${jobId}/messages`).set('Cookie', poster.cookie).send({ body: 'Gate code is 4471' }).expect(201);
      await request(app).post(`/api/jobs/${jobId}/release`).set('Cookie', worker.cookie).send({ reason: 'Car broke down' }).expect(200);

      // Chat is closed while the job is open again
      await request(app).post(`/api/jobs/${jobId}/messages`).set('Cookie', poster.cookie).send({ body: 'hello?' }).expect(409);

      await hireWorker(app, jobId, poster.cookie, worker2.cookie, 35);
      const history = await request(app).get(`/api/jobs/${jobId}/messages`).set('Cookie', worker2.cookie).expect(200);
      expect(history.body.messages).toHaveLength(0);

      // The previous worker has lost access entirely
      await request(app).get(`/api/jobs/${jobId}/messages`).set('Cookie', worker.cookie).expect(403);
    });

    it('poster cancels with a reason; it is visible to participants only', async () => {
      const jobId = await createJob();
      await hireWorker(app, jobId, poster.cookie, worker.cookie, 30);

      await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Cookie', poster.cookie)
        .send({ reason: 'Found someone closer' })
        .expect(200);

      const workerView = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', worker.cookie).expect(200);
      expect(workerView.body.job).toMatchObject({ status: 'cancelled', cancel_reason: 'Found someone closer' });

      const outsider = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', bystander.cookie).expect(200);
      expect(outsider.body.job).not.toHaveProperty('cancel_reason');
    });

    it('cancelling an open job closes its pending offers', async () => {
      const jobId = await createJob();
      await request(app).post(`/api/jobs/${jobId}/offers`).set('Cookie', worker2.cookie).send({ price: 25 }).expect(201);
      await request(app).post(`/api/jobs/${jobId}/cancel`).set('Cookie', poster.cookie).send({}).expect(200);

      const offers = await query('SELECT status FROM job_offers WHERE job_id = $1', [jobId]);
      expect(offers.rows[0].status).toBe('not_selected');
    });
  });

  describe('Public profiles and safety reports', () => {
    it('shows a worker\'s track record and reviews without contact details', async () => {
      const jobId = await createJob();
      await hireWorker(app, jobId, poster.cookie, worker2.cookie, 30);
      await request(app).post(`/api/jobs/${jobId}/complete`).set('Cookie', poster.cookie).expect(200);
      await request(app).post(`/api/jobs/${jobId}/rate`).set('Cookie', poster.cookie).send({ score: 5, comment: 'Spotless' }).expect(201);

      const res = await request(app).get(`/api/users/${worker2.id}`).expect(200);
      expect(res.body.profile).toMatchObject({ id: worker2.id, name: 'Flow Worker Two', jobs_completed: 1 });
      expect(res.body.profile).not.toHaveProperty('phone');
      expect(res.body.profile).not.toHaveProperty('email');
      expect(res.body.reviews[0]).toMatchObject({ score: 5, comment: 'Spotless', from_customer: true });
    });

    it('accepts a safety report once per day per user pair', async () => {
      await request(app).post(`/api/users/${worker.id}/report`).send({ reason: 'no_show' }).expect(401);
      await request(app).post(`/api/users/${worker.id}/report`).set('Cookie', poster.cookie).send({ reason: 'not_a_reason' }).expect(400);
      await request(app).post(`/api/users/${poster.id}/report`).set('Cookie', poster.cookie).send({ reason: 'other' }).expect(400);

      await request(app)
        .post(`/api/users/${worker.id}/report`)
        .set('Cookie', poster.cookie)
        .send({ reason: 'no_show', details: 'Never arrived and stopped answering' })
        .expect(201);
      await request(app)
        .post(`/api/users/${worker.id}/report`)
        .set('Cookie', poster.cookie)
        .send({ reason: 'no_show' })
        .expect(409);
    });
  });
});
