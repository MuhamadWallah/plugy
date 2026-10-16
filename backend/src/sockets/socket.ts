import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env, isOriginAllowed } from '../config/env.js';
import { COOKIE_NAME, isSessionRevoked, verifyToken } from '../config/jwt.js';
import { query } from '../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JoinAck = (result: { ok: boolean; error?: string }) => void;

let io: SocketIOServer | null = null;

/**
 * Extracts the session token from the handshake Cookie header (same httpOnly cookie the REST API uses).
 */
const readSessionToken = (cookieHeader: string | undefined): string | null => {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
};

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin));
      },
      credentials: true,
    },
    // Browsers don't apply CORS to WebSocket upgrades, so check the Origin explicitly as well
    allowRequest: (req, callback) => {
      callback(null, isOriginAllowed(req.headers.origin));
    },
  });

  // Identify the user from the session cookie. Anonymous sockets may still follow the public feed.
  // Revoked sessions (password changed) and suspended accounts are treated as anonymous.
  io.use(async (socket, next) => {
    const token = readSessionToken(socket.handshake.headers.cookie);
    if (token) {
      try {
        const payload = verifyToken(token);
        const { rows } = await query('SELECT password_changed_at, suspended_at, deleted_at FROM users WHERE id = $1', [payload.userId]);
        if (rows.length > 0 && !rows[0].suspended_at && !rows[0].deleted_at && !isSessionRevoked(payload, rows[0].password_changed_at)) {
          socket.data.userId = payload.userId;
        }
      } catch {
        // Invalid/expired token or lookup failure: treat as anonymous
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    // Automatically join the public job feed room
    socket.join('job_feed');

    // Private room for per-user notifications (new offers, offer decisions)
    if (socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
    }

    // Live location from the assigned worker while travelling to / working at a job.
    // Relayed only to the job room (poster + worker); never stored.
    let lastLocationAt = 0;
    let authorizedJob: { jobId: string; until: number } | null = null;

    socket.on('location:update', async (payload: unknown, ack?: JoinAck) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const userId = socket.data.userId as string | undefined;
      const data = (payload ?? {}) as { jobId?: unknown; lat?: unknown; lng?: unknown; accuracy?: unknown };
      const { jobId, lat, lng, accuracy } = data;

      if (!userId) return reply({ ok: false, error: 'Authentication required' });
      if (
        typeof jobId !== 'string' || !UUID_REGEX.test(jobId) ||
        typeof lat !== 'number' || typeof lng !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180
      ) {
        return reply({ ok: false, error: 'Invalid location payload' });
      }

      // Throttle to one update every 2 seconds per connection
      const now = Date.now();
      if (now - lastLocationAt < 2000) return reply({ ok: false, error: 'Too many updates' });
      lastLocationAt = now;

      try {
        // Re-check assignment at most every 30 seconds
        if (!authorizedJob || authorizedJob.jobId !== jobId || authorizedJob.until < now) {
          const { rows } = await query(
            `SELECT 1 FROM jobs WHERE id = $1 AND worker_id = $2 AND status IN ('accepted', 'in_progress')`,
            [jobId, userId]
          );
          if (rows.length === 0) {
            authorizedJob = null;
            return reply({ ok: false, error: 'Forbidden' });
          }
          authorizedJob = { jobId, until: now + 30000 };
        }

        io?.to(`job:${jobId}`).emit('job:location', {
          jobId,
          lat,
          lng,
          accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? Math.round(accuracy) : null,
          at: new Date(now).toISOString(),
        });
        return reply({ ok: true });
      } catch (error) {
        if (!env.isTest) console.error('Socket location:update error:', error);
        return reply({ ok: false, error: 'Internal server error' });
      }
    });

    // Join a specific job's room (chat). Only the poster or assigned worker may join.
    socket.on('join:job', async (jobId: unknown, ack?: JoinAck) => {
      const reply = typeof ack === 'function' ? ack : () => {};

      if (typeof jobId !== 'string' || !UUID_REGEX.test(jobId)) {
        return reply({ ok: false, error: 'Invalid job id' });
      }

      const userId = socket.data.userId as string | undefined;
      if (!userId) {
        return reply({ ok: false, error: 'Authentication required' });
      }

      try {
        const { rows } = await query(
          'SELECT 1 FROM jobs WHERE id = $1 AND (poster_id = $2 OR worker_id = $2)',
          [jobId, userId]
        );
        if (rows.length === 0) {
          return reply({ ok: false, error: 'Forbidden' });
        }
        await socket.join(`job:${jobId}`);
        return reply({ ok: true });
      } catch (error) {
        if (!env.isTest) console.error('Socket join:job error:', error);
        return reply({ ok: false, error: 'Internal server error' });
      }
    });

    // Leave a specific job's room
    socket.on('leave:job', (jobId: string) => {
      if (jobId && typeof jobId === 'string') {
        socket.leave(`job:${jobId}`);
      }
    });

    socket.on('disconnect', () => {
      // client disconnected
    });
  });

  return io;
};

export const getIO = (): SocketIOServer | null => {
  return io;
};

export const broadcastJobCreated = (job: unknown) => {
  if (io) {
    io.to('job_feed').emit('job:created', job);
  }
};

export const broadcastJobAccepted = (data: { jobId: string; job: unknown }) => {
  if (io) {
    io.to('job_feed').emit('job:accepted', data);
  }
};

/** An open job changed (e.g. the poster raised the price) */
export const broadcastJobUpdated = (data: { jobId: string; job: unknown }) => {
  if (io) {
    io.to('job_feed').emit('job:updated', data);
  }
};

/** The assigned worker backed out, so the job is open again */
export const broadcastJobReopened = (data: { jobId: string; job: unknown }) => {
  if (io) {
    io.to('job_feed').emit('job:reopened', data);
  }
};

/** Private event to one user (all of their connected tabs/devices) */
export const notifyUser = (userId: string, event: string, data: unknown) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

/** Disconnects every live connection of a user (e.g. when the account is suspended) */
export const disconnectUser = (userId: string) => {
  io?.in(`user:${userId}`).disconnectSockets(true);
};

export const broadcastJobStatusUpdated = (data: { jobId: string; status: string; job: unknown }) => {
  if (io) {
    io.to('job_feed').emit('job:status_updated', data);
    io.to(`job:${data.jobId}`).emit('job:status_updated', data);
    if (data.status === 'cancelled' || data.status === 'completed') {
      io.to('job_feed').emit('job:accepted', { jobId: data.jobId });
    }
  }
};

export const broadcastJobMessage = (jobId: string, message: unknown) => {
  if (io) {
    io.to(`job:${jobId}`).emit('message:new', message);
  }
};

export const broadcastJobRatingSubmitted = (data: { jobId: string; rating: unknown; ratee: unknown }) => {
  if (io) {
    io.to(`job:${data.jobId}`).emit('job:rated', data);
    io.to('job_feed').emit('job:rated', data);
  }
};


