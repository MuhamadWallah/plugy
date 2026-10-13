/**
 * Migration: worker "online" mode
 * Workers choose the categories they do, where they are and how far they travel, and for how
 * long they're available. New matching jobs nearby are pushed to them.
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
    CREATE TABLE worker_availability (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        is_available BOOLEAN DEFAULT FALSE NOT NULL,
        -- Skills; kept after going offline so the next "go online" is one tap
        categories VARCHAR(50)[] DEFAULT '{}' NOT NULL,
        -- Last known position while online (never exposed through the API)
        latitude NUMERIC(10, 7),
        longitude NUMERIC(10, 7),
        location_label VARCHAR(255),
        radius_km INT DEFAULT 10 NOT NULL CHECK (radius_km BETWEEN 1 AND 50),
        available_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    CREATE INDEX idx_worker_availability_online ON worker_availability(available_until) WHERE is_available;
    CREATE INDEX idx_worker_availability_categories ON worker_availability USING GIN (categories);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS worker_availability;`);
};
