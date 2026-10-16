/**
 * Migration: account deletion and worker reliability
 * - users.deleted_at: account deleted by its owner (personal data removed, history kept anonymously)
 * - job_releases: every time a hired worker backed out of a job (for reliability stats)
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

    CREATE TABLE job_releases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(300),
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX idx_job_releases_worker ON job_releases(worker_id);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS job_releases;
    ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
  `);
};
