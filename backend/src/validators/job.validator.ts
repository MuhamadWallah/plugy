import { z } from 'zod';

export const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank_transfer'] as const;

export const createJobSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(120, 'Title cannot exceed 120 characters'),
  category: z
    .string()
    .trim()
    .min(1, 'Category is required'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional()
    .default(''),
  location_text: z
    .string()
    .trim()
    .max(255, 'Location text cannot exceed 255 characters')
    .optional()
    .default('Local / To be discussed'),
  budget: z
    .union([
      z.number().positive('Budget must be a positive number'),
      z.string().regex(/^\d+(\.\d{1,2})?$/, 'Budget must be a valid positive number').transform(Number),
      z.null(),
      z.literal(''),
    ])
    .optional()
    .transform((val) => (val === '' || val === undefined ? null : val)),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  // When the job should happen; null/omitted = as soon as possible
  scheduled_for: z.coerce
    .date({ error: 'Invalid date and time' })
    .refine((d) => d.getTime() > Date.now() - 5 * 60 * 1000, 'The time must be in the future')
    .refine((d) => d.getTime() < Date.now() + 60 * 24 * 60 * 60 * 1000, 'Jobs can be scheduled up to 60 days ahead')
    .nullable()
    .optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional().default('cash'),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

const money = z.coerce
  .number({ error: 'Price must be a number' })
  .positive('Price must be greater than zero')
  .max(1_000_000, 'Price is too high')
  .transform((n) => Math.round(n * 100) / 100);

export const JOB_STATUSES = ['open', 'accepted', 'in_progress', 'completed', 'cancelled'] as const;

// GET /api/jobs query string
export const feedQuerySchema = z
  .object({
    status: z.enum(JOB_STATUSES).optional().default('open'),
    category: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius_km: z.coerce.number().positive().max(500).optional(),
    sort: z.enum(['newest', 'distance', 'budget_high', 'budget_low']).optional().default('newest'),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    message: 'lat and lng must be provided together',
  })
  .refine((q) => q.radius_km === undefined || q.lat !== undefined, {
    message: 'radius_km requires lat and lng',
  })
  .refine((q) => q.sort !== 'distance' || q.lat !== undefined, {
    message: 'sort=distance requires lat and lng',
  });

// POST /api/jobs/:id/offers: accept the posted price or counter-offer
export const offerSchema = z.object({
  price: money,
  message: z.string().trim().max(500, 'Message cannot exceed 500 characters').optional().nullable(),
  eta_minutes: z.coerce.number().int().min(0).max(10080).optional().nullable(),
});

// PATCH /api/jobs/:id/budget: raise the offered price
export const raiseBudgetSchema = z.object({
  budget: money,
});

// POST /api/jobs/:id/cancel and /release
export const reasonSchema = z.object({
  reason: z.string().trim().max(300, 'Reason cannot exceed 300 characters').optional().nullable(),
});

export const REPORT_REASONS = [
  'no_show',
  'unsafe_behavior',
  'harassment',
  'fraud_or_scam',
  'poor_quality',
  'other',
] as const;

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional().nullable(),
  job_id: z.string().uuid().optional().nullable(),
});
