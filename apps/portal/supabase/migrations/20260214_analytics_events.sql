-- ============================================================
-- Analytics Events Table Migration
-- Date: 2026-02-14
-- Depends on: initial migration (projects table)
--
-- Stores analytics events from deployed PitchApp viewer scripts.
-- Public endpoint writes via service role (no RLS needed for insert).
-- Read access restricted to project members via API-level auth.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. analytics_events table
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id    text NOT NULL,
  event_type    text NOT NULL CHECK (event_type IN ('page_view', 'scroll_depth', 'session_end', 'section_view')),
  data          jsonb NOT NULL DEFAULT '{}',
  device_type   text,
  referrer      text,
  viewport_width integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Indexes for common query patterns
-- ============================================================

-- Primary query path: insights API filters by project + event type + date range
CREATE INDEX IF NOT EXISTS idx_analytics_events_project_type_created
  ON analytics_events (project_id, event_type, created_at);

-- Session grouping for unique viewer counts
CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events (project_id, session_id);

-- ============================================================
-- 3. RLS — disabled (writes via service role, reads via API auth)
-- ============================================================
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed: the analytics POST endpoint uses the admin
-- client (service role) to insert, and the insights GET endpoint
-- verifies project membership via verifyProjectAccess() before querying.

COMMIT;
