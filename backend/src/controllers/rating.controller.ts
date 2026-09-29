import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { broadcastJobRatingSubmitted } from '../sockets/socket.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/jobs/:id/rate
 * Allows a poster or worker to rate the other party (score 1-5, optional comment).
 * Restricted to:
 * - Completed jobs only (can't rate before completion).
 * - Poster or assigned worker only.
 * - Cannot rate yourself.
 * - Only once per job per rater (can't rate twice).
 */
export const rateJob = async (req: Request, res: Response) => {
  try {
    const { id: jobId } = req.params;

    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;

    // Validate score (must be integer 1 to 5)
    const rawScore = req.body?.score;
    const score = Number(rawScore);
    if (rawScore === undefined || rawScore === null || !Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'Score must be an integer between 1 and 5' });
    }

    // Validate optional comment
    let comment = req.body?.comment;
    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string') {
        return res.status(400).json({ error: 'Comment must be a text string' });
      }
      comment = comment.trim();
      if (comment.length > 1000) {
        return res.status(400).json({ error: 'Comment cannot exceed 1000 characters' });
      }
      if (comment.length === 0) {
        comment = null;
      }
    } else {
      comment = null;
    }

    // Fetch the job
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

    // Only poster or worker can rate
    if (!isPoster && !isWorker) {
      return res.status(403).json({
        error: 'Only the poster or worker can submit a rating for this job',
      });
    }

    // Can only rate once the job is "completed"
    if (job.status !== 'completed') {
      return res.status(400).json({
        error: 'Cannot rate a job before it is completed',
      });
    }

    // Determine the party being rated (the other party)
    const rateeId = isPoster ? job.worker_id : job.poster_id;

    if (!rateeId) {
      return res.status(400).json({
        error: 'Cannot rate a job without an assigned worker',
      });
    }

    // Can't rate yourself
    if (currentUserId === rateeId) {
      return res.status(400).json({
        error: 'Cannot rate yourself',
      });
    }

    // Can only rate once per job per rater
    const existingRating = await query(
      `SELECT id FROM ratings WHERE job_id = $1 AND rater_id = $2`,
      [jobId, currentUserId]
    );

    if (existingRating.rows.length > 0) {
      return res.status(400).json({
        error: 'You have already rated this job',
      });
    }

    // Insert the rating record
    // PostgreSQL trigger `trg_after_rating_insert` will automatically update ratee's rating_avg and rating_count
    const insertResult = await query(
      `INSERT INTO ratings (job_id, rater_id, ratee_id, score, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, job_id, rater_id, ratee_id, score, comment, created_at`,
      [jobId, currentUserId, rateeId, score, comment]
    );

    const insertedRating = insertResult.rows[0];

    // Fetch the updated ratee details
    const rateeResult = await query(
      `SELECT id, name, avatar_url, rating_avg, rating_count FROM users WHERE id = $1`,
      [rateeId]
    );
    const updatedRatee = rateeResult.rows[0];

    // Realtime notification over WebSockets
    broadcastJobRatingSubmitted({
      jobId,
      rating: insertedRating,
      ratee: updatedRatee,
    });

    return res.status(201).json({
      message: 'Rating submitted successfully',
      rating: insertedRating,
      ratee: updatedRatee,
    });
  } catch (error) {
    console.error('Submit rating error:', error);
    return res.status(500).json({ error: 'Internal server error while submitting rating' });
  }
};

/**
 * GET /api/jobs/:id/ratings
 * Retrieves all ratings submitted for a given job.
 */
export const getJobRatings = async (req: Request, res: Response) => {
  try {
    const { id: jobId } = req.params;

    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const ratingsResult = await query(
      `SELECT 
         r.id, r.job_id, r.rater_id, r.ratee_id, r.score, r.comment, r.created_at,
         json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url) AS rater,
         json_build_object('id', ru.id, 'name', ru.name, 'avatar_url', ru.avatar_url) AS ratee
       FROM ratings r
       JOIN users u ON r.rater_id = u.id
       JOIN users ru ON r.ratee_id = ru.id
       WHERE r.job_id = $1
       ORDER BY r.created_at ASC`,
      [jobId]
    );

    return res.status(200).json({
      ratings: ratingsResult.rows,
    });
  } catch (error) {
    console.error('Get job ratings error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching ratings' });
  }
};
