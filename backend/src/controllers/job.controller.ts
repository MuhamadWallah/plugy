import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { createJobSchema } from '../validators/job.validator.js';
import { 
  broadcastJobCreated, 
  broadcastJobAccepted, 
  broadcastJobStatusUpdated 
} from '../sockets/socket.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper to fetch consistent enriched job data
const fetchEnrichedJob = async (jobId: string) => {
  const result = await query(
    `SELECT 
       j.id, j.poster_id, j.worker_id, j.category_slug, j.title, j.description, 
       j.location_text, j.latitude, j.longitude, j.budget, j.status, 
       j.created_at, j.accepted_at, j.completed_at, j.updated_at,
       json_build_object(
         'id', u.id,
         'name', u.name,
         'avatar_url', u.avatar_url,
         'rating_avg', u.rating_avg,
         'rating_count', u.rating_count
       ) AS poster,
       CASE 
         WHEN w.id IS NOT NULL THEN json_build_object(
           'id', w.id,
           'name', w.name,
           'avatar_url', w.avatar_url,
           'rating_avg', w.rating_avg,
           'rating_count', w.rating_count
         )
         ELSE NULL
       END AS worker,
       c.name AS category_name,
       c.icon AS category_icon,
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'id', r.id,
               'rater_id', r.rater_id,
               'ratee_id', r.ratee_id,
               'score', r.score,
               'comment', r.comment,
               'created_at', r.created_at,
               'rater', json_build_object('id', ru.id, 'name', ru.name, 'avatar_url', ru.avatar_url)
             )
             ORDER BY r.created_at ASC
           )
           FROM ratings r
           JOIN users ru ON r.rater_id = ru.id
           WHERE r.job_id = j.id
         ),
         '[]'::json
       ) AS ratings
     FROM jobs j
     JOIN users u ON j.poster_id = u.id
     JOIN categories c ON j.category_slug = c.slug
     LEFT JOIN users w ON j.worker_id = w.id
     WHERE j.id = $1`,
    [jobId]
  );
  return result.rows[0] || null;
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'open';
    const category = req.query.category as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const offset = (page - 1) * limit;

    const queryParams: unknown[] = [status];
    let whereClause = 'WHERE j.status = $1';

    if (category && category !== 'all') {
      queryParams.push(category.toLowerCase());
      whereClause += ` AND j.category_slug = $${queryParams.length}`;
    }

    const jobsQuery = `
      SELECT 
        j.id, j.poster_id, j.worker_id, j.category_slug, j.title, j.description, 
        j.location_text, j.latitude, j.longitude, j.budget, j.status, 
        j.created_at, j.accepted_at, j.completed_at, j.updated_at,
        json_build_object(
          'id', u.id,
          'name', u.name,
          'avatar_url', u.avatar_url,
          'rating_avg', u.rating_avg,
          'rating_count', u.rating_count
        ) AS poster,
        c.name AS category_name,
        c.icon AS category_icon
      FROM jobs j
      JOIN users u ON j.poster_id = u.id
      JOIN categories c ON j.category_slug = c.slug
      ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM jobs j
      ${whereClause};
    `;

    const [jobsResult, countResult] = await Promise.all([
      query(jobsQuery, [...queryParams, limit, offset]),
      query(countQuery, queryParams),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      jobs: jobsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching jobs' });
  }
};

export const getMyJobs = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;

    const result = await query(
      `SELECT 
         j.id, j.poster_id, j.worker_id, j.category_slug, j.title, j.description, 
         j.location_text, j.latitude, j.longitude, j.budget, j.status, 
         j.created_at, j.accepted_at, j.completed_at, j.updated_at,
         (j.poster_id = $1) AS is_poster,
         (j.worker_id = $1) AS is_worker,
         json_build_object(
           'id', u.id,
           'name', u.name,
           'avatar_url', u.avatar_url,
           'rating_avg', u.rating_avg,
           'rating_count', u.rating_count
         ) AS poster,
         CASE 
           WHEN w.id IS NOT NULL THEN json_build_object(
             'id', w.id,
             'name', w.name,
             'avatar_url', w.avatar_url,
             'rating_avg', w.rating_avg,
             'rating_count', w.rating_count
           )
           ELSE NULL
         END AS worker,
         c.name AS category_name,
         c.icon AS category_icon,
         EXISTS (
           SELECT 1 FROM ratings r WHERE r.job_id = j.id AND r.rater_id = $1
         ) AS has_rated
       FROM jobs j
       JOIN users u ON j.poster_id = u.id
       JOIN categories c ON j.category_slug = c.slug
       LEFT JOIN users w ON j.worker_id = w.id
       WHERE j.poster_id = $1 OR j.worker_id = $1
       ORDER BY j.updated_at DESC`,
      [userId]
    );

    return res.status(200).json({
      jobs: result.rows,
    });
  } catch (error) {
    console.error('Get my jobs error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching personal jobs' });
  }
};

