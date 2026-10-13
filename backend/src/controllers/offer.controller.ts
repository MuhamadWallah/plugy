import { Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import { offerSchema } from '../validators/job.validator.js';
import { OFFER_SELECT, fetchJobView, fetchOffer } from '../services/jobView.service.js';
import { broadcastJobAccepted, notifyUser } from '../sockets/socket.js';
import { notify } from '../services/notify.service.js';
import { env } from '../config/env.js';

const money = (value: unknown) => `$${Number(value).toFixed(2)}`;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * POST /api/jobs/:id/offers
 * A worker accepts the posted price or proposes their own (counter-offer), with an optional
 * arrival estimate and note. Submitting again updates the worker's offer.
 */
export const submitOffer = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: jobId } = req.params;
    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const parsed = offerSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Validation failed',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const { price, message, eta_minutes } = parsed.data;
    const workerId = req.user.id;

    const jobResult = await query('SELECT poster_id, status, title, category_slug FROM jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];

    if (job.poster_id === workerId) {
      return res.status(400).json({ error: 'You cannot make an offer on your own job' });
    }
    if (job.status !== 'open') {
      return res.status(409).json({ error: 'This job is no longer accepting offers' });
    }

    // Childcare and care work: only workers with a verified ID can offer
    if (env.ID_REQUIRED_CATEGORIES.includes(job.category_slug)) {
      const verified = await query('SELECT id_verified_at IS NOT NULL AS ok FROM users WHERE id = $1', [workerId]);
      if (!verified.rows[0]?.ok) {
        return res.status(403).json({
          error: 'Jobs in this category need a verified ID. Verify your ID from your profile to make offers.',
          code: 'id_verification_required',
        });
      }
    }

    // Insert or update the worker's single offer, only while the job is still open.
    // A worker the poster explicitly declined cannot re-offer on the same job.
    const upsert = await query(
      `INSERT INTO job_offers (job_id, worker_id, price, message, eta_minutes, status)
       SELECT $1, $2, $3, $4, $5, 'pending'
       WHERE EXISTS (SELECT 1 FROM jobs WHERE id = $1 AND status = 'open')
       ON CONFLICT (job_id, worker_id) DO UPDATE
         SET price = EXCLUDED.price,
             message = EXCLUDED.message,
             eta_minutes = EXCLUDED.eta_minutes,
             status = 'pending',
             updated_at = NOW()
         WHERE job_offers.status <> 'declined'
       RETURNING id, (xmax = 0) AS inserted`,
      [jobId, workerId, price, message || null, eta_minutes ?? null]
    );

    if (upsert.rows.length === 0) {
      const existing = await query(
        'SELECT status FROM job_offers WHERE job_id = $1 AND worker_id = $2',
        [jobId, workerId]
      );
      if (existing.rows[0]?.status === 'declined') {
        return res.status(409).json({ error: 'The customer declined your offer for this job' });
      }
      return res.status(409).json({ error: 'This job is no longer accepting offers' });
    }

    const { id: offerId, inserted } = upsert.rows[0];
    const offer = await fetchOffer(offerId);

    // Live notification to the poster
    notify(
      job.poster_id,
      'offer:new',
      { jobId, jobTitle: job.title, offer, updated: !inserted },
      {
        title: `${inserted ? 'New offer' : 'Updated offer'}: ${money(offer.price)}`,
        body: `${offer.worker.name} for "${job.title}"`,
      }
    );

    return res.status(inserted ? 201 : 200).json({
      message: inserted ? 'Offer sent to the customer' : 'Offer updated',
      offer,
    });
  } catch (error) {
    console.error('Submit offer error:', error);
    return res.status(500).json({ error: 'Internal server error while sending offer' });
  }
};

/**
 * GET /api/jobs/:id/offers
 * Poster: every offer on the job (pending first, cheapest first).
 * Anyone else: only their own offer.
 */
export const listOffers = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: jobId } = req.params;
    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobResult = await query('SELECT poster_id FROM jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const isPoster = jobResult.rows[0].poster_id === req.user.id;

    const offers = isPoster
      ? await query(
          `${OFFER_SELECT}
           WHERE o.job_id = $1 AND o.status <> 'withdrawn'
           ORDER BY (o.status = 'pending') DESC, o.price ASC, o.created_at ASC`,
          [jobId]
        )
      : await query(`${OFFER_SELECT} WHERE o.job_id = $1 AND o.worker_id = $2`, [jobId, req.user.id]);

    return res.status(200).json({ offers: offers.rows });
  } catch (error) {
    console.error('List offers error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching offers' });
  }
};

/**
 * POST /api/jobs/:id/offers/:offerId/accept
 * The poster hires the worker behind this offer at the offered price.
 * Runs in a transaction with row locks, so concurrent accepts can't double-book the job.
 */
