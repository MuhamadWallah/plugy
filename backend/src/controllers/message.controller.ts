import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { broadcastJobMessage } from '../sockets/socket.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/jobs/:id/messages
 * Retrieves all messages for a specific job in chronological order.
 * Restricted to the job poster or assigned worker.
 */
export const getJobMessages = async (req: Request, res: Response) => {
  try {
    const { id: jobId } = req.params;

    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;

    // Verify job exists and check access permissions
    const jobResult = await query(
      `SELECT id, poster_id, worker_id, status FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];
    const isPoster = job.poster_id === currentUserId;
    const isWorker = job.worker_id === currentUserId;

    if (!isPoster && !isWorker) {
      return res.status(403).json({
        error: 'Forbidden: Only the poster or assigned worker can access messages for this job',
      });
    }

    // Fetch chronological messages enriched with sender info
    const messagesResult = await query(
      `SELECT 
         m.id, 
         m.job_id, 
         m.sender_id, 
         m.body, 
         m.created_at,
         json_build_object(
           'id', u.id,
           'name', u.name,
           'avatar_url', u.avatar_url
         ) AS sender
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.job_id = $1
       ORDER BY m.created_at ASC`,
      [jobId]
    );

    return res.status(200).json({
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error('Get job messages error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching messages' });
  }
};

/**
 * POST /api/jobs/:id/messages
 * Sends a message in the job chat.
 * Restricted to the job poster or assigned worker.
 * Broadcasts via Socket.IO to room `job:${jobId}`.
 */
export const sendJobMessage = async (req: Request, res: Response) => {
  try {
    const { id: jobId } = req.params;

    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;

    // Verify job exists and check access permissions
    const jobResult = await query(
      `SELECT id, poster_id, worker_id, status FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];
    const isPoster = job.poster_id === currentUserId;
    const isWorker = job.worker_id === currentUserId;

    if (!isPoster && !isWorker) {
      return res.status(403).json({
        error: 'Forbidden: Only the poster or assigned worker can send messages for this job',
      });
    }

    // Validate body content
    const rawBody = req.body?.body ?? req.body?.content ?? req.body?.message;
    if (!rawBody || typeof rawBody !== 'string' || rawBody.trim().length === 0) {
      return res.status(400).json({ error: 'Message body cannot be empty' });
    }

    const body = rawBody.trim();
    if (body.length > 2000) {
      return res.status(400).json({ error: 'Message body cannot exceed 2000 characters' });
    }

    // Insert message and return with enriched sender details
    const insertResult = await query(
      `WITH inserted AS (
         INSERT INTO messages (job_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, job_id, sender_id, body, created_at
       )
       SELECT 
         i.id, 
         i.job_id, 
         i.sender_id, 
         i.body, 
         i.created_at,
         json_build_object(
           'id', u.id,
           'name', u.name,
           'avatar_url', u.avatar_url
         ) AS sender
       FROM inserted i
       JOIN users u ON i.sender_id = u.id`,
      [jobId, currentUserId, body]
    );

    const enrichedMessage = insertResult.rows[0];

    // Broadcast in realtime to the job's dedicated Socket.IO room
    broadcastJobMessage(jobId, enrichedMessage);

    return res.status(201).json({
      message: enrichedMessage,
    });
  } catch (error) {
    console.error('Send job message error:', error);
    return res.status(500).json({ error: 'Internal server error while sending message' });
  }
};
