import { Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import {
  createJobSchema,
  feedQuerySchema,
  raiseBudgetSchema,
  reasonSchema,
} from '../validators/job.validator.js';
import {
  JOB_FROM,
  JOB_SELECT_COLUMNS,
  fetchJobView,
  toJobView,
} from '../services/jobView.service.js';
import {
  broadcastJobCreated,
  broadcastJobReopened,
  broadcastJobStatusUpdated,
  broadcastJobUpdated,
} from '../sockets/socket.js';
import { notify } from '../services/notify.service.js';
import { alertNearbyWorkersInBackground } from '../services/dispatch.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Great-circle distance (km) from ($lat, $lng) to the job's *approximate* public location,
// so distances can't be used to triangulate an exact address.
const distanceSql = (latParam: string, lngParam: string) => `(
  6371 * 2 * ASIN(LEAST(1, SQRT(
    POWER(SIN(RADIANS(ROUND(j.latitude, 2)::float8 - ${latParam}) / 2), 2) +
    COS(RADIANS(${latParam})) * COS(RADIANS(ROUND(j.latitude, 2)::float8)) *
    POWER(SIN(RADIANS(ROUND(j.longitude, 2)::float8 - ${lngParam}) / 2), 2)
  )))
)`;

const validationError = (res: Response, error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  res.status(400).json({
    error: 'Validation failed',
    details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  });

/**
 * GET /api/jobs
 * Public job feed with category filter, nearby search (lat/lng/radius_km) and sorting.
 * Signed-in workers also get their own pending offer on each job (`my_offer`).
 */
export const getJobs = async (req: Request, res: Response) => {
  try {
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const { status, category, page, limit, lat, lng, radius_km, sort } = parsed.data;
    const offset = (page - 1) * limit;
    const viewerId = req.user?.id ?? null;

    const params: unknown[] = [status];
    const conditions = ['j.status = $1'];

    if (category && category !== 'all') {
      params.push(category.toLowerCase());
      conditions.push(`j.category_slug = $${params.length}`);
    }

    let distanceExpr = 'NULL::float8';
    const hasLocation = lat !== undefined && lng !== undefined;
    if (hasLocation) {
      params.push(lat, lng);
      distanceExpr = distanceSql(`$${params.length - 1}::float8`, `$${params.length}::float8`);

      if (radius_km !== undefined) {
        params.push(radius_km);
        conditions.push(`j.latitude IS NOT NULL AND j.longitude IS NOT NULL`);
        conditions.push(`${distanceExpr} <= $${params.length}`);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // The count query only references lat/lng when filtering by radius
    const countParams = hasLocation && radius_km === undefined ? params.slice(0, -2) : [...params];

    const orderBy = {
      newest: 'j.created_at DESC',
      distance: 'distance_km ASC NULLS LAST, j.created_at DESC',
      budget_high: 'j.budget DESC NULLS LAST, j.created_at DESC',
      budget_low: 'j.budget ASC NULLS LAST, j.created_at DESC',
    }[sort];

    params.push(viewerId);
    const viewerParam = `$${params.length}`;
    params.push(limit, offset);

    const jobsQuery = `
      SELECT ${JOB_SELECT_COLUMNS},
        ${distanceExpr} AS distance_km,
        CASE WHEN mo.id IS NOT NULL THEN json_build_object(
          'id', mo.id, 'price', mo.price, 'status', mo.status, 'eta_minutes', mo.eta_minutes
        ) ELSE NULL END AS my_offer
      ${JOB_FROM}
      LEFT JOIN job_offers mo ON mo.job_id = j.id AND mo.worker_id = ${viewerParam}::uuid
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const countQuery = `SELECT COUNT(*) AS total FROM jobs j ${whereClause};`;

    const [jobsResult, countResult] = await Promise.all([
      query(jobsQuery, params),
      query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    return res.status(200).json({
      jobs: jobsResult.rows.map((row) => {
        const view = toJobView(row, viewerId);
        // Round so the reported distance can't reveal more than the approximate pin does
        view.distance_km = row.distance_km === null ? null : Math.round(Number(row.distance_km) * 10) / 10;
        return view;
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching jobs' });
  }
};

/**
 * GET /api/jobs/mine
 * Jobs the user posted or was hired for.
 */
export const getMyJobs = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;

    const result = await query(
      `SELECT ${JOB_SELECT_COLUMNS},
         (j.poster_id = $1) AS is_poster,
         (j.worker_id IS NOT NULL AND j.worker_id = $1) AS is_worker,
         EXISTS (
           SELECT 1 FROM ratings r WHERE r.job_id = j.id AND r.rater_id = $1
         ) AS has_rated
       ${JOB_FROM}
       WHERE j.poster_id = $1 OR j.worker_id = $1
       ORDER BY j.updated_at DESC`,
      [userId]
    );

    return res.status(200).json({
      jobs: result.rows.map((row) => toJobView(row, userId)),
    });
  } catch (error) {
    console.error('Get my jobs error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching personal jobs' });
  }
};

/**
 * POST /api/jobs
 */
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

    const { title, category, description, location_text, budget, latitude, longitude, scheduled_for, payment_method } =
      parseResult.data;

    if ((latitude === null || latitude === undefined) !== (longitude === null || longitude === undefined)) {
      return res.status(400).json({ error: 'Latitude and longitude must be provided together' });
    }

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
         poster_id, category_slug, title, description, location_text, budget, latitude, longitude,
         scheduled_for, payment_method, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open')
       RETURNING id`,
      [
        req.user.id,
        categoryCheck.rows[0].slug,
        title,
        description,
        location_text,
        budget,
        latitude ?? null,
        longitude ?? null,
        scheduled_for ?? null,
        payment_method,
      ]
    );

    const jobId = insertResult.rows[0].id;

    // Broadcast the public version of the new job to all live feed listeners,
    // and push it to online workers nearby who do this kind of work
    broadcastJobCreated(await fetchJobView(jobId));
    alertNearbyWorkersInBackground(jobId);

    return res.status(201).json({
      message: 'Job posted successfully',
      job: await fetchJobView(jobId, req.user.id),
    });
  } catch (error) {
    console.error('Create job error:', error);
    return res.status(500).json({ error: 'Internal server error while creating job' });
  }
};

/**
 * GET /api/jobs/:id
 * Public details; the poster and hired worker additionally see exact location and contact details.
 */
export const getJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const viewerId = req.user?.id ?? null;
    const job = await fetchJobView(id, viewerId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // A worker who has bid on this job sees their own offer
    if (viewerId && viewerId !== job.poster_id) {
      const offerResult = await query(
        `SELECT id, price, message, eta_minutes, status, created_at, updated_at
         FROM job_offers WHERE job_id = $1 AND worker_id = $2`,
        [id, viewerId]
      );
      job.my_offer = offerResult.rows[0] || null;
    }

    return res.status(200).json({ job });
  } catch (error) {
    console.error('Get job by id error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching job' });
  }
};

/**
 * Publishes a job change: public version to the feed, and a refresh hint to the job room.
 */
const publishStatusChange = async (jobId: string, status: string) => {
  const publicJob = await fetchJobView(jobId);
  broadcastJobStatusUpdated({ jobId, status, job: publicJob });
};

/**
 * PATCH /api/jobs/:id/budget
 * Poster raises the price on an open job to attract offers.
 */
export const raiseBudget = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const parsed = raiseBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(res, parsed.error);
    }
    const { budget } = parsed.data;

    const jobCheck = await query('SELECT poster_id, status, budget FROM jobs WHERE id = $1', [id]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobCheck.rows[0];

    if (job.poster_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the job poster can change the price' });
    }
    if (job.status !== 'open') {
      return res.status(409).json({ error: 'The price can only be changed while the job is open' });
    }
    if (job.budget !== null && budget <= Number(job.budget)) {
      return res.status(400).json({
        error: `The new price must be higher than the current price (${Number(job.budget).toFixed(2)})`,
      });
    }

    const updated = await query(
      `UPDATE jobs SET budget = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'open' AND poster_id = $3 AND (budget IS NULL OR budget < $1)
       RETURNING id`,
      [budget, id, req.user.id]
    );
    if (updated.rowCount === 0) {
      return res.status(409).json({ error: 'The job changed in the meantime. Please refresh and try again.' });
    }

    broadcastJobUpdated({ jobId: id, job: await fetchJobView(id) });

    return res.status(200).json({
      message: 'Price raised',
      job: await fetchJobView(id, req.user.id),
    });
  } catch (error) {
    console.error('Raise budget error:', error);
    return res.status(500).json({ error: 'Internal server error while updating the price' });
  }
};

