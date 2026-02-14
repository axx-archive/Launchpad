-- ============================================================
-- Intelligence Velocity Scoring + RPC Functions
-- Date: 2026-02-15
-- Depends on: 20260215_intelligence_core.sql
--
-- Creates:
--   - velocity_scores table (daily scoring snapshots)
--   - upsert_signal() RPC (idempotent signal ingestion)
--   - calculate_daily_velocity() RPC (full scoring pipeline)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. velocity_scores table
-- ============================================================

CREATE TABLE velocity_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  engagement_z REAL NOT NULL DEFAULT 0,
  signal_freq_z REAL NOT NULL DEFAULT 0,
  velocity REAL NOT NULL DEFAULT 0,
  percentile REAL NOT NULL DEFAULT 0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  lifecycle TEXT NOT NULL DEFAULT 'emerging'
    CHECK (lifecycle IN ('emerging', 'peaking', 'cooling', 'evergreen', 'dormant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cluster_id, score_date)
);

COMMENT ON TABLE velocity_scores IS
  'Daily velocity scoring snapshots per cluster. One row per cluster per day.';

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX idx_vs_cluster_date ON velocity_scores(cluster_id, score_date DESC);

-- ============================================================
-- 3. RLS for velocity_scores
-- ============================================================

ALTER TABLE velocity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_velocity" ON velocity_scores
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_velocity" ON velocity_scores
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 4. upsert_signal() RPC
-- ============================================================

-- Atomic idempotent signal insert with engagement_delta calculation.
-- On conflict (source, source_id): updates engagement fields,
-- calculates delta, and increments pull_count.
--
-- Input JSONB shape:
-- {
--   "source": "reddit",
--   "source_id": "t3_abc123",
--   "title": "...",
--   "content_snippet": "...",
--   "author": "...",
--   "subreddit": "...",       -- optional
--   "channel_id": "...",      -- optional
--   "upvotes": 100,           -- optional
--   "comments": 25,           -- optional
--   "views": 5000,            -- optional
--   "likes": 200,             -- optional
--   "content_hash": "sha256..." -- optional
-- }
--
-- Returns the signal row (inserted or updated).

CREATE OR REPLACE FUNCTION upsert_signal(p_signal JSONB)
RETURNS JSONB AS $$
DECLARE
  v_result signals%ROWTYPE;
  v_old_upvotes INTEGER;
  v_old_comments INTEGER;
  v_old_views INTEGER;
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
      'views_delta', COALESCE((p_signal->>'views')::INTEGER, 0) - COALESCE(v_old_views, 0),
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
      views = COALESCE((p_signal->>'views')::INTEGER, views),
      likes = COALESCE((p_signal->>'likes')::INTEGER, likes),
      engagement_delta = v_delta,
      pull_count = pull_count + 1,
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
      content_hash
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
      COALESCE((p_signal->>'views')::INTEGER, 0),
      COALESCE((p_signal->>'likes')::INTEGER, 0),
      p_signal->>'content_hash'
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION upsert_signal(JSONB) IS
  'Atomic idempotent signal ingestion. Inserts new or updates existing with engagement delta calculation.';

-- ============================================================
-- 5. calculate_daily_velocity() RPC
-- ============================================================

-- Full velocity scoring pipeline for a given date:
-- 1. Calculate raw engagement scores per active cluster (engagement deltas from signals in last 24h)
-- 2. Calculate signal frequency per cluster (new signals in last 24h)
-- 3. Compute z-scores for both dimensions
-- 4. Blend: velocity = 0.7 * engagement_z + 0.3 * signal_freq_z
-- 5. Compute percentile ranks
-- 6. Assign lifecycle based on rules
-- 7. Propagate to trend_clusters table
-- 8. Insert daily snapshots into velocity_scores

CREATE OR REPLACE FUNCTION calculate_daily_velocity(p_date DATE)
RETURNS JSONB AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_avg_engagement REAL;
  v_stddev_engagement REAL;
  v_avg_freq REAL;
  v_stddev_freq REAL;
  v_cluster_count INTEGER;
  v_rec RECORD;
BEGIN
  v_window_start := p_date::TIMESTAMPTZ;
  v_window_end := (p_date + INTERVAL '1 day')::TIMESTAMPTZ;

  -- Create temp table with raw scores per cluster
  CREATE TEMP TABLE _cluster_raw ON COMMIT DROP AS
  SELECT
    tc.id AS cluster_id,
    tc.first_seen_at,
    -- Sum engagement deltas from signals assigned to this cluster in the window
    COALESCE(SUM(
      COALESCE((s.engagement_delta->>'upvotes_delta')::REAL, 0) +
      COALESCE((s.engagement_delta->>'comments_delta')::REAL, 0) * 2 +
      COALESCE((s.engagement_delta->>'views_delta')::REAL, 0) * 0.1 +
      COALESCE((s.engagement_delta->>'likes_delta')::REAL, 0)
    ), 0) AS raw_engagement,
    -- Count new signals assigned in the window
    COUNT(DISTINCT s.id) FILTER (
      WHERE s.ingested_at >= v_window_start AND s.ingested_at < v_window_end
    ) AS signal_freq
  FROM trend_clusters tc
  LEFT JOIN signal_cluster_assignments sca ON sca.cluster_id = tc.id
  LEFT JOIN signals s ON s.id = sca.signal_id
    AND s.updated_at >= v_window_start
    AND s.updated_at < v_window_end
  WHERE tc.is_active = true
    AND tc.merged_into_id IS NULL
  GROUP BY tc.id, tc.first_seen_at;

  -- Get count for percentile calculation
  SELECT COUNT(*) INTO v_cluster_count FROM _cluster_raw;

  -- If no clusters, return early
  IF v_cluster_count = 0 THEN
    RETURN jsonb_build_object('status', 'no_clusters', 'date', p_date);
  END IF;

  -- Compute z-score parameters
  SELECT AVG(raw_engagement), NULLIF(STDDEV_POP(raw_engagement), 0)
    INTO v_avg_engagement, v_stddev_engagement
    FROM _cluster_raw;

  SELECT AVG(signal_freq), NULLIF(STDDEV_POP(signal_freq), 0)
    INTO v_avg_freq, v_stddev_freq
    FROM _cluster_raw;

  -- Create scored table with z-scores, velocity, percentile, lifecycle
  CREATE TEMP TABLE _cluster_scored ON COMMIT DROP AS
  SELECT
    cr.cluster_id,
    cr.raw_engagement,
    cr.signal_freq,
    -- Z-scores (default 0 when stddev is 0)
    COALESCE((cr.raw_engagement - v_avg_engagement) / v_stddev_engagement, 0) AS engagement_z,
    COALESCE((cr.signal_freq - v_avg_freq) / v_stddev_freq, 0) AS signal_freq_z,
    -- Velocity blend
    0.7 * COALESCE((cr.raw_engagement - v_avg_engagement) / v_stddev_engagement, 0)
    + 0.3 * COALESCE((cr.signal_freq - v_avg_freq) / v_stddev_freq, 0) AS velocity,
    -- Percentile (percent_rank window)
    0::REAL AS percentile,  -- filled below
    -- Lifecycle (filled below)
    'emerging'::TEXT AS lifecycle,
    cr.first_seen_at,
    cr.signal_freq AS daily_signal_count
  FROM _cluster_raw cr;

  -- Update percentiles using window function
  UPDATE _cluster_scored cs SET
    percentile = sub.pctl
  FROM (
    SELECT
      cluster_id,
      (PERCENT_RANK() OVER (ORDER BY velocity))::REAL * 100 AS pctl
    FROM _cluster_scored
  ) sub
  WHERE cs.cluster_id = sub.cluster_id;

  -- Assign lifecycle based on rules
  UPDATE _cluster_scored SET lifecycle = CASE
    -- Emerging: < 48h old AND velocity percentile > 70
    WHEN first_seen_at > (now() - INTERVAL '48 hours') AND percentile > 70
      THEN 'emerging'
    -- Peaking: velocity percentile > 90
    WHEN percentile > 90
      THEN 'peaking'
    -- Cooling: was > 70th, now < 40th (check previous day)
    WHEN percentile < 40 AND EXISTS (
      SELECT 1 FROM velocity_scores vs
      WHERE vs.cluster_id = _cluster_scored.cluster_id
        AND vs.score_date = p_date - 1
        AND vs.percentile > 70
    )
      THEN 'cooling'
    -- Evergreen: > 14 days old AND > 1 signal/day sustained
    WHEN first_seen_at < (now() - INTERVAL '14 days') AND daily_signal_count >= 1
      THEN 'evergreen'
    -- Dormant: no new signals for 7 days
    WHEN daily_signal_count = 0 AND NOT EXISTS (
      SELECT 1 FROM signals s
      JOIN signal_cluster_assignments sca ON sca.signal_id = s.id
      WHERE sca.cluster_id = _cluster_scored.cluster_id
        AND s.ingested_at > (now() - INTERVAL '7 days')
    )
      THEN 'dormant'
    -- Default: keep emerging
    ELSE 'emerging'
  END;

  -- Insert/update velocity_scores snapshots
  INSERT INTO velocity_scores (
    cluster_id, score_date, engagement_z, signal_freq_z,
    velocity, percentile, signal_count, lifecycle
  )
  SELECT
    cluster_id, p_date, engagement_z, signal_freq_z,
    velocity, percentile, daily_signal_count, lifecycle
  FROM _cluster_scored
  ON CONFLICT (cluster_id, score_date) DO UPDATE SET
    engagement_z = EXCLUDED.engagement_z,
    signal_freq_z = EXCLUDED.signal_freq_z,
    velocity = EXCLUDED.velocity,
    percentile = EXCLUDED.percentile,
    signal_count = EXCLUDED.signal_count,
    lifecycle = EXCLUDED.lifecycle;

  -- Propagate to trend_clusters
  UPDATE trend_clusters tc SET
    velocity_score = cs.velocity,
    velocity_percentile = cs.percentile,
    lifecycle = cs.lifecycle,
    updated_at = now()
  FROM _cluster_scored cs
  WHERE tc.id = cs.cluster_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'date', p_date,
    'clusters_scored', v_cluster_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION calculate_daily_velocity(DATE) IS
  'Full velocity scoring pipeline: raw scores → z-scores → percentiles → lifecycle → propagate to trend_clusters.';

COMMIT;
