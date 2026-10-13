/**
 * Migration: real-world operations
 * - jobs: requested time (ASAP or scheduled), payment method
 * - users: password change timestamp (invalidates older sessions), suspension
 * - user_reports: moderation outcome
 * - push_subscriptions: Web Push endpoints per device
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
    -- When the customer needs the job done (NULL = as soon as possible)
    ALTER TABLE jobs ADD COLUMN scheduled_for TIMESTAMPTZ;

    -- How the customer will pay the worker (settled directly between them)
    ALTER TABLE jobs ADD COLUMN payment_method VARCHAR(20) DEFAULT 'cash' NOT NULL
      CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer'));

    -- Sessions issued before this moment are rejected (password reset signs out other devices)
    ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;

    -- Moderation
    ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN suspension_reason VARCHAR(300);

    ALTER TABLE user_reports ADD COLUMN resolved_at TIMESTAMPTZ;
    ALTER TABLE user_reports ADD COLUMN resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE user_reports ADD COLUMN resolution VARCHAR(20) CHECK (resolution IN ('dismissed', 'suspended'));
    ALTER TABLE user_reports ADD COLUMN resolution_note VARCHAR(500);
    CREATE INDEX idx_user_reports_status_created ON user_reports(status, created_at DESC);

    -- Web Push subscriptions (one row per browser/device)
    CREATE TABLE push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent VARCHAR(300),
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

    -- Expiry sweep over open jobs
    CREATE INDEX idx_jobs_open_created ON jobs(created_at) WHERE status = 'open';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_jobs_open_created;
    DROP TABLE IF EXISTS push_subscriptions;
    DROP INDEX IF EXISTS idx_user_reports_status_created;
    ALTER TABLE user_reports
      DROP COLUMN IF EXISTS resolution_note,
      DROP COLUMN IF EXISTS resolution,
      DROP COLUMN IF EXISTS resolved_by,
      DROP COLUMN IF EXISTS resolved_at;
    ALTER TABLE users
      DROP COLUMN IF EXISTS suspension_reason,
      DROP COLUMN IF EXISTS suspended_at,
      DROP COLUMN IF EXISTS password_changed_at;
    ALTER TABLE jobs
      DROP COLUMN IF EXISTS payment_method,
      DROP COLUMN IF EXISTS scheduled_for;
  `);
};
