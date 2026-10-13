import { env } from '../config/env.js';
import { withTransaction } from '../config/db.js';
import { fetchJobView } from './jobView.service.js';
import { notify } from './notify.service.js';
import { broadcastJobStatusUpdated } from '../sockets/socket.js';

export const EXPIRED_REASON = 'Expired: no worker was hired in time';

/**
 * Closes open requests nobody was hired for: "as soon as possible" requests after JOB_OPEN_HOURS,
 * scheduled requests two hours after their requested time. Safe to run from several instances
 * (each job can only move out of 'open' once).
 */
export const expireStaleJobs = async (): Promise<number> => {
  const outcome = await withTransaction(async (client) => {
    const jobs = await client.query(
      `UPDATE jobs
       SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1, updated_at = NOW()
       WHERE status = 'open' AND (
         (scheduled_for IS NULL AND created_at < NOW() - make_interval(hours => $2::int))
         OR (scheduled_for IS NOT NULL AND scheduled_for < NOW() - INTERVAL '2 hours')
       )
       RETURNING id, poster_id, title`,
      [EXPIRED_REASON, env.JOB_OPEN_HOURS]
    );
    if (jobs.rowCount === 0) return null;

    const offers = await client.query(
      `UPDATE job_offers SET status = 'not_selected', updated_at = NOW()
       WHERE job_id = ANY($1::uuid[]) AND status = 'pending'
       RETURNING id, job_id, worker_id`,
      [jobs.rows.map((j) => j.id)]
    );
    return { jobs: jobs.rows, offers: offers.rows };
  });

  if (!outcome) return 0;

  const titles = new Map(outcome.jobs.map((j) => [j.id as string, j.title as string]));
  for (const job of outcome.jobs) {
    broadcastJobStatusUpdated({ jobId: job.id, status: 'cancelled', job: await fetchJobView(job.id) });
    notify(
      job.poster_id,
      'job:expired',
      { jobId: job.id, jobTitle: job.title },
      { title: 'Request expired', body: `"${job.title}" expired without a hire. Post it again, perhaps with a higher price or a new time.` }
    );
  }
  for (const offer of outcome.offers) {
    notify(offer.worker_id, 'offer:updated', {
      jobId: offer.job_id,
      jobTitle: titles.get(offer.job_id),
      offerId: offer.id,
      status: 'not_selected',
      reason: 'job_expired',
    });
  }
  return outcome.jobs.length;
};

/** Runs the expiry sweep now and every 5 minutes */
export const startExpirySweep = () => {
  const run = () =>
    expireStaleJobs()
      .then((n) => n > 0 && console.log(`⏰ Expired ${n} open request(s) with no hire`))
      .catch((err) => console.error('Expiry sweep error:', err));
  run();
  return setInterval(run, 5 * 60 * 1000).unref();
};
