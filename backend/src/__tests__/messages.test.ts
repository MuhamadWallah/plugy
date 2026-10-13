import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app.js';
import { query } from '../config/db.js';
import { initSocketServer } from '../sockets/socket.js';
import { hireWorker } from './helpers.js';

const app = createApp();

describe('Job Chat & Messages API (Step 6)', () => {
  const timestamp = Date.now();
  let posterCookie: string;
  let posterId: string;
  let workerCookie: string;
  let workerId: string;
  let bystanderCookie: string;
  let bystanderId: string;
  let jobId: string;

  let server: http.Server;
  let serverPort: number;
  const socketClients: ClientSocket[] = [];

  // Connects a Socket.IO client, optionally authenticated with a session cookie
  const connectSocket = async (cookie?: string): Promise<ClientSocket> => {
    const client = Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });
    socketClients.push(client);
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));
    return client;
  };

  const joinJobRoom = (client: ClientSocket, id: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => client.emit('join:job', id, resolve));

  beforeAll(async () => {
    // Start HTTP & Socket.IO server on dynamic port
    server = http.createServer(app);
    initSocketServer(server);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    // 1. Poster
    const posterRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Chat Poster',
        email: `chat_poster_${timestamp}@plugy.dev`,
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
        name: 'Chat Worker',
        email: `chat_worker_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    workerId = workerRes.body.user.id;
    workerCookie = (workerRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 3. Bystander (third party user)
    const bystanderRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Chat Bystander',
        email: `chat_bystander_${timestamp}@plugy.dev`,
        password: 'Password123!',
      });
    bystanderId = bystanderRes.body.user.id;
    bystanderCookie = (bystanderRes.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('plugy_token='))!
      .split(';')[0];

    // 4. Create an open job by Poster
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Cookie', posterCookie)
      .send({
        title: 'Chat Test Gardening Job',
        category: 'gardening',
        description: 'Need help trimming bushes and weeding flowerbeds',
        location_text: 'Berlin Mitte, Alexanderplatz',
        budget: 45.0,
      });
    jobId = jobRes.body.job.id;

    // 5. Worker accepts the job
    await hireWorker(app, jobId, posterCookie, workerCookie);
  });

  afterAll(async () => {
    socketClients.forEach((client) => client.disconnect());
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (jobId) {
      await query('DELETE FROM messages WHERE job_id = $1', [jobId]);
      await query('DELETE FROM jobs WHERE id = $1', [jobId]);
    }
    await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [posterId, workerId, bystanderId]);
  });

  describe('Authorization: 403 Forbidden for Third-Party Users', () => {
    it('bystander (third user) gets 403 when trying to READ messages', async () => {
      const res = await request(app)
        .get(`/api/jobs/${jobId}/messages`)
        .set('Cookie', bystanderCookie);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|Only the poster or assigned worker/i);
    });

    it('bystander (third user) gets 403 when trying to SEND a message', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', bystanderCookie)
        .send({ body: 'Hey, can I join or read this chat?' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|Only the poster or assigned worker/i);
    });

    it('unauthenticated user gets 401 when trying to read or send messages', async () => {
      const getRes = await request(app).get(`/api/jobs/${jobId}/messages`);
      expect(getRes.status).toBe(401);

      const postRes = await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .send({ body: 'Unauthenticated message attempt' });
      expect(postRes.status).toBe(401);
    });
  });

  describe('Poster and Worker Messaging Flow', () => {
    it('poster can successfully send a message', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', posterCookie)
        .send({ body: 'Hi! Thanks for accepting the job. What time can you arrive?' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.body).toBe('Hi! Thanks for accepting the job. What time can you arrive?');
      expect(res.body.message.job_id).toBe(jobId);
      expect(res.body.message.sender_id).toBe(posterId);
      expect(res.body.message.sender.name).toBe('Chat Poster');
    });

    it('worker can successfully reply with a message', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', workerCookie)
        .send({ body: 'Hello! I can be there at 2:00 PM with all tools ready.' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.body).toBe('Hello! I can be there at 2:00 PM with all tools ready.');
      expect(res.body.message.job_id).toBe(jobId);
      expect(res.body.message.sender_id).toBe(workerId);
      expect(res.body.message.sender.name).toBe('Chat Worker');
    });

    it('poster can read all messages in chronological order', async () => {
      const res = await request(app)
        .get(`/api/jobs/${jobId}/messages`)
        .set('Cookie', posterCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBe(2);
      expect(res.body.messages[0].body).toContain('What time can you arrive?');
      expect(res.body.messages[1].body).toContain('I can be there at 2:00 PM');
      expect(res.body.messages[0].sender_id).toBe(posterId);
      expect(res.body.messages[1].sender_id).toBe(workerId);
    });

    it('worker can read all messages in chronological order', async () => {
      const res = await request(app)
        .get(`/api/jobs/${jobId}/messages`)
        .set('Cookie', workerCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBe(2);
    });
  });

  describe('Realtime WebSocket Delivery Scoped to Job Room', () => {
    it('delivers new messages in realtime over WebSocket to clients in job room', async () => {
      const socketClient = await connectSocket(workerCookie);

      // Join the job's dedicated room
      const joinResult = await joinJobRoom(socketClient, jobId);
      expect(joinResult).toEqual({ ok: true });

      // Listen for message:new
      const messagePromise = new Promise<{ id: string; body: string; job_id: string }>((resolve) => {
        socketClient.on('message:new', (msg: { id: string; body: string; job_id: string }) => {
          resolve(msg);
        });
      });

      // Send a message via POST endpoint
      await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', posterCookie)
        .send({ body: 'Realtime delivery test via WebSocket room!' });

      const received = await messagePromise;
      expect(received).toBeDefined();
      expect(received.body).toBe('Realtime delivery test via WebSocket room!');
      expect(received.job_id).toBe(jobId);
    });

    it('refuses job room access to bystanders and anonymous sockets, so they never receive chat messages', async () => {
      const bystanderSocket = await connectSocket(bystanderCookie);
      const anonymousSocket = await connectSocket();

      expect(await joinJobRoom(bystanderSocket, jobId)).toEqual({ ok: false, error: 'Forbidden' });
      expect(await joinJobRoom(anonymousSocket, jobId)).toEqual({ ok: false, error: 'Authentication required' });

      const leaked: unknown[] = [];
      bystanderSocket.on('message:new', (msg: unknown) => leaked.push(msg));
      anonymousSocket.on('message:new', (msg: unknown) => leaked.push(msg));

      // A participant in the room confirms the message was actually broadcast
      const posterSocket = await connectSocket(posterCookie);
      expect(await joinJobRoom(posterSocket, jobId)).toEqual({ ok: true });
      const delivered = new Promise((resolve) => posterSocket.on('message:new', resolve));

      await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', posterCookie)
        .send({ body: 'Private message for participants only' });

      await delivered;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(leaked).toHaveLength(0);
    });

    it('relays live location from the hired worker to the job room, and refuses anyone else', async () => {
      const posterSocket = await connectSocket(posterCookie);
      expect(await joinJobRoom(posterSocket, jobId)).toEqual({ ok: true });
      const received = new Promise<{ jobId: string; lat: number; lng: number }>((resolve) =>
        posterSocket.on('job:location', resolve)
      );

      const sendLocation = (client: ClientSocket, payload: unknown) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => client.emit('location:update', payload, resolve));

      const bystanderSocket = await connectSocket(bystanderCookie);
      expect(await sendLocation(bystanderSocket, { jobId, lat: -17.8, lng: 31.0 })).toEqual({ ok: false, error: 'Forbidden' });

      const workerSocket = await connectSocket(workerCookie);
      expect(await sendLocation(workerSocket, { jobId, lat: 999, lng: 31.0 })).toEqual({ ok: false, error: 'Invalid location payload' });
      expect(await sendLocation(workerSocket, { jobId, lat: -17.81, lng: 31.04, accuracy: 12.7 })).toEqual({ ok: true });

      const location = await received;
      expect(location).toMatchObject({ jobId, lat: -17.81, lng: 31.04, accuracy: 13 });
    });
  });

  describe('Validation & Edge Cases', () => {
    it('rejects empty message body with 400', async () => {
      const res = await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', posterCookie)
        .send({ body: '    ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot be empty/i);
    });

    it('rejects message body exceeding 2000 characters with 400', async () => {
      const longMessage = 'A'.repeat(2001);
      const res = await request(app)
        .post(`/api/jobs/${jobId}/messages`)
        .set('Cookie', workerCookie)
        .send({ body: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot exceed 2000/i);
    });

    it('returns 404 for non-existent job ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/jobs/${nonExistentId}/messages`)
        .set('Cookie', posterCookie);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });
});
