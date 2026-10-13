import { Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { fetchJobView } from '../services/jobView.service.js';
import { broadcastJobStatusUpdated, disconnectUser, notifyUser } from '../sockets/socket.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/reports?status=open|resolved|all
 */
export const listReports = async (req: Request, res: Response) => {
  try {
    const status = ['open', 'resolved', 'all'].includes(String(req.query.status)) ? String(req.query.status) : 'open';
    const result = await query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.resolution, r.resolution_note, r.resolved_at,
         json_build_object('id', ru.id, 'name', ru.name, 'email', ru.email) AS reporter,
         json_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
           'suspended_at', u.suspended_at, 'rating_avg', u.rating_avg, 'rating_count', u.rating_count,
           'open_reports', (SELECT COUNT(*)::int FROM user_reports x WHERE x.reported_user_id = u.id AND x.status = 'open'),
           'total_reports', (SELECT COUNT(*)::int FROM user_reports x WHERE x.reported_user_id = u.id)
         ) AS reported_user,
         CASE WHEN j.id IS NOT NULL THEN json_build_object('id', j.id, 'title', j.title, 'status', j.status) ELSE NULL END AS job
       FROM user_reports r
       JOIN users ru ON ru.id = r.reporter_id
       JOIN users u ON u.id = r.reported_user_id
       LEFT JOIN jobs j ON j.id = r.job_id
       WHERE ($1 = 'all' OR r.status = $1)
       ORDER BY r.created_at DESC
       LIMIT 200`,
      [status]
    );
    return res.status(200).json({ reports: result.rows });
  } catch (error) {
    console.error('List reports error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching reports' });
  }
};

const resolveSchema = z.object({
  action: z.enum(['dismiss', 'suspend']),
  note: z.string().trim().max(300).optional().nullable(),
});

/**
 * Suspends a user: blocks sign-in, takes their open jobs and pending offers off the market,
 * closes their open reports and disconnects their live sessions.
 */
const suspendUser = async (userId: string, adminId: string, reason: string) => {
  const outcome = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE users SET suspended_at = NOW(), suspension_reason = $2, updated_at = NOW()
       WHERE id = $1 AND suspended_at IS NULL RETURNING id`,
      [userId, reason]
    );
    if (updated.rowCount === 0) return null;

    const cancelledJobs = await client.query(
      `UPDATE jobs SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = 'Account suspended', updated_at = NOW()
       WHERE poster_id = $1 AND status = 'open' RETURNING id`,
      [userId]
    );
    await client.query(
      `UPDATE job_offers SET status = 'not_selected', updated_at = NOW()
       WHERE job_id = ANY($1::uuid[]) AND status = 'pending'`,
      [cancelledJobs.rows.map((r) => r.id)]
    );
    const withdrawnOffers = await client.query(
      `UPDATE job_offers o SET status = 'withdrawn', updated_at = NOW()
       FROM jobs j
       WHERE o.worker_id = $1 AND o.status = 'pending' AND j.id = o.job_id
       RETURNING o.id, o.job_id, j.poster_id`,
      [userId]
    );
    await client.query(
      `UPDATE user_reports SET status = 'resolved', resolution = 'suspended', resolved_at = NOW(), resolved_by = $2
       WHERE reported_user_id = $1 AND status = 'open'`,
      [userId, adminId]
    );
    return { cancelledJobIds: cancelledJobs.rows.map((r) => r.id as string), withdrawnOffers: withdrawnOffers.rows };
  });

  if (!outcome) return null;

  disconnectUser(userId);
  for (const jobId of outcome.cancelledJobIds) {
    broadcastJobStatusUpdated({ jobId, status: 'cancelled', job: await fetchJobView(jobId) });
  }
  for (const offer of outcome.withdrawnOffers) {
    notifyUser(offer.poster_id, 'offer:withdrawn', { jobId: offer.job_id, offerId: offer.id });
  }
  return outcome;
};

/**
 * POST /api/admin/reports/:id/resolve { action: 'dismiss' | 'suspend', note? }
 */
export const resolveReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const parsed = resolveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'action must be "dismiss" or "suspend"' });
    }
    const { action, note } = parsed.data;

    const reportResult = await query('SELECT id, reported_user_id, reason, status FROM user_reports WHERE id = $1', [id]);
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const report = reportResult.rows[0];
    if (report.status !== 'open') {
      return res.status(409).json({ error: 'This report has already been resolved' });
    }

    if (action === 'suspend') {
      if (report.reported_user_id === req.user!.id) {
        return res.status(400).json({ error: 'You cannot suspend your own account' });
      }
      const outcome = await suspendUser(report.reported_user_id, req.user!.id, note || `Reported: ${report.reason}`);
      if (!outcome) {
        // Already suspended: just close the report
        await query(
          `UPDATE user_reports SET status = 'resolved', resolution = 'suspended', resolved_at = NOW(), resolved_by = $2 WHERE id = $1`,
          [id, req.user!.id]
        );
      }
      if (note) await query('UPDATE user_reports SET resolution_note = $2 WHERE id = $1', [id, note]);
      console.warn(`[MODERATION] user ${report.reported_user_id} suspended by admin ${req.user!.id} (report ${id})`);
      return res.status(200).json({
        message: 'User suspended',
        cancelledJobs: outcome?.cancelledJobIds.length ?? 0,
        withdrawnOffers: outcome?.withdrawnOffers.length ?? 0,
      });
    }

    await query(
      `UPDATE user_reports SET status = 'resolved', resolution = 'dismissed', resolution_note = $3, resolved_at = NOW(), resolved_by = $2
       WHERE id = $1`,
      [id, req.user!.id, note || null]
    );
    return res.status(200).json({ message: 'Report dismissed' });
  } catch (error) {
    console.error('Resolve report error:', error);
    return res.status(500).json({ error: 'Internal server error while resolving report' });
  }
};

/**
 * POST /api/admin/users/:id/unsuspend
 */
export const unsuspendUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const updated = await query(
      `UPDATE users SET suspended_at = NULL, suspension_reason = NULL, updated_at = NOW()
       WHERE id = $1 AND suspended_at IS NOT NULL RETURNING id`,
      [id]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'No suspended user with that id' });
    }
    console.warn(`[MODERATION] user ${id} reinstated by admin ${req.user!.id}`);
    return res.status(200).json({ message: 'User reinstated' });
  } catch (error) {
    console.error('Unsuspend user error:', error);
    return res.status(500).json({ error: 'Internal server error while reinstating user' });
  }
};
