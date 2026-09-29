import { z } from 'zod';

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
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
