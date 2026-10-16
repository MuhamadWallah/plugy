import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../app.js';
import { query } from '../config/db.js';
import { hireWorker } from './helpers.js';

const app = createApp();

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('plugy_token='))!.split(';')[0];

const register = async (name: string, email: string) => {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'Password123!' });
  return { id: res.body.user.id as string, cookie: cookieOf(res), email };
};

describe('Account settings, earnings, reliability and account deletion', () => {
  const stamp = Date.now();
  const ids: string[] = [];
  let customer: { id: string; cookie: string; email: string };
  let worker: { id: string; cookie: string; email: string };

  const job = async (title: string, budget = 30) => {
    const res = await request(app).post('/api/jobs').set('Cookie', customer.cookie).send({ title, category: 'cleaning', budget });
    return res.body.job.id as string;
  };
  const completeFor = async (title: string, price: number) => {
    const jobId = await job(title, price);
    await hireWorker(app, jobId, customer.cookie, worker.cookie, price);
    await request(app).post(`/api/jobs/${jobId}/complete`).set('Cookie', customer.cookie).expect(200);
    return jobId;
  };

  beforeAll(async () => {
    customer = await register('Acct Customer', `acct_c_${stamp}@plugy.dev`);
    worker = await register('Acct Worker', `acct_w_${stamp}@plugy.dev`);
    ids.push(customer.id, worker.id);
  });

  afterAll(async () => {
    await query('DELETE FROM jobs WHERE poster_id = ANY($1)', [ids]);
    await query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  });

  it('changes the display name', async () => {
    await request(app).patch('/api/users/me').set('Cookie', worker.cookie).send({ name: 'A' }).expect(400);
    await request(app).patch('/api/users/me').set('Cookie', worker.cookie).send({ name: 'Acct Worker Renamed' }).expect(200);
    const me = await request(app).get('/api/auth/me').set('Cookie', worker.cookie).expect(200);
    expect(me.body.user.name).toBe('Acct Worker Renamed');
  });

  it('changes the password, keeping this device signed in and signing out older sessions', async () => {
    await new Promise((r) => setTimeout(r, 1100)); // older session issued in an earlier second
    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', customer.cookie)
      .send({ current_password: 'wrong', new_password: 'Changed456!' })
      .expect(400);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', customer.cookie)
      .send({ current_password: 'Password123!', new_password: 'Changed456!' })
      .expect(200);

    await request(app).get('/api/auth/me').set('Cookie', customer.cookie).expect(401);
    customer.cookie = cookieOf(res);
    await request(app).get('/api/auth/me').set('Cookie', customer.cookie).expect(200);
    await request(app).post('/api/auth/login').send({ email: customer.email, password: 'Changed456!' }).expect(200);
  });

  it("totals a worker's earnings from completed jobs", async () => {
    await completeFor('Earnings job one', 30);
    await completeFor('Earnings job two', 20.5);
    const res = await request(app).get('/api/workers/me/earnings').set('Cookie', worker.cookie).expect(200);
    expect(Number(res.body.earnings.all_time)).toBe(50.5);
    expect(Number(res.body.earnings.this_month)).toBe(50.5);
    expect(res.body.earnings.jobs_completed).toBe(2);
    expect(res.body.recent[0]).toMatchObject({ title: 'Earnings job two', customer_name: 'Acct Customer' });
  });

  it('counts back-outs on the worker profile and offers (reliability)', async () => {
    const jobId = await job('Backout job');
    await hireWorker(app, jobId, customer.cookie, worker.cookie, 30);
    await request(app).post(`/api/jobs/${jobId}/release`).set('Cookie', worker.cookie).send({ reason: 'Sick' }).expect(200);

    const profile = await request(app).get(`/api/users/${worker.id}`).expect(200);
    expect(profile.body.profile).toMatchObject({ jobs_completed: 2, backouts: 1 });

    const offers = await request(app).get(`/api/jobs/${jobId}/offers`).set('Cookie', customer.cookie).expect(200);
    // The worker's withdrawn offer is hidden; re-offer to see their stats on an offer
    await request(app).post(`/api/jobs/${jobId}/offers`).set('Cookie', worker.cookie).send({ price: 35 }).expect(200);
    const again = await request(app).get(`/api/jobs/${jobId}/offers`).set('Cookie', customer.cookie).expect(200);
    expect(offers.body.offers.length).toBe(0);
    expect(again.body.offers[0].worker).toMatchObject({ jobs_completed: 2, backouts: 1 });
  });

  it('refuses deletion while a job is in progress or without the password', async () => {
    const jobId = await job('Active job');
    await hireWorker(app, jobId, customer.cookie, worker.cookie, 30);
    await request(app).delete('/api/users/me').set('Cookie', worker.cookie).send({ password: 'Password123!' }).expect(409);
    await request(app).post(`/api/jobs/${jobId}/complete`).set('Cookie', customer.cookie).expect(200);
    await request(app).delete('/api/users/me').set('Cookie', worker.cookie).send({ password: 'nope' }).expect(400);
  });

  it('deletes the account: personal data and photos go, other people keep their history anonymously', async () => {
    // Worker has a photo, a review from the customer, an open offer, and leaves a review for the customer
    const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#0f0' } }).jpeg().toBuffer();
    const avatar = await request(app).post('/api/users/me/avatar').set('Cookie', worker.cookie).attach('photo', photo, 'me.jpg').expect(200);
    const doneJob = await completeFor('Reviewed job', 25);
    await request(app).post(`/api/jobs/${doneJob}/rate`).set('Cookie', worker.cookie).send({ score: 5, comment: 'Lovely client' }).expect(201);
    const openJob = await job('Still open');
    await request(app).post(`/api/jobs/${openJob}/offers`).set('Cookie', worker.cookie).send({ price: 30 }).expect(201);

    await request(app).delete('/api/users/me').set('Cookie', worker.cookie).send({ password: 'Password123!' }).expect(200);

    await request(app).get('/api/auth/me').set('Cookie', worker.cookie).expect(401);
    await request(app).post('/api/auth/login').send({ email: worker.email, password: 'Password123!' }).expect(401);
    await request(app).get(avatar.body.avatar_url).expect(404);

    const row = await query('SELECT name, email, phone, avatar_url, deleted_at FROM users WHERE id = $1', [worker.id]);
    expect(row.rows[0]).toMatchObject({ name: 'Deleted user', phone: null, avatar_url: null });
    expect(row.rows[0].email).toMatch(/@deleted\.invalid$/);

    const offer = await query('SELECT status FROM job_offers WHERE job_id = $1 AND worker_id = $2', [openJob, worker.id]);
    expect(offer.rows[0].status).toBe('withdrawn');

    // The customer still sees the review the worker left, under "Deleted user"
    const customerProfile = await request(app).get(`/api/users/${customer.id}`).expect(200);
    const review = customerProfile.body.reviews.find((r: { comment: string }) => r.comment === 'Lovely client');
    expect(review.rater.name).toBe('Deleted user');
  });

  it('publishes the marketplace currency', async () => {
    const config = await request(app).get('/api/config').expect(200);
    expect(config.body.currency).toMatch(/^[A-Z]{3}$/);
  });
});
