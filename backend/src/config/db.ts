import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

// Auto-enable SSL for managed cloud databases in production (AWS RDS, Neon, Supabase)
const useSSL = process.env.PGSSL === 'true' || 
  (env.isProduction && !env.DATABASE_URL.includes('localhost') && !env.DATABASE_URL.includes('postgres:5432'));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);
