import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test' || process.env.VITEST === 'true';

// Validate JWT Secret
const DEFAULT_DEV_JWT_SECRET = 'plugy_dev_secret_key_change_in_production_min_32_chars';
let jwtSecret = process.env.JWT_SECRET;

if (isProduction) {
  if (!jwtSecret || jwtSecret === DEFAULT_DEV_JWT_SECRET || jwtSecret.length < 32) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: In production, JWT_SECRET must be set via environment variable and must be at least 32 characters long.'
    );
  }
} else {
  if (!jwtSecret) {
    jwtSecret = DEFAULT_DEV_JWT_SECRET;
  }
}

// Database configuration
const databaseUrl = process.env.DATABASE_URL;
if (isProduction && !databaseUrl) {
  throw new Error('FATAL CONFIGURATION ERROR: In production, DATABASE_URL must be set via environment variable.');
}

// CORS: comma-separated list of allowed browser origins (e.g. "https://plugy.app,https://www.plugy.app")
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Express "trust proxy": number of reverse-proxy hops in front of the app (e.g. 1 for nginx).
// Required behind a proxy so rate limiting keys on the real client IP instead of the proxy's.
const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
};

export const env = {
  NODE_ENV,
  isProduction,
  isTest,
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: databaseUrl || 'postgres://plugy:plugy_secret@localhost:5434/plugy',
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: corsOrigins[0],
  CORS_ORIGINS: corsOrigins,
  TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY),
  COOKIE_SECURE: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  RATE_LIMIT_ENABLED: isTest ? false : true,
  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '15', 10),
  RATE_LIMIT_JOBS_MAX: parseInt(process.env.RATE_LIMIT_JOBS_MAX || '30', 10),
  RATE_LIMIT_OFFERS_MAX: parseInt(process.env.RATE_LIMIT_OFFERS_MAX || '60', 10),

  // Number shown on the in-app safety screen (112 reaches emergency services from most mobile networks)
  EMERGENCY_NUMBER: (process.env.EMERGENCY_NUMBER || '112').trim(),

  // Accounts allowed to review safety reports and suspend users (comma-separated emails)
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Web Push (VAPID). Generate once with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:support@plugy.app',

  // Open "as soon as possible" requests expire after this many hours without a hire;
  // scheduled requests expire 2 hours after their requested time.
  JOB_OPEN_HOURS: parseInt(process.env.JOB_OPEN_HOURS || '72', 10),
};

export const isAdminEmail = (email: string | null | undefined): boolean =>
  !!email && env.ADMIN_EMAILS.includes(email.toLowerCase());

/**
 * Shared origin policy for Express CORS and Socket.IO.
 * Development/test allow every origin; production only allows configured origins.
 * Requests without an Origin header (same-origin GETs, curl, server-to-server) are always allowed.
 */
export const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!env.isProduction || !origin) return true;
  return env.CORS_ORIGINS.includes(origin);
};
