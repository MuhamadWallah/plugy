import { query } from '../config/db.js';

/**
 * Public coordinates are rounded to 2 decimals (~1 km) so a poster's home address
 * is never exposed on the open feed. The poster and the hired worker see the exact pin.
 */
export const approxCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const exactCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const personJson = (alias: string) => `json_build_object(
  'id', ${alias}.id,
  'name', ${alias}.name,
  'avatar_url', ${alias}.avatar_url,
  'rating_avg', ${alias}.rating_avg,
  'rating_count', ${alias}.rating_count,
  'phone', ${alias}.phone,
  'phone_verified', ${alias}.phone_verified
)`;

/**
 * Base SELECT for job rows (alias j). Includes private fields (phones, exact coordinates,
 * cancel reason) that toJobView() strips according to who is looking.
 */
export const JOB_SELECT_COLUMNS = `
  j.id, j.poster_id, j.worker_id, j.category_slug, j.title, j.description,
  j.location_text, j.latitude, j.longitude, j.budget, j.agreed_price, j.status,
  j.scheduled_for, j.payment_method,
  j.created_at, j.accepted_at, j.en_route_at, j.arrived_at, j.started_at, j.completed_at,
  j.cancelled_at, j.cancel_reason, j.cancelled_by, j.updated_at,
  ${personJson('u')} AS poster,
  CASE WHEN w.id IS NOT NULL THEN ${personJson('w')} ELSE NULL END AS worker,
  c.name AS category_name,
  c.icon AS category_icon,
  (SELECT COUNT(*)::int FROM job_offers o WHERE o.job_id = j.id AND o.status = 'pending') AS offer_count
`;

export const JOB_FROM = `
  FROM jobs j
  JOIN users u ON j.poster_id = u.id
  JOIN categories c ON j.category_slug = c.slug
  LEFT JOIN users w ON j.worker_id = w.id
`;

type Person = { id: string; phone?: string | null; [key: string]: unknown } | null;
type JobRow = Record<string, unknown> & {
  poster_id: string;
  worker_id: string | null;
  poster: Person;
  worker: Person;
};

/**
 * Shapes a job row for a specific viewer:
 * - everyone: approximate coordinates, no phone numbers, no cancel details
 * - poster / hired worker: exact coordinates, cancel details, and the *other* party's phone
 * - poster only: number of pending offers
 */
export const toJobView = (row: JobRow, viewerId?: string | null) => {
  const isPoster = !!viewerId && viewerId === row.poster_id;
  const isWorker = !!viewerId && !!row.worker_id && viewerId === row.worker_id;
  const isParticipant = isPoster || isWorker;

  const { poster, worker, ...rest } = row;
  const view: Record<string, unknown> = {
    ...rest,
    latitude: isParticipant ? exactCoordinate(row.latitude) : approxCoordinate(row.latitude),
    longitude: isParticipant ? exactCoordinate(row.longitude) : approxCoordinate(row.longitude),
    location_precision: isParticipant ? 'exact' : 'approximate',
  };

  if (!isParticipant) {
    delete view.cancel_reason;
    delete view.cancelled_by;
  }
  if (!isPoster) {
    delete view.offer_count;
  }

  // Contact details are shared only between the two matched parties
  const stripPhone = (person: Person, reveal: boolean) => {
    if (!person) return person;
    const { phone, ...publicFields } = person;
    return reveal ? { ...publicFields, phone } : publicFields;
  };
  view.poster = stripPhone(poster, isWorker);
  view.worker = stripPhone(worker, isPoster);

  return view;
};

/**
 * Loads one job (with reviews) shaped for the given viewer. Returns null if it doesn't exist.
 */
export const fetchJobView = async (jobId: string, viewerId?: string | null) => {
  const result = await query(
    `SELECT ${JOB_SELECT_COLUMNS},
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
     ${JOB_FROM}
     WHERE j.id = $1`,
    [jobId]
  );
  const row = result.rows[0];
  return row ? toJobView(row as JobRow, viewerId) : null;
};

/**
 * Offer with the worker's public track record, as shown to the poster when choosing.
 */
export const OFFER_SELECT = `
  SELECT
    o.id, o.job_id, o.worker_id, o.price, o.message, o.eta_minutes, o.status, o.created_at, o.updated_at,
    json_build_object(
      'id', w.id,
      'name', w.name,
      'avatar_url', w.avatar_url,
      'rating_avg', w.rating_avg,
      'rating_count', w.rating_count,
      'phone_verified', w.phone_verified,
      'member_since', w.created_at,
      'jobs_completed', (
        SELECT COUNT(*)::int FROM jobs cj WHERE cj.worker_id = w.id AND cj.status = 'completed'
      )
    ) AS worker
  FROM job_offers o
  JOIN users w ON w.id = o.worker_id
`;

export const fetchOffer = async (offerId: string) => {
  const result = await query(`${OFFER_SELECT} WHERE o.id = $1`, [offerId]);
  return result.rows[0] || null;
};
