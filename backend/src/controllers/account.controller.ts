import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { COOKIE_NAME, getCookieOptions, signToken } from '../config/jwt.js';
import { fetchJobView } from '../services/jobView.service.js';
import { broadcastJobStatusUpdated, disconnectUser, notifyUser } from '../sockets/socket.js';
import { deleteImage, fileNameFromPublicUrl } from '../services/upload.service.js';

const nameSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
});

/**
 * PATCH /api/users/me { name }
 */
export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const parsed = nameSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    await query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [parsed.data.name, req.user!.id]);
    return res.status(200).json({ message: 'Profile updated', name: parsed.data.name });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Could not update your profile' });
  }
};

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password'),
  new_password: z.string().min(6, 'New password must be at least 6 characters').max(128),
});

/**
 * POST /api/auth/change-password { current_password, new_password }
 * Signs out every other device; this device gets a fresh session.
 */
export const changePassword = async (req: Request, res: Response) => {
  try {
    const parsed = passwordSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!(await bcrypt.compare(parsed.data.current_password, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Your current password is incorrect' });
    }

    const hash = await bcrypt.hash(parsed.data.new_password, 10);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2', [
      hash,
      req.user!.id,
    ]);
    // Fresh session for this device (issued after the change, so it stays valid)
    res.cookie(COOKIE_NAME, signToken({ userId: req.user!.id, email: req.user!.email }), getCookieOptions());
    return res.status(200).json({ message: 'Password changed. Other devices have been signed out.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Could not change your password' });
  }
};

/**
 * DELETE /api/users/me { password }
 * Deletes the account: personal data and files are removed, open requests and offers are withdrawn,
 * and past jobs, messages and reviews stay for the other people involved under "Deleted user".
 */
export const deleteMyAccount = async (req: Request, res: Response) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const userId = req.user!.id;

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!password || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Enter your password to confirm' });
    }

    const active = await query(
      `SELECT 1 FROM jobs WHERE (poster_id = $1 OR worker_id = $1) AND status IN ('accepted', 'in_progress') LIMIT 1`,
      [userId]
    );
    if (active.rows.length > 0) {
      return res.status(409).json({ error: 'You have a job in progress. Finish or cancel it before deleting your account.' });
    }

    const outcome = await withTransaction(async (client) => {
      const avatar = await client.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);

      const cancelled = await client.query(
        `UPDATE jobs SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = 'Account deleted', cancelled_by = $1, updated_at = NOW()
         WHERE poster_id = $1 AND status = 'open' RETURNING id`,
        [userId]
      );
      const cancelledIds = cancelled.rows.map((r) => r.id as string);
      const notSelected = await client.query(
        `UPDATE job_offers SET status = 'not_selected', updated_at = NOW()
         WHERE job_id = ANY($1::uuid[]) AND status = 'pending' RETURNING id, job_id, worker_id`,
        [cancelledIds]
      );
      const withdrawn = await client.query(
        `UPDATE job_offers o SET status = 'withdrawn', updated_at = NOW()
         FROM jobs j WHERE o.worker_id = $1 AND o.status = 'pending' AND j.id = o.job_id
         RETURNING o.id, o.job_id, j.poster_id`,
        [userId]
      );

      // Photos of the person's own jobs (often of their home) and their ID documents
      const photos = await client.query(
        `DELETE FROM job_photos p USING jobs j WHERE p.job_id = j.id AND j.poster_id = $1 RETURNING p.file_name`,
        [userId]
      );
      const ids = await client.query(`DELETE FROM id_verifications WHERE user_id = $1 RETURNING document_file, selfie_file`, [userId]);

      await client.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM worker_availability WHERE user_id = $1', [userId]);
      await client.query(
        `DELETE FROM phone_verifications WHERE phone = (SELECT phone FROM users WHERE id = $1)`,
        [userId]
      );
      await client.query(
        `UPDATE users SET
           name = 'Deleted user', email = 'deleted-' || id || '@deleted.invalid', phone = NULL, phone_verified = FALSE,
           avatar_url = NULL, password_hash = '!', id_verified_at = NULL, deleted_at = NOW(),
           password_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      return {
        avatar: avatar.rows[0]?.avatar_url as string | null,
        cancelledIds,
        notSelected: notSelected.rows,
        withdrawn: withdrawn.rows,
        publicFiles: photos.rows.map((r) => r.file_name as string),
        privateFiles: ids.rows.flatMap((r) => [r.document_file as string, r.selfie_file as string]),
      };
    });

    await deleteImage('public', fileNameFromPublicUrl(outcome.avatar));
    await Promise.all(outcome.publicFiles.map((f) => deleteImage('public', f)));
    await Promise.all(outcome.privateFiles.map((f) => deleteImage('private', f)));

    for (const jobId of outcome.cancelledIds) {
      broadcastJobStatusUpdated({ jobId, status: 'cancelled', job: await fetchJobView(jobId) });
    }
    for (const offer of outcome.notSelected) {
      notifyUser(offer.worker_id, 'offer:updated', { jobId: offer.job_id, offerId: offer.id, status: 'not_selected', reason: 'job_cancelled' });
    }
    for (const offer of outcome.withdrawn) {
      notifyUser(offer.poster_id, 'offer:withdrawn', { jobId: offer.job_id, offerId: offer.id });
    }

    disconnectUser(userId);
    res.clearCookie(COOKIE_NAME, { ...getCookieOptions(), maxAge: 0 });
    console.warn(`[ACCOUNT] user ${userId} deleted their account`);
    return res.status(200).json({ message: 'Your account has been deleted.' });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Could not delete your account' });
  }
};

/**
 * GET /api/workers/me/earnings
 * Totals from completed jobs as a worker (agreed prices, paid directly by customers).
 */
export const getMyEarnings = async (req: Request, res: Response) => {
  try {
    const totals = await query(
      `SELECT
         COALESCE(SUM(agreed_price) FILTER (WHERE completed_at >= date_trunc('week', NOW())), 0) AS this_week,
         COALESCE(SUM(agreed_price) FILTER (WHERE completed_at >= date_trunc('month', NOW())), 0) AS this_month,
         COALESCE(SUM(agreed_price), 0) AS all_time,
         COUNT(*)::int AS jobs_completed
       FROM jobs WHERE worker_id = $1 AND status = 'completed'`,
      [req.user!.id]
    );
    const recent = await query(
      `SELECT j.id, j.title, j.agreed_price, j.completed_at, j.payment_method, c.name AS category_name, u.name AS customer_name
       FROM jobs j JOIN categories c ON c.slug = j.category_slug JOIN users u ON u.id = j.poster_id
       WHERE j.worker_id = $1 AND j.status = 'completed'
       ORDER BY j.completed_at DESC LIMIT 10`,
      [req.user!.id]
    );
    return res.status(200).json({ earnings: totals.rows[0], recent: recent.rows });
  } catch (error) {
    console.error('Earnings error:', error);
    return res.status(500).json({ error: 'Could not load earnings' });
  }
};
