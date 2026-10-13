import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';

const availabilitySchema = z
  .object({
    available: z.boolean(),
    categories: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
    radius_km: z.coerce.number().int().min(1).max(50).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    location_label: z.string().trim().max(255).nullable().optional(),
    // How long to stay online before switching off automatically
    hours: z.coerce.number().int().min(1).max(24).optional().default(10),
  })
  .refine((v) => !v.available || (v.categories && v.categories.length > 0), {
    message: 'Choose at least one kind of work to get job alerts',
    path: ['categories'],
  })
  .refine((v) => !v.available || (typeof v.latitude === 'number' && typeof v.longitude === 'number'), {
    message: 'Share your location (or pick an area) to get nearby job alerts',
    path: ['latitude'],
  });

const shape = (row: Record<string, unknown> | undefined) => {
  if (!row) {
    return { available: false, categories: [], radius_km: 10, location_label: null, available_until: null, has_location: false };
  }
  const until = row.available_until ? new Date(row.available_until as string) : null;
  return {
    available: Boolean(row.is_available) && !!until && until.getTime() > Date.now(),
    categories: row.categories as string[],
    radius_km: row.radius_km as number,
    location_label: row.location_label as string | null,
    available_until: until,
    has_location: row.latitude !== null && row.longitude !== null,
  };
};

/**
 * GET /api/workers/me/availability
 */
export const getMyAvailability = async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT is_available, categories, radius_km, location_label, available_until, latitude, longitude
       FROM worker_availability WHERE user_id = $1`,
      [req.user!.id]
    );
    return res.status(200).json({ availability: shape(rows[0]) });
  } catch (error) {
    console.error('Get availability error:', error);
    return res.status(500).json({ error: 'Internal server error while loading availability' });
  }
};

/**
 * PUT /api/workers/me/availability
 * Go online (categories, location, distance, hours) or offline. Calling it again while online
 * refreshes the location and extends the time window.
 */
export const updateMyAvailability = async (req: Request, res: Response) => {
  try {
    const parsed = availabilitySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Validation failed',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const v = parsed.data;
    const userId = req.user!.id;

    if (!v.available) {
      const { rows } = await query(
        `INSERT INTO worker_availability (user_id, is_available, available_until)
         VALUES ($1, FALSE, NULL)
         ON CONFLICT (user_id) DO UPDATE SET is_available = FALSE, available_until = NULL, updated_at = NOW()
         RETURNING is_available, categories, radius_km, location_label, available_until, latitude, longitude`,
        [userId]
      );
      return res.status(200).json({ message: "You're offline. Job alerts are paused.", availability: shape(rows[0]) });
    }

    const categories = [...new Set(v.categories!.map((c) => c.toLowerCase()))];
    const known = await query('SELECT slug FROM categories WHERE slug = ANY($1) AND is_active = TRUE', [categories]);
    if (known.rows.length !== categories.length) {
      return res.status(400).json({ error: 'Unknown work category' });
    }

    const { rows } = await query(
      `INSERT INTO worker_availability
         (user_id, is_available, categories, latitude, longitude, location_label, radius_km, available_until, updated_at)
       VALUES ($1, TRUE, $2, $3, $4, $5, $6, NOW() + make_interval(hours => $7::int), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         is_available = TRUE, categories = EXCLUDED.categories, latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude, location_label = EXCLUDED.location_label,
         radius_km = EXCLUDED.radius_km, available_until = EXCLUDED.available_until, updated_at = NOW()
       RETURNING is_available, categories, radius_km, location_label, available_until, latitude, longitude`,
      [userId, categories, v.latitude, v.longitude, v.location_label ?? null, v.radius_km ?? 10, v.hours]
    );

    return res.status(200).json({ message: "You're online. New jobs nearby will be sent to you.", availability: shape(rows[0]) });
  } catch (error) {
    console.error('Update availability error:', error);
    return res.status(500).json({ error: 'Internal server error while updating availability' });
  }
};