/**
 * Shared guard for actions only the hired worker may perform while the job is in a given status.
 */
const loadJobForWorkerAction = async (req: Request, res: Response, allowedStatuses: string[]) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }

  const jobCheck = await query(
    'SELECT id, poster_id, worker_id, status, title FROM jobs WHERE id = $1',
    [id]
  );
  if (jobCheck.rows.length === 0) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }

  const job = jobCheck.rows[0];
  if (job.worker_id !== req.user.id) {
    res.status(403).json({ error: 'Only the hired worker can update this job' });
    return null;
  }
  if (!allowedStatuses.includes(job.status)) {
    res.status(400).json({ error: `This action isn't available while the job is ${job.status.replace('_', ' ')}` });
    return null;
  }

  return { id: job.id as string, posterId: job.poster_id as string, title: job.title as string, userId: req.user.id, userName: req.user.name };
};

/**
 * POST /api/jobs/:id/en-route
 * Worker is on the way to the job location.
 */
export const markEnRoute = async (req: Request, res: Response) => {
  try {
    const ctx = await loadJobForWorkerAction(req, res, ['accepted']);
    if (!ctx) return;

    await query(
      `UPDATE jobs SET en_route_at = COALESCE(en_route_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status = 'accepted'`,
      [ctx.id, ctx.userId]
    );

    await publishStatusChange(ctx.id, 'accepted');
    notify(
      ctx.posterId,
      'job:progress',
      { jobId: ctx.id, jobTitle: ctx.title, step: 'en_route', workerName: ctx.userName },
      { title: `${ctx.userName} is on the way`, body: `Follow them live on the map for "${ctx.title}".` }
    );

    return res.status(200).json({
      message: 'Marked as on the way',
      job: await fetchJobView(ctx.id, ctx.userId),
    });
  } catch (error) {
    console.error('En route error:', error);
    return res.status(500).json({ error: 'Internal server error while updating job' });
  }
};

