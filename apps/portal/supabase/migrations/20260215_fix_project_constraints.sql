-- ============================================================
-- Fix Project Constraints + Schema Additions
-- Date: 2026-02-15
-- Depends on: 20260215_departments.sql, 20260215_intelligence_core.sql,
--             20260215_cross_department.sql
--
-- Fixes:
--   1. projects.status CHECK — add department-specific statuses
--   2. projects.type CHECK — add department-specific types
--   3. signals.views → BIGINT (YouTube videos exceed INTEGER max)
--   4. signals: add published_at, source_url columns
--   5. project_research: add reviewed_by, reviewed_at, revision_notes
--   6. upsert_signal() RPC — handle published_at and source_url
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Fix projects.status CHECK constraint
-- ============================================================

ALTER TABLE projects DROP CONSTRAINT projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (
  status IN (
    -- Creative (existing)
    'requested', 'narrative_review', 'brand_collection',
    'in_progress', 'review', 'revision', 'live', 'on_hold',
    -- Strategy
    'research_queued', 'researching', 'research_review', 'research_complete',
    -- Intelligence
    'monitoring', 'paused', 'analyzing'
  )
);

-- ============================================================
-- 2. Fix projects.type CHECK constraint
-- ============================================================

ALTER TABLE projects DROP CONSTRAINT projects_type_check;

ALTER TABLE projects ADD CONSTRAINT projects_type_check CHECK (
  type IN (
    -- Creative (existing)
    'investor_pitch', 'client_proposal', 'research_report', 'website', 'other',
    -- Intelligence
    'trend_monitor', 'white_space_analysis', 'influencer_tracker',
    -- Strategy
    'market_research', 'competitive_analysis', 'funding_landscape'
  )
);

-- ============================================================
-- 3. signals.views → BIGINT
-- ============================================================

ALTER TABLE signals ALTER COLUMN views TYPE BIGINT;

-- ============================================================
-- 4. signals: add published_at and source_url
-- ============================================================

ALTER TABLE signals ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN source_url TEXT;

COMMENT ON COLUMN signals.published_at IS
  'Original publish date on the platform (not ingestion time).';

COMMENT ON COLUMN signals.source_url IS
  'Direct URL to the content on the source platform.';

-- ============================================================
-- 5. project_research: add review fields
-- ============================================================

ALTER TABLE project_research ADD COLUMN reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE project_research ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE project_research ADD COLUMN revision_notes TEXT;

COMMENT ON COLUMN project_research.reviewed_by IS
  'User who approved or rejected this research version.';

-- ============================================================
-- 6. Update upsert_signal() RPC to handle new fields
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_signal(p_signal JSONB)
RETURNS JSONB AS $$
DECLARE
  v_result signals%ROWTYPE;
  v_old_upvotes INTEGER;
  v_old_comments INTEGER;
  v_old_views BIGINT;
  v_old_likes INTEGER;
  v_delta JSONB;
BEGIN
  -- Try to find existing signal
  SELECT upvotes, comments, views, likes
    INTO v_old_upvotes, v_old_comments, v_old_views, v_old_likes
    FROM signals
    WHERE source = p_signal->>'source'
      AND source_id = p_signal->>'source_id';

  IF FOUND THEN
    -- Calculate engagement delta
    v_delta := jsonb_build_object(
      'upvotes_delta', COALESCE((p_signal->>'upvotes')::INTEGER, 0) - COALESCE(v_old_upvotes, 0),
      'comments_delta', COALESCE((p_signal->>'comments')::INTEGER, 0) - COALESCE(v_old_comments, 0),
      'views_delta', COALESCE((p_signal->>'views')::BIGINT, 0) - COALESCE(v_old_views, 0),
      'likes_delta', COALESCE((p_signal->>'likes')::INTEGER, 0) - COALESCE(v_old_likes, 0),
      'measured_at', to_jsonb(now())
    );

    -- Update existing signal
    UPDATE signals SET
      title = COALESCE(p_signal->>'title', title),
      content_snippet = COALESCE(p_signal->>'content_snippet', content_snippet),
      author = COALESCE(p_signal->>'author', author),
      upvotes = COALESCE((p_signal->>'upvotes')::INTEGER, upvotes),
      comments = COALESCE((p_signal->>'comments')::INTEGER, comments),
      views = COALESCE((p_signal->>'views')::BIGINT, views),
      likes = COALESCE((p_signal->>'likes')::INTEGER, likes),
      engagement_delta = v_delta,
      pull_count = pull_count + 1,
      published_at = COALESCE((p_signal->>'published_at')::TIMESTAMPTZ, published_at),
      source_url = COALESCE(p_signal->>'source_url', source_url),
      updated_at = now()
    WHERE source = p_signal->>'source'
      AND source_id = p_signal->>'source_id'
    RETURNING * INTO v_result;
  ELSE
    -- Insert new signal
    INSERT INTO signals (
      source, source_id, title, content_snippet, author,
      subreddit, channel_id,
      upvotes, comments, views, likes,
      content_hash, published_at, source_url
    ) VALUES (
      p_signal->>'source',
      p_signal->>'source_id',
      p_signal->>'title',
      p_signal->>'content_snippet',
      p_signal->>'author',
      p_signal->>'subreddit',
      p_signal->>'channel_id',
      COALESCE((p_signal->>'upvotes')::INTEGER, 0),
      COALESCE((p_signal->>'comments')::INTEGER, 0),
      COALESCE((p_signal->>'views')::BIGINT, 0),
      COALESCE((p_signal->>'likes')::INTEGER, 0),
      p_signal->>'content_hash',
      (p_signal->>'published_at')::TIMESTAMPTZ,
      p_signal->>'source_url'
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMIT;
