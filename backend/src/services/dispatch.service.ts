import { query } from '../config/db.js';
import { notify } from './notify.service.js';
import { env } from '../config/env.js';

/** Maximum workers alerted per job (closest first) */
const MAX_ALERTS_PER_JOB = 50;

/**
 * Alerts online workers who do this kind of work and are within their chosen distance of the
 * job's approximate location. Skips the poster, suspended accounts, and workers who already
 * made an offer. Returns the ids of the workers alerted.
 */
export const alertNearbyWorkers = async (jobId: string): Promise<string[]> => {
  const distance = `(
    6371 * 2 * ASIN(LEAST(1, SQRT(
      POWER(SIN(RADIANS(ROUND(j.latitude, 2)::float8 - w.latitude::float8) / 2), 2) +
      COS(RADIANS(w.latitude::float8)) * COS(RADIANS(ROUND(j.latitude, 2)::float8)) *
      POWER(SIN(RADIANS(ROUND(j.longitude, 2)::float8 - w.longitude::float8) / 2), 2)
    )))
  )`;

  const { rows } = await query(
    `SELECT w.user_id, ${distance} AS distance_km,
            j.title, j.budget, j.scheduled_for, c.name AS category_name
     FROM jobs j
     JOIN categories c ON c.slug = j.category_slug
     JOIN worker_availability w
       ON w.is_available AND w.available_until > NOW()
      AND j.category_slug = ANY(w.categories)
      AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
     JOIN users u ON u.id = w.user_id AND u.suspended_at IS NULL
     WHERE j.id = $1
       AND j.status = 'open'
       AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL
       AND w.user_id <> j.poster_id
       AND (NOT (j.category_slug = ANY($2::text[])) OR u.id_verified_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM job_offers o WHERE o.job_id = j.id AND o.worker_id = w.user_id)
       AND ${distance} <= w.radius_km
     ORDER BY distance_km ASC
     LIMIT ${MAX_ALERTS_PER_JOB}`,
    [jobId, env.ID_REQUIRED_CATEGORIES]
  );

  for (const row of rows) {
    const km = Math.round(Number(row.distance_km) * 10) / 10;
    const away = km < 1 ? 'under 1 km away' : `${km} km away`;
    const price = row.budget !== null ? `$${Number(row.budget).toFixed(2)}` : 'Open to offers';
    notify(
      row.user_id,
      'job:nearby',
      { jobId, jobTitle: row.title, categoryName: row.category_name, budget: row.budget, distanceKm: km },
      {
        title: `New ${row.category_name.toLowerCase()} job · ${price}`,
        body: `"${row.title}", ${away}${row.scheduled_for ? ' (scheduled)' : ''}. Tap to send an offer.`,
      }
    );
  }

  return rows.map((r) => r.user_id as string);
};

/** Fire-and-forget wrapper for request handlers */
export const alertNearbyWorkersInBackground = (jobId: string) => {
  alertNearbyWorkers(jobId).catch((error) => console.error('Nearby worker alert error:', error));
};
