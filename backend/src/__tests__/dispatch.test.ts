import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import webpush from 'web-push';
import { createApp } from '../app.js';
import { query } from '../config/db.js';
import { alertNearbyWorkers } from '../services/dispatch.service.js';
import { formatMoney } from '../utils/money.js';

const app = createApp();

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('plugy_token='))!.split(';')[0];

const register = async (name: string, email: string) => {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'Password123!' });
  return { id: res.body.user.id as string, cookie: cookieOf(res) };
};

// Harare: job in Avondale; "near" workers ~3 km away, "far" worker in Bulawayo
const JOB_AT = { latitude: -17.7945, longitude: 31.0412 };
const NEAR = { latitude: -17.8252, longitude: 31.0335 };
const FAR = { latitude: -20.15, longitude: 28.58 };

describe('Worker online mode and nearby job alerts', () => {
  const stamp = Date.now();
  const ids: string[] = [];
  let poster: { id: string; cookie: string };
  let cleanerNear: { id: string; cookie: string };
  let gardenerNear: { id: string; cookie: string };
  let cleanerFar: { id: string; cookie: string };
  let cleanerOffline: { id: string; cookie: string };
  let cleanerShortRadius: { id: string; cookie: string };

  const goOnline = (cookie: string, body: Record<string, unknown>) =>
    request(app).put('/api/workers/me/availability').set('Cookie', cookie).send({ available: true, radius_km: 10, ...body });

  const postJob = async (category: string, at = JOB_AT) => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', poster.cookie)
      .send({ title: `Dispatch ${category}`, category, budget: 25, location_text: 'Avondale, Harare', ...at });
    return res.body.job.id as string;
  };

  beforeAll(async () => {
    poster = await register('Dispatch Poster', `dsp_poster_${stamp}@plugy.dev`);
    cleanerNear = await register('Cleaner Near', `dsp_cn_${stamp}@plugy.dev`);
    gardenerNear = await register('Gardener Near', `dsp_gn_${stamp}@plugy.dev`);
    cleanerFar = await register('Cleaner Far', `dsp_cf_${stamp}@plugy.dev`);
    cleanerOffline = await register('Cleaner Offline', `dsp_co_${stamp}@plugy.dev`);
    cleanerShortRadius = await register('Cleaner Short Radius', `dsp_cs_${stamp}@plugy.dev`);
    ids.push(poster.id, cleanerNear.id, gardenerNear.id, cleanerFar.id, cleanerOffline.id, cleanerShortRadius.id);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await query('DELETE FROM jobs WHERE poster_id = ANY($1)', [ids]);
    await query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  });

  describe('Going online', () => {
    it('requires a location and at least one known kind of work', async () => {
      await request(app).put('/api/workers/me/availability').send({ available: true }).expect(401);
      const noCats = await goOnline(cleanerNear.cookie, { categories: [], ...NEAR }).expect(400);
      expect(noCats.body.error).toMatch(/at least one kind of work/i);
      const noLoc = await goOnline(cleanerNear.cookie, { categories: ['cleaning'] }).expect(400);
      expect(noLoc.body.error).toMatch(/location/i);
      await goOnline(cleanerNear.cookie, { categories: ['plumbing'], ...NEAR }).expect(400);
    });

    it('goes online for a limited time and reports it back without exposing coordinates', async () => {
      const res = await goOnline(cleanerNear.cookie, { categories: ['cleaning', 'ironing'], ...NEAR, location_label: 'Milton Park', hours: 8 }).expect(200);
      expect(res.body.availability).toMatchObject({ available: true, categories: ['cleaning', 'ironing'], radius_km: 10, has_location: true });
      expect(res.body.availability).not.toHaveProperty('latitude');
      const until = new Date(res.body.availability.available_until).getTime();
      expect(until).toBeGreaterThan(Date.now() + 7.9 * 3600_000);
      expect(until).toBeLessThan(Date.now() + 8.1 * 3600_000);

      const me = await request(app).get('/api/workers/me/availability').set('Cookie', cleanerNear.cookie).expect(200);
      expect(me.body.availability.available).toBe(true);

      const profile = await request(app).get(`/api/users/${cleanerNear.id}`).expect(200);
      expect(profile.body.profile.work_categories).toEqual(['cleaning', 'ironing']);
    });
  });

  describe('Who gets alerted about a new job', () => {
    beforeAll(async () => {
      await goOnline(gardenerNear.cookie, { categories: ['gardening'], ...NEAR });
      await goOnline(cleanerFar.cookie, { categories: ['cleaning'], ...FAR, radius_km: 50 });
      await goOnline(cleanerOffline.cookie, { categories: ['cleaning'], ...NEAR });
      await request(app).put('/api/workers/me/availability').set('Cookie', cleanerOffline.cookie).send({ available: false }).expect(200);
      await goOnline(cleanerShortRadius.cookie, { categories: ['cleaning'], ...NEAR, radius_km: 1 });
      // The poster also works as a cleaner nearby, but must never be alerted about their own job
      await goOnline(poster.cookie, { categories: ['cleaning'], ...NEAR });
    });

    it('alerts only online workers who do this work and are within their distance', async () => {
      const jobId = await postJob('cleaning');
      const alerted = await alertNearbyWorkers(jobId);
      expect(alerted).toContain(cleanerNear.id);
      expect(alerted).not.toContain(gardenerNear.id); // different work
      expect(alerted).not.toContain(cleanerFar.id); // ~365 km away
      expect(alerted).not.toContain(cleanerOffline.id); // went offline
      expect(alerted).not.toContain(cleanerShortRadius.id); // ~3 km away, 1 km radius
      expect(alerted).not.toContain(poster.id); // own job
    });

    it('stops alerting once the time window has passed', async () => {
      await query(`UPDATE worker_availability SET available_until = NOW() - INTERVAL '1 minute' WHERE user_id = $1`, [gardenerNear.id]);
      const jobId = await postJob('gardening');
      expect(await alertNearbyWorkers(jobId)).not.toContain(gardenerNear.id);
      const me = await request(app).get('/api/workers/me/availability').set('Cookie', gardenerNear.cookie).expect(200);
      expect(me.body.availability.available).toBe(false);
    });

    it('skips workers who already made an offer (e.g. when a job reopens)', async () => {
      const jobId = await postJob('cleaning');
      await request(app).post(`/api/jobs/${jobId}/offers`).set('Cookie', cleanerNear.cookie).send({ price: 25 }).expect(201);
      expect(await alertNearbyWorkers(jobId)).not.toContain(cleanerNear.id);
    });

    it('sends the alert as a push notification to the worker\'s devices', async () => {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', cleanerNear.cookie)
        .send({ endpoint: `https://push.example.test/dispatch/${stamp}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') } })
        .expect(201);

      const pushed: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
      vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub, payload) => {
        pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(String(payload)) });
        return { statusCode: 201, body: '', headers: {} };
      });

      const jobId = await postJob('ironing');
      await alertNearbyWorkers(jobId);
      await new Promise((r) => setTimeout(r, 200)); // push is sent in the background

      const mine = pushed.find((p) => p.endpoint.endsWith(`/dispatch/${stamp}`));
      expect(mine?.payload.title).toBe(`New ironing job · ${formatMoney(25)}`);
      expect(mine?.payload.body).toMatch(/km away|under 1 km away/);
      expect(mine?.payload.url).toBe(`/?job=${jobId}`);
    });
  });
});
