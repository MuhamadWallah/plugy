/**
 * Migration: InDrive-style marketplace flow
 * - job_offers: workers accept the posted price or counter-offer; the poster chooses
 * - agreed price, arrival milestones (on the way / arrived / started), cancellation reason on jobs
 * - user_reports: safety reports between users
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
    -- ==========================================
    -- 1. OFFERS (bids)
    -- ==========================================
    -- pending      : waiting for the poster's decision
    -- accepted     : chosen by the poster (job assigned to this worker)
    -- declined     : explicitly declined by the poster
    -- not_selected : another offer was chosen (restored to pending if the job reopens)
    -- withdrawn    : withdrawn by the worker
    CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'declined', 'not_selected', 'withdrawn');

    CREATE TABLE job_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
        message TEXT,
        eta_minutes INT CHECK (eta_minutes IS NULL OR (eta_minutes >= 0 AND eta_minutes <= 10080)),
        status offer_status DEFAULT 'pending' NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        CONSTRAINT uq_job_offer_worker UNIQUE (job_id, worker_id)
    );

    CREATE INDEX idx_job_offers_job_status ON job_offers(job_id, status);
    CREATE INDEX idx_job_offers_worker ON job_offers(worker_id, status);

    -- ==========================================
    -- 2. JOB LIFECYCLE DETAILS
    -- ==========================================
    ALTER TABLE jobs ADD COLUMN agreed_price NUMERIC(10, 2);
    ALTER TABLE jobs ADD COLUMN en_route_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN arrived_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN started_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN cancelled_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN cancel_reason VARCHAR(300);
    ALTER TABLE jobs ADD COLUMN cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;

    -- Existing assigned jobs agreed on the posted budget
    UPDATE jobs SET agreed_price = budget WHERE worker_id IS NOT NULL AND agreed_price IS NULL;

    -- Nearby search over open jobs
    CREATE INDEX idx_jobs_open_location ON jobs(latitude, longitude) WHERE status = 'open';

    -- ==========================================
    -- 3. SAFETY REPORTS
    -- ==========================================
    CREATE TABLE user_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
        reason VARCHAR(40) NOT NULL,
        details TEXT,
        status VARCHAR(20) DEFAULT 'open' NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        CONSTRAINT chk_report_not_self CHECK (reporter_id <> reported_user_id)
    );

    CREATE INDEX idx_user_reports_reported ON user_reports(reported_user_id, status);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS user_reports;
    DROP INDEX IF EXISTS idx_jobs_open_location;
    ALTER TABLE jobs
      DROP COLUMN IF EXISTS cancelled_by,
      DROP COLUMN IF EXISTS cancel_reason,
      DROP COLUMN IF EXISTS cancelled_at,
      DROP COLUMN IF EXISTS started_at,
      DROP COLUMN IF EXISTS arrived_at,
      DROP COLUMN IF EXISTS en_route_at,
      DROP COLUMN IF EXISTS agreed_price;
    DROP TABLE IF EXISTS job_offers;
    DROP TYPE IF EXISTS offer_status;
  `);
};
