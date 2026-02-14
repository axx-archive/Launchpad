-- ============================================================
-- Intelligence Core Tables Migration
-- Date: 2026-02-15
-- Depends on: 20260215_departments.sql
--
-- Creates the Intelligence department's core data model:
--   - trend_clusters (LLM-identified cultural trends)
--   - signals (raw content from platforms)
--   - signal_cluster_assignments (M:N junction)
--   - entities (named entities extracted from signals)
--   - entity_signal_links (entities ↔ signals junction)
--   - intelligence_briefs (generated reports)
--   - api_quota_tracking (external API rate limits)
--   - has_intelligence_access() RLS helper
-- ============================================================

BEGIN;

-- ============================================================
-- 1. trend_clusters
-- ============================================================

CREATE TABLE trend_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  summary TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  lifecycle TEXT NOT NULL DEFAULT 'emerging'
    CHECK (lifecycle IN ('emerging', 'peaking', 'cooling', 'evergreen', 'dormant')),
  velocity_score REAL DEFAULT 0,
  velocity_percentile REAL DEFAULT 0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_signal_at TIMESTAMPTZ,
  merged_into_id UUID REFERENCES trend_clusters(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE trend_clusters IS
  'LLM-identified cultural trends. Global platform resource, not project-scoped.';

COMMENT ON COLUMN trend_clusters.merged_into_id IS
  'Self-reference: when two clusters merge, the absorbed cluster points to the surviving one.';

-- ============================================================
-- 2. signals
-- ============================================================

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('reddit', 'youtube', 'x', 'rss')),
  source_id TEXT NOT NULL,
  title TEXT,
  content_snippet TEXT,
  author TEXT,
  subreddit TEXT,
  channel_id TEXT,
  upvotes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  engagement_delta JSONB DEFAULT '{}',
  pull_count INTEGER NOT NULL DEFAULT 1,
  is_clustered BOOLEAN NOT NULL DEFAULT false,
  content_hash TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE signals IS
  'Raw content items pulled from external platforms (Reddit, YouTube, X, RSS).';

COMMENT ON COLUMN signals.source_id IS
  'Platform-specific ID (e.g., Reddit t3_xxxxx). Unique per source.';

COMMENT ON COLUMN signals.engagement_delta IS
  'Change in engagement metrics since last pull — computed on re-pull.';

COMMENT ON COLUMN signals.content_hash IS
  'SHA-256 hash of title+content for cross-source deduplication.';

-- ============================================================
-- 3. signal_cluster_assignments (M:N junction)
-- ============================================================

CREATE TABLE signal_cluster_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  assigned_by TEXT NOT NULL DEFAULT 'llm'
    CHECK (assigned_by IN ('llm', 'manual', 'merge')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id, cluster_id)
);

COMMENT ON TABLE signal_cluster_assignments IS
  'Many-to-many: signals can belong to multiple clusters with confidence scores.';

-- ============================================================
-- 4. entities
-- ============================================================

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('person', 'brand', 'product', 'event', 'place')),
  normalized_name TEXT NOT NULL,
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, entity_type)
);

COMMENT ON TABLE entities IS
  'Named entities extracted from signals. Unique by normalized name + type.';

-- ============================================================
-- 5. entity_signal_links (entities ↔ signals junction)
-- ============================================================

CREATE TABLE entity_signal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  mention_context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, signal_id)
);

COMMENT ON TABLE entity_signal_links IS
  'Junction: entities mentioned in signals, with optional context snippet.';

-- ============================================================
-- 6. intelligence_briefs
-- ============================================================

CREATE TABLE intelligence_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_type TEXT NOT NULL
    CHECK (brief_type IN ('daily_digest', 'trend_deep_dive', 'alert')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  cluster_ids UUID[] DEFAULT '{}',
  source_job_id UUID REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE intelligence_briefs IS
  'Generated Intelligence reports — digests, deep dives, and alerts.';

-- ============================================================
-- 7. api_quota_tracking
-- ============================================================

CREATE TABLE api_quota_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_source TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  units_used INTEGER NOT NULL DEFAULT 0,
  units_limit INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (api_source, period_start)
);

COMMENT ON TABLE api_quota_tracking IS
  'Tracks external API rate limit usage per source per period.';

-- ============================================================
-- 8. Indexes
-- ============================================================

-- Idempotent signal upserts: unique per source + source_id
CREATE UNIQUE INDEX idx_signals_source_unique ON signals(source, source_id);

-- Unclustered signals for batch processing
CREATE INDEX idx_signals_unclustered ON signals(ingested_at DESC)
  WHERE is_clustered = false;

-- Active clusters by lifecycle
CREATE INDEX idx_clusters_lifecycle ON trend_clusters(lifecycle)
  WHERE is_active = true;

-- Velocity leaderboard
CREATE INDEX idx_clusters_velocity ON trend_clusters(velocity_percentile DESC);

-- Tag-based search
CREATE INDEX idx_clusters_tags ON trend_clusters USING GIN(tags);

-- Signal cluster lookups
CREATE INDEX idx_sca_signal ON signal_cluster_assignments(signal_id);
CREATE INDEX idx_sca_cluster ON signal_cluster_assignments(cluster_id);

-- Entity lookups
CREATE INDEX idx_entity_signal_entity ON entity_signal_links(entity_id);
CREATE INDEX idx_entity_signal_signal ON entity_signal_links(signal_id);

-- Briefs by type
CREATE INDEX idx_briefs_type ON intelligence_briefs(brief_type, created_at DESC);

-- Quota lookups
CREATE INDEX idx_quota_source ON api_quota_tracking(api_source, period_start DESC);

-- Signals content hash for cross-source dedup
CREATE INDEX idx_signals_content_hash ON signals(content_hash)
  WHERE content_hash IS NOT NULL;

-- ============================================================
-- 9. RLS helper function
-- ============================================================

-- Phase 1: any authenticated user can access Intelligence data
-- Phase 2: will be refined to role-based access
CREATE OR REPLACE FUNCTION has_intelligence_access()
RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

COMMENT ON FUNCTION has_intelligence_access() IS
  'RLS helper for Intelligence tables. Phase 1: any authenticated user. Phase 2: role-based.';

-- ============================================================
-- 10. RLS policies
-- ============================================================

-- ---- trend_clusters ----
ALTER TABLE trend_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_clusters" ON trend_clusters
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_clusters" ON trend_clusters
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- signals ----
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_signals" ON signals
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_signals" ON signals
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- signal_cluster_assignments ----
ALTER TABLE signal_cluster_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_sca" ON signal_cluster_assignments
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_sca" ON signal_cluster_assignments
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- entities ----
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_entities" ON entities
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_entities" ON entities
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- entity_signal_links ----
ALTER TABLE entity_signal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_esl" ON entity_signal_links
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_esl" ON entity_signal_links
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- intelligence_briefs ----
ALTER TABLE intelligence_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_briefs" ON intelligence_briefs
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_briefs" ON intelligence_briefs
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- api_quota_tracking ----
ALTER TABLE api_quota_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_select_quota" ON api_quota_tracking
  FOR SELECT USING (has_intelligence_access());

CREATE POLICY "service_manage_quota" ON api_quota_tracking
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