export const createJob = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parseResult = createJobSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { title, category, description, location_text, budget, latitude, longitude } =
      parseResult.data;

    const categoryCheck = await query(
      'SELECT slug, name, icon FROM categories WHERE slug = $1 AND is_active = true',
      [category.toLowerCase()]
    );

    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid category. Please select one of the available service categories.',
      });
    }

    const insertResult = await query(
      `INSERT INTO jobs (
         poster_id, category_slug, title, description, location_text, budget, latitude, longitude, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
       RETURNING id`,
      [
        req.user.id,
        categoryCheck.rows[0].slug,
        title,
        description,
        location_text,
        budget,
        latitude || null,
        longitude || null,
      ]
    );

    const fullJob = await fetchEnrichedJob(insertResult.rows[0].id);

    // Broadcast new open job to all live feed listeners via Socket.IO
    broadcastJobCreated(fullJob);

    return res.status(201).json({
      message: 'Job posted successfully',
      job: fullJob,
    });
  } catch (error) {
    console.error('Create job error:', error);
    return res.status(500).json({ error: 'Internal server error while creating job' });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = await fetchEnrichedJob(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json({ job });
  } catch (error) {
    console.error('Get job by id error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching job' });
  }
};

export const acceptJob = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const workerId = req.user.id;

    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Atomic conditional update preventing race conditions
    const updateResult = await query(
      `UPDATE jobs
       SET worker_id = $1, status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'open' AND poster_id <> $1
       RETURNING id`,
      [workerId, id]
    );

    if (updateResult.rowCount === 0) {
      const checkResult = await query(
        'SELECT poster_id, status FROM jobs WHERE id = $1',
        [id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const jobRecord = checkResult.rows[0];

      if (jobRecord.poster_id === workerId) {
        return res.status(400).json({
          error: 'You cannot accept your own job',
        });
      }

      if (jobRecord.status !== 'open') {
        return res.status(409).json({
          error: 'This job is no longer open or has already been accepted',
        });
      }

      return res.status(409).json({
        error: 'Unable to accept job. It may have already been accepted by someone else.',
      });
    }

    const fullAcceptedJob = await fetchEnrichedJob(id);

    // Broadcast over WebSockets
    broadcastJobAccepted({
      jobId: id,
      job: fullAcceptedJob,
    });

    return res.status(200).json({
      message: 'Job accepted successfully',
      job: fullAcceptedJob,
    });
  } catch (error) {
    console.error('Accept job error:', error);
    return res.status(500).json({ error: 'Internal server error while accepting job' });
  }
};

