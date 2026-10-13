import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import webpush from 'web-push';
import { createApp } from '../app.js';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { sendPush } from '../services/push.service.js';
import { expireStaleJobs, EXPIRED_REASON } from '../services/expiry.service.js';
import { hireWorker } from './helpers.js';

const app = createApp();

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('plugy_token='))!.split(';')[0];

const register = async (name: string, email: string, phone?: string) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'Password123!', ...(phone ? { phone } : {}) });
  return { id: res.body.user.id as string, cookie: cookieOf(res), email };
};

describe('Real-world operations: scheduling, expiry, push, password reset, moderation', () => {
  const stamp = Date.now();
  const rand = () => String(Math.floor(1000000 + Math.random() * 8999999));
  const userIds: string[] = [];
  let poster: { id: string; cookie: string; email: string };
  let worker: { id: string; cookie: string; email: string };

  beforeAll(async () => {
    poster = await register('Ops Poster', `ops_poster_${stamp}@plugy.dev`);
    worker = await register('Ops Worker', `ops_worker_${stamp}@plugy.dev`);
    userIds.push(poster.id, worker.id);
  });

  afterAll(async () => {
    await query('DELETE FROM jobs WHERE poster_id = ANY($1)', [userIds]);
    await query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  });

  describe('Requested time and payment method', () => {
    it('stores a scheduled time and payment method, defaulting to ASAP and cash', async () => {
      const when = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
      const scheduled = await request(app)
        .post('/api/jobs')
        .set('Cookie', poster.cookie)
        .send({ title: 'Scheduled clean', category: 'cleaning', budget: 20, scheduled_for: when, payment_method: 'mobile_money' })
        .expect(201);
      expect(new Date(scheduled.body.job.scheduled_for).toISOString()).toBe(when);
      expect(scheduled.body.job.payment_method).toBe('mobile_money');

      const asap = await request(app)
        .post('/api/jobs')
        .set('Cookie', poster.cookie)
        .send({ title: 'ASAP clean', category: 'cleaning', budget: 20 })
        .expect(201);
      expect(asap.body.job.scheduled_for).toBeNull();
      expect(asap.body.job.payment_method).toBe('cash');
    });

    it('rejects past times, far-future times and unknown payment methods', async () => {
      const send = (extra: Record<string, unknown>) =>
        request(app).post('/api/jobs').set('Cookie', poster.cookie).send({ title: 'Bad job', category: 'cleaning', ...extra });
      await send({ scheduled_for: new Date(Date.now() - 3600_000).toISOString() }).expect(400);
      await send({ scheduled_for: new Date(Date.now() + 90 * 86400_000).toISOString() }).expect(400);
      await send({ payment_method: 'bitcoin' }).expect(400);
    });
  });

  describe('Expiry of requests nobody was hired for', () => {
    it('expires stale ASAP and past scheduled requests, and closes their offers', async () => {
      const stale = await request(app).post('/api/jobs').set('Cookie', poster.cookie).send({ title: 'Stale ASAP', category: 'ironing', budget: 10 });
      const missed = await request(app)
        .post('/api/jobs')
        .set('Cookie', poster.cookie)
        .send({ title: 'Missed slot', category: 'ironing', budget: 10, scheduled_for: new Date(Date.now() + 3600_000).toISOString() });
      const fresh = await request(app).post('/api/jobs').set('Cookie', poster.cookie).send({ title: 'Fresh', category: 'ironing', budget: 10 });

      await request(app).post(`/api/jobs/${stale.body.job.id}/offers`).set('Cookie', worker.cookie).send({ price: 10 }).expect(201);

      await query(`UPDATE jobs SET created_at = NOW() - make_interval(hours => $2) WHERE id = $1`, [stale.body.job.id, env.JOB_OPEN_HOURS + 1]);
      await query(`UPDATE jobs SET scheduled_for = NOW() - INTERVAL '3 hours' WHERE id = $1`, [missed.body.job.id]);

      expect(await expireStaleJobs()).toBeGreaterThanOrEqual(2);

      const { rows } = await query('SELECT id, status, cancel_reason FROM jobs WHERE id = ANY($1)', [
        [stale.body.job.id, missed.body.job.id, fresh.body.job.id],
      ]);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[stale.body.job.id]).toMatchObject({ status: 'cancelled', cancel_reason: EXPIRED_REASON });
      expect(byId[missed.body.job.id]).toMatchObject({ status: 'cancelled', cancel_reason: EXPIRED_REASON });
      expect(byId[fresh.body.job.id].status).toBe('open');

      const offer = await query('SELECT status FROM job_offers WHERE job_id = $1', [stale.body.job.id]);
      expect(offer.rows[0].status).toBe('not_selected');
    });
  });

  describe('Web Push', () => {
    const endpoint = `https://push.example.test/send/${stamp}`;

    afterAll(() => {
      vi.restoreAllMocks();
    });

    it('publishes the public key and accepts only well-formed HTTPS subscriptions', async () => {
      const config = await request(app).get('/api/config').expect(200);
      expect(config.body.pushPublicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
      expect(config.body.emergencyNumber).toBeTruthy();

      await request(app).post('/api/push/subscribe').send({}).expect(401);
      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', worker.cookie)
        .send({ endpoint: 'http://insecure.example/push', keys: { p256dh: 'abcdefghij', auth: 'abcdefghij' } })
        .expect(400);
    });

    it('sends an encrypted, VAPID-signed push to each device and prunes expired ones', async () => {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', worker.cookie)
        .send({ endpoint, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') } })
        .expect(201);

      // Build the real encrypted request (headers + body) but don't hit the network
      const requests: ReturnType<typeof webpush.generateRequestDetails>[] = [];
      const spy = vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub, payload, options) => {
        requests.push(webpush.generateRequestDetails(sub, payload ?? undefined, options));
        return { statusCode: 201, body: '', headers: {} };
      });

      const delivered = await sendPush(worker.id, { title: "You're hired!", body: 'Test', url: '/?job=x', tag: 't' });
      expect(delivered).toBe(1);
      expect(requests[0].endpoint).toBe(endpoint);
      expect(requests[0].headers['Content-Encoding']).toBe('aes128gcm');
      expect(String(requests[0].headers.Authorization)).toMatch(/^vapid t=.+, k=.+/);
      expect(requests[0].headers.Urgency).toBe('high');
      expect((requests[0].body as Buffer).length).toBeGreaterThan(0);

      // The push service reports the device is gone: the subscription is removed
      spy.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
      expect(await sendPush(worker.id, { title: 'x', body: 'y', url: '/', tag: 't' })).toBe(0);
      const left = await query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
      expect(left.rows).toHaveLength(0);
    });
  });

  describe('Password reset by SMS code', () => {
    it('resets the password, signs in, and signs out sessions issued before the reset', async () => {
      const phone = `+1555${rand()}`;
      const user = await register('Reset Person', `reset_${stamp}@plugy.dev`, phone);
      userIds.push(user.id);
      await request(app).get('/api/auth/me').set('Cookie', user.cookie).expect(200);

      // Unknown numbers get the same answer and no code
      const unknown = await request(app).post('/api/auth/password-reset/request').send({ phone: `+1555${rand()}` }).expect(200);
      expect(unknown.body.devOtp).toBeUndefined();

      const requested = await request(app).post('/api/auth/password-reset/request').send({ phone }).expect(200);
      expect(requested.body.devOtp).toMatch(/^\d{6}$/);

      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ phone, otp: requested.body.devOtp === '000000' ? '111111' : '000000', password: 'NewPassword456!' })
        .expect(400);

      await new Promise((r) => setTimeout(r, 1100)); // tokens carry second-precision issue times
      const confirmed = await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ phone, otp: requested.body.devOtp, password: 'NewPassword456!' })
        .expect(200);

      await request(app).get('/api/auth/me').set('Cookie', cookieOf(confirmed)).expect(200);
      const old = await request(app).get('/api/auth/me').set('Cookie', user.cookie).expect(401);
      expect(old.body.error).toMatch(/password was changed/i);

      await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(401);
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPassword456!' }).expect(200);
    });
  });

  describe('Moderation', () => {
    let admin: { id: string; cookie: string; email: string };
    let offender: { id: string; cookie: string; email: string };

    beforeAll(async () => {
      admin = await register('Ops Admin', `ops_admin_${stamp}@plugy.dev`);
      offender = await register('Ops Offender', `ops_offender_${stamp}@plugy.dev`);
      userIds.push(admin.id, offender.id);
      env.ADMIN_EMAILS.push(admin.email);
    });

    afterAll(() => {
      env.ADMIN_EMAILS.splice(env.ADMIN_EMAILS.indexOf(admin.email), 1);
    });

    it('only admins can see reports', async () => {
      await request(app).get('/api/admin/reports').set('Cookie', poster.cookie).expect(403);
      const me = await request(app).get('/api/auth/me').set('Cookie', admin.cookie).expect(200);
      expect(me.body.user.is_admin).toBe(true);
    });

    it('suspending a reported user removes them from the market and locks them out', async () => {
      // The offender has an open job and a pending offer on someone else's job
      const ownJob = await request(app).post('/api/jobs').set('Cookie', offender.cookie).send({ title: 'Offender job', category: 'cleaning', budget: 5 });
      const posterJob = await request(app).post('/api/jobs').set('Cookie', poster.cookie).send({ title: 'Poster job', category: 'cleaning', budget: 5 });
      await request(app).post(`/api/jobs/${posterJob.body.job.id}/offers`).set('Cookie', offender.cookie).send({ price: 5 }).expect(201);

      await request(app).post(`/api/users/${offender.id}/report`).set('Cookie', poster.cookie).send({ reason: 'fraud_or_scam', details: 'Asked for payment upfront' }).expect(201);

      const list = await request(app).get('/api/admin/reports').set('Cookie', admin.cookie).expect(200);
      const report = list.body.reports.find((r: { reported_user: { id: string } }) => r.reported_user.id === offender.id);
      expect(report).toMatchObject({ reason: 'fraud_or_scam', status: 'open' });
      expect(report.reported_user.open_reports).toBe(1);

      const resolved = await request(app)
        .post(`/api/admin/reports/${report.id}/resolve`)
        .set('Cookie', admin.cookie)
        .send({ action: 'suspend', note: 'Confirmed scam' })
        .expect(200);
      expect(resolved.body).toMatchObject({ cancelledJobs: 1, withdrawnOffers: 1 });

      const ownJobNow = await query('SELECT status FROM jobs WHERE id = $1', [ownJob.body.job.id]);
      expect(ownJobNow.rows[0].status).toBe('cancelled');
      const offerNow = await query('SELECT status FROM job_offers WHERE worker_id = $1', [offender.id]);
      expect(offerNow.rows[0].status).toBe('withdrawn');

      await request(app).get('/api/auth/me').set('Cookie', offender.cookie).expect(403);
      await request(app).post('/api/auth/login').send({ email: offender.email, password: 'Password123!' }).expect(403);
      await request(app).post(`/api/admin/reports/${report.id}/resolve`).set('Cookie', admin.cookie).send({ action: 'dismiss' }).expect(409);

      await request(app).post(`/api/admin/users/${offender.id}/unsuspend`).set('Cookie', admin.cookie).expect(200);
      await request(app).post('/api/auth/login').send({ email: offender.email, password: 'Password123!' }).expect(200);
    });

    it('a dismissed report leaves the user active', async () => {
      await request(app).post(`/api/users/${worker.id}/report`).set('Cookie', poster.cookie).send({ reason: 'other' }).expect(201);
      const list = await request(app).get('/api/admin/reports').set('Cookie', admin.cookie).expect(200);
      const report = list.body.reports.find((r: { reported_user: { id: string } }) => r.reported_user.id === worker.id);
      await request(app).post(`/api/admin/reports/${report.id}/resolve`).set('Cookie', admin.cookie).send({ action: 'dismiss' }).expect(200);
      await request(app).get('/api/auth/me').set('Cookie', worker.cookie).expect(200);
    });
  });

  describe('Hired worker can still be followed after the schedule change', () => {
    it('hiring works on a scheduled job and keeps the requested time', async () => {
      const when = new Date(Date.now() + 5 * 3600_000).toISOString();
      const job = await request(app)
        .post('/api/jobs')
        .set('Cookie', poster.cookie)
        .send({ title: 'Scheduled hire', category: 'gardening', budget: 30, scheduled_for: when });
      const hired = await hireWorker(app, job.body.job.id, poster.cookie, worker.cookie, 30);
      expect(hired.status).toBe(200);
      expect(new Date(hired.body.job.scheduled_for).toISOString()).toBe(when);
    });
  });
});
