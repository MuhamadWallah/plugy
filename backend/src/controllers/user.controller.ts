import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { reportSchema } from '../validators/job.validator.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/users/:id
 * Public profile: track record and recent reviews (no contact details).
 */
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profileResult = await query(
      `SELECT u.id, u.name, u.avatar_url, u.rating_avg, u.rating_count, u.phone_verified,
         (u.id_verified_at IS NOT NULL) AS id_verified,
         u.created_at AS member_since,
         (SELECT COUNT(*)::int FROM jobs WHERE worker_id = u.id AND status = 'completed') AS jobs_completed,
         (SELECT COUNT(*)::int FROM jobs WHERE poster_id = u.id) AS jobs_posted,
         COALESCE((SELECT wa.categories FROM worker_availability wa WHERE wa.user_id = u.id), '{}') AS work_categories
       FROM users u
       WHERE u.id = $1`,
      [id]
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reviewsResult = await query(
      `SELECT r.id, r.score, r.comment, r.created_at,
         (r.rater_id = j.poster_id) AS from_customer,
         j.title AS job_title,
         json_build_object('id', ru.id, 'name', ru.name, 'avatar_url', ru.avatar_url) AS rater
       FROM ratings r
       JOIN jobs j ON j.id = r.job_id
       JOIN users ru ON ru.id = r.rater_id
       WHERE r.ratee_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [id]
    );

    return res.status(200).json({
      profile: profileResult.rows[0],
      reviews: reviewsResult.rows,
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching profile' });
  }
};

/**
 * POST /api/users/:id/report
 * Safety report about another user (stored for moderator review).
 */
export const reportUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: reportedUserId } = req.params;
    if (!UUID_REGEX.test(reportedUserId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (reportedUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    const parsed = reportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Please choose a reason for the report',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const { reason, details, job_id } = parsed.data;

    const userCheck = await query('SELECT id FROM users WHERE id = $1', [reportedUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // One open report per reporter/user pair per day is enough for review
    const recent = await query(
      `SELECT 1 FROM user_reports
       WHERE reporter_id = $1 AND reported_user_id = $2 AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.user.id, reportedUserId]
    );
    if (recent.rows.length > 0) {
      return res.status(409).json({ error: 'You already reported this user recently. Our team will review it.' });
    }

    const inserted = await query(
      `INSERT INTO user_reports (reporter_id, reported_user_id, job_id, reason, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [req.user.id, reportedUserId, job_id ?? null, reason, details || null]
    );

    console.warn(
      `[SAFETY REPORT] ${inserted.rows[0].id}: user ${reportedUserId} reported for "${reason}"` +
        (job_id ? ` on job ${job_id}` : '')
    );

    return res.status(201).json({ message: 'Report received. Thank you for keeping Plugy safe.' });
  } catch (error) {
    console.error('Report user error:', error);
    return res.status(500).json({ error: 'Internal server error while submitting report' });
  }
};
