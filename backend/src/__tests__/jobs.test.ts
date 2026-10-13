import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { query } from '../config/db.js';

const app = createApp();

describe('Job Feed, Offers & Race-Condition Safe Hiring (Step 4)', () => {
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

  describe('Offers: accept the price or counter-offer (InDrive-style bidding)', () => {
    let offerJobId: string;
    let worker1OfferId: string;
    let worker2OfferId: string;

    beforeAll(async () => {
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'Offer Flow Test Job',
          category: 'cleaning',
          description: 'Kitchen and bathroom',
          budget: 40,
        });
      offerJobId = jobRes.body.job.id;
    });

    it('rejects the poster making an offer on their own job with 400', async () => {
      const response = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', posterCookie)
        .send({ price: 40 })
        .expect(400);
      expect(response.body.error).toMatch(/your own job/i);
    });

    it('rejects unauthenticated offers with 401', async () => {
      const response = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .send({ price: 40 })
        .expect(401);
      expect(response.body.error).toMatch(/authentication required/i);
    });

    it('rejects invalid prices with 400', async () => {
      await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker1Cookie)
        .send({ price: -5 })
        .expect(400);
    });

    it('worker 1 accepts the posted price; worker 2 counter-offers with ETA and note', async () => {
      const res1 = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker1Cookie)
        .send({ price: 40 })
        .expect(201);
      worker1OfferId = res1.body.offer.id;
      expect(res1.body.offer).toMatchObject({ status: 'pending', worker_id: worker1Id });

      const res2 = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker2Cookie)
        .send({ price: '55.50', eta_minutes: 30, message: 'I bring my own supplies' })
        .expect(201);
      worker2OfferId = res2.body.offer.id;
      expect(Number(res2.body.offer.price)).toBe(55.5);
      expect(res2.body.offer.eta_minutes).toBe(30);
    });

    it('a worker re-submitting updates their single offer instead of duplicating it', async () => {
      const res = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker2Cookie)
        .send({ price: 50, eta_minutes: 20 })
        .expect(200);
      expect(res.body.offer.id).toBe(worker2OfferId);
      expect(Number(res.body.offer.price)).toBe(50);
    });

    it("poster sees all offers with each worker's track record; a worker only sees their own", async () => {
      const posterView = await request(app)
        .get(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', posterCookie)
        .expect(200);
      expect(posterView.body.offers).toHaveLength(2);
      // Cheapest first
      expect(posterView.body.offers[0].id).toBe(worker1OfferId);
      expect(posterView.body.offers[0].worker).toHaveProperty('jobs_completed');
      expect(posterView.body.offers[0].worker).toHaveProperty('rating_avg');

      const workerView = await request(app)
        .get(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker2Cookie)
        .expect(200);
      expect(workerView.body.offers).toHaveLength(1);
      expect(workerView.body.offers[0].id).toBe(worker2OfferId);
    });

    it('only the poster can accept an offer', async () => {
      await request(app)
        .post(`/api/jobs/${offerJobId}/offers/${worker1OfferId}/accept`)
        .set('Cookie', worker2Cookie)
        .expect(403);
    });

    it('poster raises the price on an open job (must go up)', async () => {
      await request(app)
        .patch(`/api/jobs/${offerJobId}/budget`)
        .set('Cookie', posterCookie)
        .send({ budget: 35 })
        .expect(400);

      const res = await request(app)
        .patch(`/api/jobs/${offerJobId}/budget`)
        .set('Cookie', posterCookie)
        .send({ budget: 45 })
        .expect(200);
      expect(Number(res.body.job.budget)).toBe(45);

      await request(app)
        .patch(`/api/jobs/${offerJobId}/budget`)
        .set('Cookie', worker1Cookie)
        .send({ budget: 60 })
        .expect(403);
    });

    it('poster hires worker 2 at their offered price; the other offer is not selected', async () => {
      const res = await request(app)
        .post(`/api/jobs/${offerJobId}/offers/${worker2OfferId}/accept`)
        .set('Cookie', posterCookie)
        .expect(200);

      expect(res.body.job).toMatchObject({ status: 'accepted', worker_id: worker2Id });
      expect(Number(res.body.job.agreed_price)).toBe(50);

      const offers = await query('SELECT id, status FROM job_offers WHERE job_id = $1', [offerJobId]);
      const byId = Object.fromEntries(offers.rows.map((r) => [r.id, r.status]));
      expect(byId[worker2OfferId]).toBe('accepted');
      expect(byId[worker1OfferId]).toBe('not_selected');
    });

    it('no new offers once a worker is hired', async () => {
      const res = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker1Cookie)
        .send({ price: 30 })
        .expect(409);
      expect(res.body.error).toMatch(/no longer accepting offers/i);
    });

    it('if the hired worker backs out, the job reopens and passed-over offers become pending again', async () => {
      const res = await request(app)
        .post(`/api/jobs/${offerJobId}/release`)
        .set('Cookie', worker2Cookie)
        .send({ reason: 'Family emergency' })
        .expect(200);
      expect(res.body.message).toMatch(/open for other workers/i);

      const job = await query('SELECT status, worker_id, agreed_price FROM jobs WHERE id = $1', [offerJobId]);
      expect(job.rows[0]).toMatchObject({ status: 'open', worker_id: null, agreed_price: null });

      const offers = await query('SELECT id, status FROM job_offers WHERE job_id = $1', [offerJobId]);
      const byId = Object.fromEntries(offers.rows.map((r) => [r.id, r.status]));
      expect(byId[worker1OfferId]).toBe('pending');
      expect(byId[worker2OfferId]).toBe('withdrawn');
    });

    it('declined workers cannot re-offer; workers can withdraw their own offer', async () => {
      await request(app)
        .post(`/api/jobs/${offerJobId}/offers/${worker1OfferId}/decline`)
        .set('Cookie', posterCookie)
        .expect(200);

      const retry = await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker1Cookie)
        .send({ price: 20 })
        .expect(409);
      expect(retry.body.error).toMatch(/declined/i);

      // Worker 2 (who backed out) can bid again, then withdraw
      await request(app)
        .post(`/api/jobs/${offerJobId}/offers`)
        .set('Cookie', worker2Cookie)
        .send({ price: 60 })
        .expect(200);
      await request(app)
        .post(`/api/jobs/${offerJobId}/offers/withdraw`)
        .set('Cookie', worker2Cookie)
        .expect(200);
      await request(app)
        .post(`/api/jobs/${offerJobId}/offers/withdraw`)
        .set('Cookie', worker2Cookie)
        .expect(404);
    });

    it("lists a worker's own offers", async () => {
      const res = await request(app)
        .get('/api/offers/mine')
        .set('Cookie', worker1Cookie)
        .expect(200);
      expect(
        res.body.offers.some((o: { job_id: string; status: string }) => o.job_id === offerJobId && o.status === 'declined')
      ).toBe(true);
    });
  });

  describe('CONCURRENCY TEST: poster accepts two offers at the same time', () => {
    it('ensures atomic race-condition safety: exactly one hire succeeds (200) and the other gets 409', async () => {
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({
          title: 'High-Demand Errand Job',
          category: 'care_taking',
          description: 'The poster double-taps two offers at the exact same moment.',
          location_text: 'Central Station Platform 2',
          budget: 120.0,
        })
        .expect(201);

      const targetJobId = jobRes.body.job.id;

      const [offer1, offer2] = await Promise.all([
        request(app).post(`/api/jobs/${targetJobId}/offers`).set('Cookie', worker1Cookie).send({ price: 120 }),
        request(app).post(`/api/jobs/${targetJobId}/offers`).set('Cookie', worker2Cookie).send({ price: 110 }),
      ]);
      expect(offer1.status).toBe(201);
      expect(offer2.status).toBe(201);

      const [res1, res2] = await Promise.all([
        request(app).post(`/api/jobs/${targetJobId}/offers/${offer1.body.offer.id}/accept`).set('Cookie', posterCookie),
        request(app).post(`/api/jobs/${targetJobId}/offers/${offer2.body.offer.id}/accept`).set('Cookie', posterCookie),
      ]);

      expect([res1.status, res2.status].sort()).toEqual([200, 409]);

      const successRes = res1.status === 200 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;
      const winningWorkerId = res1.status === 200 ? worker1Id : worker2Id;

      expect(successRes.body.job.status).toBe('accepted');
      expect(successRes.body.job.worker_id).toBe(winningWorkerId);
      expect(conflictRes.body.error).toMatch(/already been chosen|no longer available/i);

      const dbCheck = await query('SELECT status, worker_id, accepted_at FROM jobs WHERE id = $1', [targetJobId]);
      expect(dbCheck.rows[0].status).toBe('accepted');
      expect(dbCheck.rows[0].worker_id).toBe(winningWorkerId);
      expect(dbCheck.rows[0].accepted_at).not.toBeNull();

      const accepted = await query(
        `SELECT COUNT(*)::int AS n FROM job_offers WHERE job_id = $1 AND status = 'accepted'`,
        [targetJobId]
      );
      expect(accepted.rows[0].n).toBe(1);
    });
  });

  describe('Nearby search & location privacy', () => {
    let nearJobId: string;
    let farJobId: string;

    beforeAll(async () => {
      // Harare (Avondale) and Bulawayo, roughly 365 km apart
      const near = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({ title: 'Nearby Geo Job', category: 'gardening', location_text: 'Avondale', latitude: -17.801234, longitude: 31.045678, budget: 20 });
      nearJobId = near.body.job.id;
      const far = await request(app)
        .post('/api/jobs')
        .set('Cookie', posterCookie)
        .send({ title: 'Far Geo Job', category: 'gardening', location_text: 'Bulawayo', latitude: -20.15, longitude: 28.58, budget: 20 });
      farJobId = far.body.job.id;
    });

    it('filters by radius and sorts by distance', async () => {
      const res = await request(app)
        .get('/api/jobs?lat=-17.8252&lng=31.0335&radius_km=25&sort=distance&limit=100')
        .expect(200);
      const ids = res.body.jobs.map((j: { id: string }) => j.id);
      expect(ids).toContain(nearJobId);
      expect(ids).not.toContain(farJobId);

      const near = res.body.jobs.find((j: { id: string }) => j.id === nearJobId);
      expect(near.distance_km).toBeGreaterThan(0);
      expect(near.distance_km).toBeLessThan(10);
    });

    it('returns distance without filtering when no radius is given', async () => {
      const res = await request(app)
        .get('/api/jobs?lat=-17.8252&lng=31.0335&sort=distance&limit=100')
        .expect(200);
      const far = res.body.jobs.find((j: { id: string }) => j.id === farJobId);
      expect(far.distance_km).toBeGreaterThan(300);
    });

    it('shows only an approximate location publicly, and the exact pin to the poster', async () => {
      const publicView = await request(app).get(`/api/jobs/${nearJobId}`).expect(200);
      expect(publicView.body.job.latitude).toBe(-17.8);
      expect(publicView.body.job.longitude).toBe(31.05);
      expect(publicView.body.job.location_precision).toBe('approximate');

      const posterView = await request(app).get(`/api/jobs/${nearJobId}`).set('Cookie', posterCookie).expect(200);
      expect(posterView.body.job.latitude).toBeCloseTo(-17.801234, 6);
      expect(posterView.body.job.location_precision).toBe('exact');
    });

    it('rejects malformed feed queries with 400 instead of a server error', async () => {
      await request(app).get('/api/jobs?status=bogus').expect(400);
      await request(app).get('/api/jobs?lat=-17.8').expect(400);
      await request(app).get('/api/jobs?radius_km=5').expect(400);
    });
  });
});
