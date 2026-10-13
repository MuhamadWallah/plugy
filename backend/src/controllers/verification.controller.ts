import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { notify } from '../services/notify.service.js';
import {
  ImageError,
  deleteImage,
  privateFilePath,
  processImage,
  saveImage,
  uploadedFile,
} from '../services/upload.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCUMENT_TYPES = ['national_id', 'passport', 'drivers_license'] as const;

/**
 * GET /api/users/me/verification
 */
export const getMyVerification = async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT v.status, v.document_type, v.rejection_reason, v.created_at, v.reviewed_at,
              (u.id_verified_at IS NOT NULL) AS id_verified
       FROM users u
       LEFT JOIN LATERAL (
         SELECT * FROM id_verifications iv WHERE iv.user_id = u.id ORDER BY iv.created_at DESC LIMIT 1
       ) v ON TRUE
       WHERE u.id = $1`,
      [req.user!.id]
    );
    const row = rows[0];
    return res.status(200).json({
      verification: {
        id_verified: row.id_verified,
        status: row.id_verified ? 'approved' : row.status ?? 'none',
        document_type: row.document_type ?? null,
        rejection_reason: row.status === 'rejected' ? row.rejection_reason : null,
        submitted_at: row.created_at ?? null,
      },
    });
  } catch (error) {
    console.error('Get verification error:', error);
    return res.status(500).json({ error: 'Could not load verification status' });
  }
};

/**
 * POST /api/users/me/verification (multipart: document_type, document, selfie)
 * Files are stored privately and only shown to admins.
 */
export const submitVerification = async (req: Request, res: Response) => {
  const saved: string[] = [];
  try {
    const documentType = String(req.body?.document_type ?? '');
    if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      return res.status(400).json({ error: 'Choose the type of ID document' });
    }
    const documentFile = uploadedFile(req, 'document');
    const selfieFile = uploadedFile(req, 'selfie');
    if (!documentFile || !selfieFile) {
      return res.status(400).json({ error: 'Add a photo of your ID document and a selfie' });
    }

    const status = await query(
      `SELECT (u.id_verified_at IS NOT NULL) AS verified,
              EXISTS (SELECT 1 FROM id_verifications v WHERE v.user_id = u.id AND v.status = 'pending') AS pending
       FROM users u WHERE u.id = $1`,
      [req.user!.id]
    );
    if (status.rows[0].verified) return res.status(409).json({ error: 'Your ID is already verified' });
    if (status.rows[0].pending) return res.status(409).json({ error: 'Your ID is already waiting for review' });

    const [documentImage, selfieImage] = await Promise.all([
      processImage(documentFile.buffer, { maxSize: 2000, quality: 88 }),
      processImage(selfieFile.buffer, { maxSize: 1200, quality: 85 }),
    ]);
    saved.push(await saveImage('private', documentImage.data));
    saved.push(await saveImage('private', selfieImage.data));

    await query(
      `INSERT INTO id_verifications (user_id, document_type, document_file, selfie_file) VALUES ($1, $2, $3, $4)`,
      [req.user!.id, documentType, saved[0], saved[1]]
    );

    return res.status(201).json({ message: "Thanks! We'll review your ID shortly and notify you." });
  } catch (error) {
    await Promise.all(saved.map((f) => deleteImage('private', f)));
    if (error instanceof ImageError) return res.status(400).json({ error: error.message });
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Your ID is already waiting for review' });
    }
    console.error('Submit verification error:', error);
    return res.status(500).json({ error: 'Could not submit your ID' });
  }
};

/**
 * GET /api/admin/verifications?status=pending|approved|rejected
 */
export const listVerifications = async (req: Request, res: Response) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending';
    const { rows } = await query(
      `SELECT v.id, v.document_type, v.status, v.rejection_reason, v.created_at, v.reviewed_at,
         json_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone, 'phone_verified', u.phone_verified,
           'member_since', u.created_at, 'rating_avg', u.rating_avg, 'rating_count', u.rating_count,
           'jobs_completed', (SELECT COUNT(*)::int FROM jobs j WHERE j.worker_id = u.id AND j.status = 'completed')
         ) AS user
       FROM id_verifications v JOIN users u ON u.id = v.user_id
       WHERE v.status = $1
       ORDER BY v.created_at ${status === 'pending' ? 'ASC' : 'DESC'}
       LIMIT 200`,
      [status]
    );
    return res.status(200).json({ verifications: rows });
  } catch (error) {
    console.error('List verifications error:', error);
    return res.status(500).json({ error: 'Could not load verifications' });
  }
};

/**
 * GET /api/admin/verifications/:id/files/:kind (kind = document | selfie)
 */
export const getVerificationFile = async (req: Request, res: Response) => {
  try {
    const { id, kind } = req.params;
    if (!UUID_REGEX.test(id) || !['document', 'selfie'].includes(kind)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const { rows } = await query(`SELECT document_file, selfie_file FROM id_verifications WHERE id = $1`, [id]);
    const fileName = rows[0]?.[kind === 'document' ? 'document_file' : 'selfie_file'];
    const filePath = fileName ? privateFilePath(fileName) : null;
    if (!filePath) return res.status(404).json({ error: 'File not found' });

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
    });
  } catch (error) {
    console.error('Get verification file error:', error);
    return res.status(500).json({ error: 'Could not load the file' });
  }
};

const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => v.decision === 'approve' || (v.reason && v.reason.length > 0), {
    message: 'Tell the worker why the ID was rejected',
  });

/**
 * POST /api/admin/verifications/:id/review { decision: 'approve' | 'reject', reason? }
 */
export const reviewVerification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) return res.status(404).json({ error: 'Verification not found' });
    const parsed = reviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review' });
    const { decision, reason } = parsed.data;

    const updated = await query(
      `UPDATE id_verifications
       SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING user_id`,
      [id, decision === 'approve' ? 'approved' : 'rejected', decision === 'reject' ? reason : null, req.user!.id]
    );
    if (updated.rowCount === 0) return res.status(409).json({ error: 'This submission has already been reviewed' });
    const userId = updated.rows[0].user_id as string;

    if (decision === 'approve') {
      await query('UPDATE users SET id_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);
    }

    notify(
      userId,
      'verification:reviewed',
      { decision, reason: decision === 'reject' ? reason : null },
      decision === 'approve'
        ? { title: 'Your ID is verified', body: 'Customers now see the "ID verified" badge on your profile and offers.', url: '/?view=profile' }
        : { title: 'ID check unsuccessful', body: `${reason} Please submit your ID again from your profile.`, url: '/?view=profile' }
    );

    console.warn(`[VERIFICATION] ${id} ${decision}d by admin ${req.user!.id}`);
    return res.status(200).json({ message: decision === 'approve' ? 'ID approved' : 'ID rejected' });
  } catch (error) {
    console.error('Review verification error:', error);
    return res.status(500).json({ error: 'Could not save the review' });
  }
};
