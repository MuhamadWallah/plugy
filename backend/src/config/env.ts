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

export const env = {
  NODE_ENV,
  isProduction,
  isTest,
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: databaseUrl || 'postgres://plugy:plugy_secret@localhost:5434/plugy',
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5174',
  COOKIE_SECURE: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  RATE_LIMIT_ENABLED: isTest ? false : true,
  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '15', 10),
  RATE_LIMIT_JOBS_MAX: parseInt(process.env.RATE_LIMIT_JOBS_MAX || '30', 10),
};
