/**
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
    -- Enable pgcrypto for UUID generation
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- ==========================================
    -- 1. USERS TABLE
    -- ==========================================
    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(30),
        avatar_url TEXT,
        rating_avg NUMERIC(3, 2) DEFAULT 0.00 NOT NULL,
        rating_count INT DEFAULT 0 NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    -- ==========================================
    -- 2. REFRESH TOKENS TABLE
    -- ==========================================
    CREATE TABLE refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

    -- ==========================================
    -- 3. CATEGORIES TABLE
    -- ==========================================
    CREATE TABLE categories (
        slug VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    -- ==========================================
    -- 4. JOBS TABLE
    -- ==========================================
    CREATE TYPE job_status AS ENUM ('open', 'accepted', 'in_progress', 'completed', 'cancelled');

    CREATE TABLE jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poster_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
        category_slug VARCHAR(50) NOT NULL REFERENCES categories(slug),
        title VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        location_text VARCHAR(255) NOT NULL,
        latitude NUMERIC(10, 7),
        longitude NUMERIC(10, 7),
        budget NUMERIC(10, 2) NOT NULL CHECK (budget >= 0),
        status job_status DEFAULT 'open' NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        accepted_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        CONSTRAINT chk_poster_worker_distinct CHECK (poster_id <> worker_id)
    );

    CREATE INDEX idx_jobs_status ON jobs(status);
    CREATE INDEX idx_jobs_category ON jobs(category_slug);
    CREATE INDEX idx_jobs_poster ON jobs(poster_id);
    CREATE INDEX idx_jobs_worker ON jobs(worker_id);
    CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

    -- ==========================================
    -- 5. MESSAGES TABLE
    -- ==========================================
    CREATE TABLE messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

    CREATE INDEX idx_messages_job_chronological ON messages(job_id, created_at ASC);

    -- ==========================================
    -- 6. RATINGS TABLE
    -- ==========================================
    CREATE TABLE ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score INT NOT NULL CHECK (score >= 1 AND score <= 5),
        comment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        CONSTRAINT uq_job_rater UNIQUE (job_id, rater_id),
        CONSTRAINT chk_rater_ratee_distinct CHECK (rater_id <> ratee_id)
    );

    CREATE INDEX idx_ratings_ratee ON ratings(ratee_id);

    -- ==========================================
    -- 7. AUTO-UPDATE USER RATING TRIGGER
    -- ==========================================
    CREATE OR REPLACE FUNCTION update_user_rating()
    RETURNS TRIGGER AS $$
    BEGIN
        UPDATE users
        SET 
            rating_avg = (SELECT ROUND(AVG(score)::numeric, 2) FROM ratings WHERE ratee_id = NEW.ratee_id),
            rating_count = (SELECT COUNT(*) FROM ratings WHERE ratee_id = NEW.ratee_id),
            updated_at = NOW()
        WHERE id = NEW.ratee_id;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_after_rating_insert
    AFTER INSERT ON ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_user_rating();
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_after_rating_insert ON ratings;
    DROP FUNCTION IF EXISTS update_user_rating;
    DROP TABLE IF EXISTS ratings;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS jobs;
    DROP TYPE IF EXISTS job_status;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS users;
  `);
};