export const acceptOffer = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: jobId, offerId } = req.params;
    if (!UUID_REGEX.test(jobId) || !UUID_REGEX.test(offerId)) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    const posterId = req.user.id;

    const outcome = await withTransaction(async (client) => {
      const jobResult = await client.query(
        'SELECT poster_id, status, title FROM jobs WHERE id = $1 FOR UPDATE',
        [jobId]
      );
      if (jobResult.rows.length === 0) throw new HttpError(404, 'Job not found');
      const job = jobResult.rows[0];

      if (job.poster_id !== posterId) throw new HttpError(403, 'Only the job poster can choose an offer');
      if (job.status !== 'open') throw new HttpError(409, 'A worker has already been chosen for this job');

      const offerResult = await client.query(
        'SELECT worker_id, price, status FROM job_offers WHERE id = $1 AND job_id = $2 FOR UPDATE',
        [offerId, jobId]
      );
      if (offerResult.rows.length === 0) throw new HttpError(404, 'Offer not found');
      const offer = offerResult.rows[0];
      if (offer.status !== 'pending') throw new HttpError(409, 'This offer is no longer available');

      await client.query(
        `UPDATE jobs
         SET worker_id = $1, agreed_price = $2, status = 'accepted', accepted_at = NOW(),
             en_route_at = NULL, arrived_at = NULL, updated_at = NOW()
         WHERE id = $3`,
        [offer.worker_id, offer.price, jobId]
      );
      await client.query(
        `UPDATE job_offers SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
        [offerId]
      );
      const others = await client.query(
        `UPDATE job_offers SET status = 'not_selected', updated_at = NOW()
         WHERE job_id = $1 AND id <> $2 AND status = 'pending'
         RETURNING id, worker_id`,
        [jobId, offerId]
      );

      return {
        workerId: offer.worker_id as string,
        jobTitle: job.title as string,
        others: others.rows as { id: string; worker_id: string }[],
      };
    });

    // Remove from every live feed, tell the hired worker, and tell everyone else
    broadcastJobAccepted({ jobId, job: await fetchJobView(jobId) });
    notify(
      outcome.workerId,
      'offer:accepted',
      { jobId, jobTitle: outcome.jobTitle, offerId, job: await fetchJobView(jobId, outcome.workerId) },
      { title: "You're hired!", body: `The customer chose you for "${outcome.jobTitle}". Open it for the address and contact.` }
    );
    for (const other of outcome.others) {
      notify(
        other.worker_id,
        'offer:updated',
        { jobId, jobTitle: outcome.jobTitle, offerId: other.id, status: 'not_selected' },
        { title: 'Another worker was chosen', body: `"${outcome.jobTitle}" is no longer available.` }
      );
    }

    return res.status(200).json({
      message: 'Worker hired',
      job: await fetchJobView(jobId, posterId),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Accept offer error:', error);
    return res.status(500).json({ error: 'Internal server error while accepting offer' });
  }
};

/**
 * POST /api/jobs/:id/offers/:offerId/decline
 */
export const declineOffer = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: jobId, offerId } = req.params;
    if (!UUID_REGEX.test(jobId) || !UUID_REGEX.test(offerId)) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const result = await query(
      `SELECT o.worker_id, o.status, j.poster_id, j.title
       FROM job_offers o JOIN jobs j ON j.id = o.job_id
       WHERE o.id = $1 AND o.job_id = $2`,
      [offerId, jobId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    const offer = result.rows[0];

    if (offer.poster_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the job poster can decline offers' });
    }

    const updated = await query(
      `UPDATE job_offers SET status = 'declined', updated_at = NOW()
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [offerId]
    );
    if (updated.rowCount === 0) {
      return res.status(409).json({ error: 'This offer is no longer pending' });
    }

    notify(
      offer.worker_id,
      'offer:updated',
      { jobId, jobTitle: offer.title, offerId, status: 'declined' },
      { title: 'Offer declined', body: `Your offer for "${offer.title}" was declined.` }
    );

    return res.status(200).json({ message: 'Offer declined', offer: await fetchOffer(offerId) });
  } catch (error) {
    console.error('Decline offer error:', error);
    return res.status(500).json({ error: 'Internal server error while declining offer' });
  }
};

/**
 * POST /api/jobs/:id/offers/withdraw
 * The worker takes back their pending offer.
 */
export const withdrawOffer = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: jobId } = req.params;
    if (!UUID_REGEX.test(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updated = await query(
      `UPDATE job_offers o SET status = 'withdrawn', updated_at = NOW()
       FROM jobs j
       WHERE o.job_id = $1 AND o.worker_id = $2 AND o.status = 'pending' AND j.id = o.job_id
       RETURNING o.id, j.poster_id, j.title`,
      [jobId, req.user.id]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'You have no pending offer on this job' });
    }

    const { id: offerId, poster_id: posterId, title } = updated.rows[0];
    notifyUser(posterId, 'offer:withdrawn', { jobId, jobTitle: title, offerId });

    return res.status(200).json({ message: 'Offer withdrawn' });
  } catch (error) {
    console.error('Withdraw offer error:', error);
    return res.status(500).json({ error: 'Internal server error while withdrawing offer' });
  }
};

/**
 * GET /api/offers/mine
 * The worker's recent offers with a summary of each job.
 */
export const getMyOffers = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await query(
      `SELECT o.id, o.job_id, o.price, o.message, o.eta_minutes, o.status, o.created_at, o.updated_at,
         json_build_object(
           'id', j.id,
           'title', j.title,
           'status', j.status,
           'budget', j.budget,
           'location_text', j.location_text,
           'category_slug', j.category_slug,
           'category_name', c.name,
           'created_at', j.created_at,
           'poster', json_build_object('id', u.id, 'name', u.name, 'rating_avg', u.rating_avg, 'rating_count', u.rating_count)
         ) AS job
       FROM job_offers o
       JOIN jobs j ON j.id = o.job_id
       JOIN categories c ON c.slug = j.category_slug
       JOIN users u ON u.id = j.poster_id
       WHERE o.worker_id = $1 AND o.status IN ('pending', 'declined', 'not_selected')
       ORDER BY (o.status = 'pending') DESC, o.updated_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    return res.status(200).json({ offers: result.rows });
  } catch (error) {
    console.error('Get my offers error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching offers' });
  }
};
