import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app.js';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { alertNearbyWorkers } from '../services/dispatch.service.js';

const app = createApp();

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('plugy_token='))!.split(';')[0];

const register = async (name: string, email: string) => {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'Password123!' });
  return { id: res.body.user.id as string, cookie: cookieOf(res), email };
};

// A small real JPEG carrying EXIF metadata, like a phone photo
const phoneJpeg = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 30, g: 160, b: 120 } } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Phone Owner', Copyright: 'Private', ImageDescription: 'Home address photo' } })
    .toBuffer();

describe('Photos and ID verification', () => {
  const stamp = Date.now();
  const ids: string[] = [];
  let poster: { id: string; cookie: string; email: string };
  let worker: { id: string; cookie: string; email: string };
  let admin: { id: string; cookie: string; email: string };
  let jpeg: Buffer;

  beforeAll(async () => {
    jpeg = await phoneJpeg();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    poster = await register('Media Poster', `media_poster_${stamp}@plugy.dev`);
    worker = await register('Media Worker', `media_worker_${stamp}@plugy.dev`);
    admin = await register('Media Admin', `media_admin_${stamp}@plugy.dev`);
    ids.push(poster.id, worker.id, admin.id);
    env.ADMIN_EMAILS.push(admin.email);
  });

  afterAll(async () => {
    env.ADMIN_EMAILS.splice(env.ADMIN_EMAILS.indexOf(admin.email), 1);
    await query('DELETE FROM jobs WHERE poster_id = ANY($1)', [ids]);
    await query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  });

  describe('Profile photo', () => {
    it('re-encodes the upload as a square WebP without metadata and serves it publicly', async () => {
      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Cookie', worker.cookie)
        .attach('photo', jpeg, { filename: 'me.jpg', contentType: 'image/jpeg' })
        .expect(200);
      expect(res.body.avatar_url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);

      const served = await request(app).get(res.body.avatar_url).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(served.headers['content-type']).toBe('image/webp');
      expect(served.headers['cache-control']).toMatch(/immutable/);

      const meta = await sharp(served.body as Buffer).metadata();
      expect(meta.format).toBe('webp');
      expect([meta.width, meta.height]).toEqual([512, 512]);
      expect(meta.exif).toBeUndefined();

      const profile = await request(app).get(`/api/users/${worker.id}`).expect(200);
      expect(profile.body.profile.avatar_url).toBe(res.body.avatar_url);
    });

    it('rejects files that are not images, whatever their name', async () => {
      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Cookie', worker.cookie)
        .attach('photo', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.jpg', contentType: 'image/jpeg' })
        .expect(400);
      expect(res.body.error).toMatch(/upload a photo/i);
      await request(app).post('/api/users/me/avatar').attach('photo', jpeg, 'me.jpg').expect(401);
    });

    it('replacing the photo deletes the old file', async () => {
      const first = await request(app).post('/api/users/me/avatar').set('Cookie', poster.cookie).attach('photo', jpeg, 'a.jpg').expect(200);
      await request(app).post('/api/users/me/avatar').set('Cookie', poster.cookie).attach('photo', jpeg, 'b.jpg').expect(200);
      await request(app).get(first.body.avatar_url).expect(404);
    });
  });

  describe('Job photos', () => {
    let jobId: string;

    beforeAll(async () => {
      const job = await request(app).post('/api/jobs').set('Cookie', poster.cookie).send({ title: 'Photo job', category: 'cleaning', budget: 15 });
      jobId = job.body.job.id;
    });

    it('lets only the poster add up to 4 photos, shown with the job', async () => {
      await request(app).post(`/api/jobs/${jobId}/photos`).set('Cookie', worker.cookie).attach('photo', jpeg, 'x.jpg').expect(403);
      for (let i = 0; i < 4; i++) {
        const res = await request(app).post(`/api/jobs/${jobId}/photos`).set('Cookie', poster.cookie).attach('photo', jpeg, `p${i}.jpg`).expect(201);
        expect(res.body.photo).toMatchObject({ width: 900, height: 600 });
      }
      await request(app).post(`/api/jobs/${jobId}/photos`).set('Cookie', poster.cookie).attach('photo', jpeg, 'p5.jpg').expect(409);

      const view = await request(app).get(`/api/jobs/${jobId}`).expect(200);
      expect(view.body.job.photos).toHaveLength(4);
      await request(app).get(view.body.job.photos[0].url).expect(200);
    });

    it('removes a photo', async () => {
      const view = await request(app).get(`/api/jobs/${jobId}`).expect(200);
      const photo = view.body.job.photos[3];
      await request(app).delete(`/api/jobs/${jobId}/photos/${photo.id}`).set('Cookie', poster.cookie).expect(200);
      await request(app).get(photo.url).expect(404);
      const after = await request(app).get(`/api/jobs/${jobId}`).expect(200);
      expect(after.body.job.photos).toHaveLength(3);
    });
  });

  describe('ID verification for childcare and care work', () => {
    let babysittingJob: string;
    let verificationId: string;

    beforeAll(async () => {
      const job = await request(app)
        .post('/api/jobs')
        .set('Cookie', poster.cookie)
        .send({ title: 'Evening babysitting', category: 'babysitting', budget: 30, location_text: 'Avondale', latitude: -17.7945, longitude: 31.0412 });
      babysittingJob = job.body.job.id;
    });

    it('blocks offers on babysitting jobs from workers without a verified ID', async () => {
      const res = await request(app).post(`/api/jobs/${babysittingJob}/offers`).set('Cookie', worker.cookie).send({ price: 30 }).expect(403);
      expect(res.body.code).toBe('id_verification_required');
    });

    it('does not alert unverified online workers about babysitting jobs', async () => {
      await request(app)
        .put('/api/workers/me/availability')
        .set('Cookie', worker.cookie)
        .send({ available: true, categories: ['babysitting'], latitude: -17.8252, longitude: 31.0335, radius_km: 10 })
        .expect(200);
      expect(await alertNearbyWorkers(babysittingJob)).not.toContain(worker.id);
    });

    it('accepts one ID submission at a time and keeps the files private', async () => {
      await request(app)
        .post('/api/users/me/verification')
        .set('Cookie', worker.cookie)
        .field('document_type', 'national_id')
        .attach('document', jpeg, 'id.jpg')
        .expect(400); // selfie missing

      await request(app)
        .post('/api/users/me/verification')
        .set('Cookie', worker.cookie)
        .field('document_type', 'national_id')
        .attach('document', jpeg, 'id.jpg')
        .attach('selfie', jpeg, 'selfie.jpg')
        .expect(201);

      await request(app)
        .post('/api/users/me/verification')
        .set('Cookie', worker.cookie)
        .field('document_type', 'passport')
        .attach('document', jpeg, 'id.jpg')
        .attach('selfie', jpeg, 'selfie.jpg')
        .expect(409);

      const mine = await request(app).get('/api/users/me/verification').set('Cookie', worker.cookie).expect(200);
      expect(mine.body.verification).toMatchObject({ status: 'pending', id_verified: false, document_type: 'national_id' });

      // Only admins can see submissions and their files
      await request(app).get('/api/admin/verifications').set('Cookie', worker.cookie).expect(403);
      const list = await request(app).get('/api/admin/verifications').set('Cookie', admin.cookie).expect(200);
      const entry = list.body.verifications.find((v: { user: { id: string } }) => v.user.id === worker.id);
      expect(entry).toBeDefined();
      verificationId = entry.id;

      await request(app).get(`/api/admin/verifications/${verificationId}/files/document`).set('Cookie', worker.cookie).expect(403);
      const file = await request(app).get(`/api/admin/verifications/${verificationId}/files/selfie`).set('Cookie', admin.cookie).expect(200);
      expect(file.headers['content-type']).toBe('image/webp');
      expect(file.headers['cache-control']).toMatch(/no-store/);

      // The private file is not reachable through the public uploads path
      const row = await query('SELECT document_file FROM id_verifications WHERE id = $1', [verificationId]);
      expect(fs.existsSync(path.resolve(env.UPLOAD_DIR, 'private', row.rows[0].document_file))).toBe(true);
      await request(app).get(`/uploads/${row.rows[0].document_file}`).expect(404);
    });

    it('a rejection needs a reason; approval adds the badge and unlocks babysitting offers and alerts', async () => {
      await request(app).post(`/api/admin/verifications/${verificationId}/review`).set('Cookie', admin.cookie).send({ decision: 'reject' }).expect(400);
      await request(app).post(`/api/admin/verifications/${verificationId}/review`).set('Cookie', admin.cookie).send({ decision: 'approve' }).expect(200);
      await request(app).post(`/api/admin/verifications/${verificationId}/review`).set('Cookie', admin.cookie).send({ decision: 'approve' }).expect(409);

      const profile = await request(app).get(`/api/users/${worker.id}`).expect(200);
      expect(profile.body.profile.id_verified).toBe(true);
      const me = await request(app).get('/api/auth/me').set('Cookie', worker.cookie).expect(200);
      expect(me.body.user.id_verified).toBe(true);

      expect(await alertNearbyWorkers(babysittingJob)).toContain(worker.id);
      const offer = await request(app).post(`/api/jobs/${babysittingJob}/offers`).set('Cookie', worker.cookie).send({ price: 30 }).expect(201);
      expect(offer.body.offer.worker.id_verified).toBe(true);

      const config = await request(app).get('/api/config').expect(200);
      expect(config.body.idRequiredCategories).toEqual(expect.arrayContaining(['babysitting', 'care_taking']));
    });
  });
});
