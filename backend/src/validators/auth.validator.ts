import { z } from 'zod';

export const sendOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 digits')
    .max(25, 'Phone number cannot exceed 25 characters')
    .regex(/^[+0-9\s\-()]+$/, 'Invalid phone number format'),
});

export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 digits')
    .max(25, 'Phone number cannot exceed 25 characters')
    .regex(/^[+0-9\s\-()]+$/, 'Invalid phone number format'),
  otp: z
    .string()
    .trim()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^[0-9]{6}$/, 'Verification code must contain digits only'),
});

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 digits')
    .max(25, 'Phone number cannot exceed 25 characters')
    .regex(/^[+0-9\s\-()]+$/, 'Invalid phone number format')
    .optional()
    .or(z.literal(''))
    .nullable(),
  otp: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Verification code must be 6 digits')
    .optional()
    .or(z.literal(''))
    .nullable(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
