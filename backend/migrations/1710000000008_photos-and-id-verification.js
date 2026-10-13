/**
 * Migration: photos and identity verification
 * - job_photos: up to 4 photos per job (public, re-encoded on upload)
 * - id_verifications: ID document + selfie submitted by a worker, reviewed by an admin (private files)
 * - users.id_verified_at: set when an admin approves a verification
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
    CREATE TABLE job_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        file_name VARCHAR(100) NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX idx_job_photos_job ON job_photos(job_id, created_at);

    ALTER TABLE users ADD COLUMN id_verified_at TIMESTAMPTZ;

    CREATE TABLE id_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('national_id', 'passport', 'drivers_license')),
        document_file VARCHAR(100) NOT NULL,
        selfie_file VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        rejection_reason VARCHAR(300),
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX idx_id_verifications_user ON id_verifications(user_id, created_at DESC);
    CREATE INDEX idx_id_verifications_pending ON id_verifications(created_at) WHERE status = 'pending';
    -- At most one submission waiting for review per user
    CREATE UNIQUE INDEX uq_id_verifications_one_pending ON id_verifications(user_id) WHERE status = 'pending';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS id_verifications;
    ALTER TABLE users DROP COLUMN IF EXISTS id_verified_at;
    DROP TABLE IF EXISTS job_photos;
  `);
};