/**
 * POST /api/jobs/:id/arrived
 * Worker has arrived at the job location.
 */
export const markArrived = async (req: Request, res: Response) => {
  try {
    const ctx = await loadJobForWorkerAction(req, res, ['accepted']);
    if (!ctx) return;

    await query(
      `UPDATE jobs SET en_route_at = COALESCE(en_route_at, NOW()), arrived_at = COALESCE(arrived_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status = 'accepted'`,
      [ctx.id, ctx.userId]
    );

    await publishStatusChange(ctx.id, 'accepted');
    notify(
      ctx.posterId,
      'job:progress',
      { jobId: ctx.id, jobTitle: ctx.title, step: 'arrived', workerName: ctx.userName },
      { title: `${ctx.userName} has arrived`, body: `Your worker for "${ctx.title}" is at the location.` }
    );

    return res.status(200).json({
      message: 'Marked as arrived',
      job: await fetchJobView(ctx.id, ctx.userId),
    });
  } catch (error) {
    console.error('Arrived error:', error);
    return res.status(500).json({ error: 'Internal server error while updating job' });
  }
};

/**
 * POST /api/jobs/:id/start
 */
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
       SET status = 'in_progress', started_at = NOW(),
           en_route_at = COALESCE(en_route_at, NOW()), arrived_at = COALESCE(arrived_at, NOW()),
           updated_at = NOW()
       WHERE id = $1 AND status = 'accepted' AND worker_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(400).json({ error: 'Unable to start job: status has changed' });
    }

    await publishStatusChange(id, 'in_progress');

    return res.status(200).json({
      message: 'Job is now in progress',
      job: await fetchJobView(id, userId),
    });
  } catch (error) {
    console.error('Start job error:', error);
    return res.status(500).json({ error: 'Internal server error while starting job' });
  }
};

/**
 * POST /api/jobs/:id/complete
 */
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
      'SELECT id, poster_id, worker_id, status, title FROM jobs WHERE id = $1',
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

    await publishStatusChange(id, 'completed');

    const otherPartyId = currentJob.poster_id === userId ? currentJob.worker_id : currentJob.poster_id;
    if (otherPartyId) {
      notify(
        otherPartyId,
        'job:progress',
        { jobId: id, jobTitle: currentJob.title, step: 'completed' },
        { title: 'Job completed', body: `"${currentJob.title}" was marked as done. Leave a rating.` }
      );
    }

    return res.status(200).json({
      message: 'Job marked as completed successfully',
      job: await fetchJobView(id, userId),
    });
  } catch (error) {
    console.error('Complete job error:', error);
    return res.status(500).json({ error: 'Internal server error while completing job' });
  }
};