export const startJob = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Lookup current job status and assignments
    const jobCheck = await query(
      'SELECT id, poster_id, worker_id, status FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const currentJob = jobCheck.rows[0];

    // Only the assigned worker can start the job
    if (currentJob.worker_id !== userId) {
      return res.status(403).json({
        error: 'Only the assigned worker can mark this job as in progress',
      });
    }

    // Must be in 'accepted' status
    if (currentJob.status !== 'accepted') {
      return res.status(400).json({
        error: `Cannot start job: job must be in accepted status to start (current status: ${currentJob.status})`,
      });
    }

    const updateResult = await query(
      `UPDATE jobs
       SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND status = 'accepted' AND worker_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(400).json({ error: 'Unable to start job: status has changed' });
    }

    const updatedJob = await fetchEnrichedJob(id);

    // Broadcast status change
    broadcastJobStatusUpdated({
      jobId: id,
      status: 'in_progress',
      job: updatedJob,
    });

    return res.status(200).json({
      message: 'Job is now in progress',
      job: updatedJob,
    });
  } catch (error) {
    console.error('Start job error:', error);
    return res.status(500).json({ error: 'Internal server error while starting job' });
  }
};

export const completeJob = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobCheck = await query(
      'SELECT id, poster_id, worker_id, status FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const currentJob = jobCheck.rows[0];

    // Either party (poster or worker) can mark completed
    if (currentJob.poster_id !== userId && currentJob.worker_id !== userId) {
      return res.status(403).json({
        error: 'Only the poster or assigned worker can mark this job as completed',
      });
    }

    // Terminal status enforcement: once completed, status cannot change
    if (currentJob.status === 'completed') {
      return res.status(400).json({
        error: 'Job is already completed. Completed jobs cannot change status.',
      });
    }

    if (currentJob.status === 'cancelled') {
      return res.status(400).json({
        error: 'Cannot complete a cancelled job',
      });
    }

    if (currentJob.status === 'open') {
      return res.status(400).json({
        error: 'Cannot complete a job that has not been accepted or started',
      });
    }

    // Must be 'accepted' or 'in_progress'
    const updateResult = await query(
      `UPDATE jobs
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('accepted', 'in_progress') AND (poster_id = $2 OR worker_id = $2)
       RETURNING id`,
      [id, userId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(400).json({ error: 'Unable to complete job: status conflict' });
    }

    const updatedJob = await fetchEnrichedJob(id);

    // Broadcast completion
    broadcastJobStatusUpdated({
      jobId: id,
      status: 'completed',
      job: updatedJob,
    });

    return res.status(200).json({
      message: 'Job marked as completed successfully',
      job: updatedJob,
    });
  } catch (error) {
    console.error('Complete job error:', error);
    return res.status(500).json({ error: 'Internal server error while completing job' });
  }
};

export const cancelJob = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobCheck = await query(
      'SELECT id, poster_id, worker_id, status FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const currentJob = jobCheck.rows[0];

    // Only the poster can cancel
    if (currentJob.poster_id !== userId) {
      return res.status(403).json({
        error: 'Only the job poster can cancel this job',
      });
    }

    if (currentJob.status === 'cancelled') {
      return res.status(400).json({
        error: 'Job is already cancelled',
      });
    }

    if (currentJob.status === 'completed') {
      return res.status(400).json({
        error: 'Completed jobs cannot be cancelled',
      });
    }

    if (currentJob.status === 'in_progress') {
      return res.status(400).json({
        error: 'Cannot cancel a job that is already in progress. Please contact support or the worker.',
      });
    }

    // Only while 'open' or 'accepted'
    const updateResult = await query(
      `UPDATE jobs
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status IN ('open', 'accepted') AND poster_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(400).json({ error: 'Unable to cancel job: status conflict' });
    }

    const updatedJob = await fetchEnrichedJob(id);

    // Broadcast cancellation
    broadcastJobStatusUpdated({
      jobId: id,
      status: 'cancelled',
      job: updatedJob,
    });

    return res.status(200).json({
      message: 'Job cancelled successfully',
      job: updatedJob,
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    return res.status(500).json({ error: 'Internal server error while cancelling job' });
  }
};
