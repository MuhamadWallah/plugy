import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { fetchJobView } from '../services/jobView.service.js';
import { broadcastJobUpdated } from '../sockets/socket.js';
import {
  ImageError,
  deleteImage,
  fileNameFromPublicUrl,
  processImage,
  publicUrl,
  saveImage,
  uploadedFile,
} from '../services/upload.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_JOB_PHOTOS = 4;

const imageErrorResponse = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof ImageError) return res.status(400).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

/**
 * POST /api/users/me/avatar (multipart field "photo")
 */
export const uploadAvatar = async (req: Request, res: Response) => {
  try {
    const file = uploadedFile(req, 'photo');
    if (!file) return res.status(400).json({ error: 'Choose a photo to upload.' });

    const image = await processImage(file.buffer, { maxSize: 512, square: true });
    const fileName = await saveImage('public', image.data);

    const previous = await query('SELECT avatar_url FROM users WHERE id = $1', [req.user!.id]);
    await query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [publicUrl(fileName), req.user!.id]);
    await deleteImage('public', fileNameFromPublicUrl(previous.rows[0]?.avatar_url));

    return res.status(200).json({ message: 'Profile photo updated', avatar_url: publicUrl(fileName) });
  } catch (error) {
    return imageErrorResponse(res, error, 'Could not save the profile photo');
  }
};

/**
 * DELETE /api/users/me/avatar
 */
export const deleteAvatar = async (req: Request, res: Response) => {
  try {
    const previous = await query(
      `UPDATE users u SET avatar_url = NULL, updated_at = NOW()
       FROM (SELECT avatar_url FROM users WHERE id = $1) old
       WHERE u.id = $1 RETURNING old.avatar_url`,
      [req.user!.id]
    );
    await deleteImage('public', fileNameFromPublicUrl(previous.rows[0]?.avatar_url));
    return res.status(200).json({ message: 'Profile photo removed' });
  } catch (error) {
    console.error('Delete avatar error:', error);
    return res.status(500).json({ error: 'Could not remove the profile photo' });
  }
};

const loadPosterJob = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }
  const { rows } = await query('SELECT id, poster_id, status FROM jobs WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }
  if (rows[0].poster_id !== req.user!.id) {
    res.status(403).json({ error: 'Only the job poster can change its photos' });
    return null;
  }
  if (!['open', 'accepted'].includes(rows[0].status)) {
    res.status(409).json({ error: 'Photos can only be changed before the work starts' });
    return null;
  }
  return rows[0] as { id: string };
};

/**
 * POST /api/jobs/:id/photos (multipart field "photo"), up to 4 per job
 */
export const addJobPhoto = async (req: Request, res: Response) => {
  try {
    const job = await loadPosterJob(req, res);
    if (!job) return;

    const file = uploadedFile(req, 'photo');
    if (!file) return res.status(400).json({ error: 'Choose a photo to upload.' });

    const count = await query('SELECT COUNT(*)::int AS n FROM job_photos WHERE job_id = $1', [job.id]);
    if (count.rows[0].n >= MAX_JOB_PHOTOS) {
      return res.status(409).json({ error: `A job can have up to ${MAX_JOB_PHOTOS} photos` });
    }

    const image = await processImage(file.buffer, { maxSize: 1600 });
    const fileName = await saveImage('public', image.data);
    const inserted = await query(
      `INSERT INTO job_photos (job_id, file_name, width, height) VALUES ($1, $2, $3, $4) RETURNING id`,
      [job.id, fileName, image.width, image.height]
    );

    broadcastJobUpdated({ jobId: job.id, job: await fetchJobView(job.id) });

    return res.status(201).json({
      photo: { id: inserted.rows[0].id, url: publicUrl(fileName), width: image.width, height: image.height },
    });
  } catch (error) {
    return imageErrorResponse(res, error, 'Could not save the photo');
  }
};

/**
 * DELETE /api/jobs/:id/photos/:photoId
 */
export const deleteJobPhoto = async (req: Request, res: Response) => {
  try {
    const job = await loadPosterJob(req, res);
    if (!job) return;
    if (!UUID_REGEX.test(req.params.photoId)) return res.status(404).json({ error: 'Photo not found' });

    const deleted = await query('DELETE FROM job_photos WHERE id = $1 AND job_id = $2 RETURNING file_name', [
      req.params.photoId,
      job.id,
    ]);
    if (deleted.rowCount === 0) return res.status(404).json({ error: 'Photo not found' });
    await deleteImage('public', deleted.rows[0].file_name);

    broadcastJobUpdated({ jobId: job.id, job: await fetchJobView(job.id) });
    return res.status(200).json({ message: 'Photo removed' });
  } catch (error) {
    console.error('Delete job photo error:', error);
    return res.status(500).json({ error: 'Could not remove the photo' });
  }
};
