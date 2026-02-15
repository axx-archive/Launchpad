-- Migration: 20260216_signals_schema_fix.sql
-- Purpose: Add missing columns (published_at, source_url) to signals table
--          and expand source CHECK constraint to include 'hackernews'.

BEGIN;

-- Add published_at column for original publish time from source platform
ALTER TABLE signals ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Add source_url column for direct link to the original content
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN signals.published_at IS
  'Original publish time from source platform. Full TIMESTAMPTZ precision for velocity animation calculations.';

-- Index for time-based queries and velocity calculations
CREATE INDEX IF NOT EXISTS idx_signals_published_at ON signals(published_at DESC);

-- Expand source CHECK to include hackernews
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_check;
ALTER TABLE signals ADD CONSTRAINT signals_source_check
  CHECK (source IN ('reddit', 'youtube', 'x', 'rss', 'hackernews'));

COMMIT;

-- === ROLLBACK ===
-- ALTER TABLE signals DROP COLUMN IF EXISTS published_at;
-- ALTER TABLE signals DROP COLUMN IF EXISTS source_url;
-- DROP INDEX IF EXISTS idx_signals_published_at;
-- ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_check;
-- ALTER TABLE signals ADD CONSTRAINT signals_source_check
--   CHECK (source IN ('reddit', 'youtube', 'x', 'rss'));