/**
 * POST /api/jobs/:id/cancel
 * Poster cancels while the job is open or a worker is hired but hasn't started. Optional reason.
 */
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

    const parsedReason = reasonSchema.safeParse(req.body ?? {});
    if (!parsedReason.success) {
      return validationError(res, parsedReason.error);
    }
    const reason = parsedReason.data.reason || null;

    const jobCheck = await query(
      'SELECT id, poster_id, worker_id, status, title FROM jobs WHERE id = $1',
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
    const outcome = await withTransaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE jobs
         SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $3, cancelled_by = $2, updated_at = NOW()
         WHERE id = $1 AND status IN ('open', 'accepted') AND poster_id = $2
         RETURNING id`,
        [id, userId, reason]
      );
      if (updateResult.rowCount === 0) return null;

      const closedOffers = await client.query(
        `UPDATE job_offers SET status = 'not_selected', updated_at = NOW()
         WHERE job_id = $1 AND status = 'pending'
         RETURNING id, worker_id`,
        [id]
      );
      return closedOffers.rows as { id: string; worker_id: string }[];
    });

    if (outcome === null) {
      return res.status(400).json({ error: 'Unable to cancel job: status conflict' });
    }

    await publishStatusChange(id, 'cancelled');

    // Let workers who were waiting on this job know it's gone
    for (const offer of outcome) {
      notify(
        offer.worker_id,
        'offer:updated',
        { jobId: id, jobTitle: currentJob.title, offerId: offer.id, status: 'not_selected', reason: 'job_cancelled' },
        { title: 'Job cancelled', body: `"${currentJob.title}" was cancelled by the customer.` }
      );
    }
    if (currentJob.worker_id) {
      notify(
        currentJob.worker_id,
        'job:cancelled',
        { jobId: id, jobTitle: currentJob.title, reason },
        { title: 'Job cancelled', body: `The customer cancelled "${currentJob.title}"${reason ? `: ${reason}` : '.'}` }
      );
    }

    return res.status(200).json({
      message: 'Job cancelled successfully',
      job: await fetchJobView(id, userId),
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    return res.status(500).json({ error: 'Internal server error while cancelling job' });
  }
};

/**
 * POST /api/jobs/:id/release
 * The hired worker backs out before starting. The job reopens for offers, and offers that
 * were passed over when this worker was chosen become pending again.
 */
export const releaseJob = async (req: Request, res: Response) => {
  try {
    const parsedReason = reasonSchema.safeParse(req.body ?? {});
    if (!parsedReason.success) {
      return validationError(res, parsedReason.error);
    }
    const reason = parsedReason.data.reason || null;

    const ctx = await loadJobForWorkerAction(req, res, ['accepted']);
    if (!ctx) return;

    const restoredOffers = await withTransaction(async (client) => {
      const reopened = await client.query(
        `UPDATE jobs
         SET status = 'open', worker_id = NULL, agreed_price = NULL, accepted_at = NULL,
             en_route_at = NULL, arrived_at = NULL, updated_at = NOW()
         WHERE id = $1 AND worker_id = $2 AND status = 'accepted'
         RETURNING id`,
        [ctx.id, ctx.userId]
      );
      if (reopened.rowCount === 0) return null;

      await client.query(
        `UPDATE job_offers SET status = 'withdrawn', updated_at = NOW() WHERE job_id = $1 AND worker_id = $2`,
        [ctx.id, ctx.userId]
      );

      const restored = await client.query(
        `UPDATE job_offers SET status = 'pending', updated_at = NOW()
         WHERE job_id = $1 AND status = 'not_selected'
         RETURNING id, worker_id`,
        [ctx.id]
      );
      return restored.rows as { id: string; worker_id: string }[];
    });

    if (restoredOffers === null) {
      return res.status(409).json({ error: 'The job changed in the meantime. Please refresh.' });
    }

    const publicJob = await fetchJobView(ctx.id);
    broadcastJobStatusUpdated({ jobId: ctx.id, status: 'open', job: publicJob });
    broadcastJobReopened({ jobId: ctx.id, job: publicJob });
    alertNearbyWorkersInBackground(ctx.id);

    notify(
      ctx.posterId,
      'job:released',
      { jobId: ctx.id, jobTitle: ctx.title, workerName: ctx.userName, reason, restoredOffers: restoredOffers.length },
      { title: `${ctx.userName} can't make it`, body: `${reason ? `"${reason}". ` : ''}"${ctx.title}" is open for offers again.` }
    );
    for (const offer of restoredOffers) {
      notify(
        offer.worker_id,
        'offer:updated',
        { jobId: ctx.id, jobTitle: ctx.title, offerId: offer.id, status: 'pending' },
        { title: 'Job open again', body: `"${ctx.title}" reopened and your offer is active again.` }
      );
    }

    return res.status(200).json({ message: 'You have withdrawn from this job. It is open for other workers again.' });
  } catch (error) {
    console.error('Release job error:', error);
    return res.status(500).json({ error: 'Internal server error while updating job' });
  }
};
