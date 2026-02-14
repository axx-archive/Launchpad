-- ============================================================
-- Strategy + Cross-Department Tables Migration
-- Date: 2026-02-15
-- Depends on: 20260215_departments.sql, 20260215_intelligence_core.sql
--
-- Creates:
--   - project_research (versioned Strategy research content)
--   - cross_department_refs (links entities across departments)
--   - project_trend_links (projects ↔ Intelligence trends)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. project_research (Strategy department)
-- ============================================================

CREATE TABLE project_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  research_type TEXT NOT NULL DEFAULT 'market'
    CHECK (research_type IN ('market', 'competitive', 'trend', 'custom')),
  trend_cluster_ids UUID[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'superseded')),
  source_job_id UUID REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

COMMENT ON TABLE project_research IS
  'Versioned research content for Strategy department projects.';

COMMENT ON COLUMN project_research.trend_cluster_ids IS
  'Intelligence trend clusters referenced in this research (denormalized for quick access).';

-- ============================================================
-- 2. cross_department_refs
-- ============================================================

CREATE TABLE cross_department_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_department TEXT NOT NULL
    CHECK (source_department IN ('intelligence', 'strategy', 'creative')),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  target_department TEXT NOT NULL
    CHECK (target_department IN ('intelligence', 'strategy', 'creative')),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  relationship TEXT NOT NULL
    CHECK (relationship IN ('informed_by', 'promoted_to', 'references')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cross_department_refs IS
  'Links entities across departments. Tracks provenance when data flows between departments.';

COMMENT ON COLUMN cross_department_refs.source_type IS
  'Type of source entity: trend, research, project, brief, etc.';

COMMENT ON COLUMN cross_department_refs.target_type IS
  'Type of target entity: trend, research, project, brief, etc.';

-- ============================================================
-- 3. project_trend_links
-- ============================================================

CREATE TABLE project_trend_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'reference'
    CHECK (link_type IN ('reference', 'inspiration', 'tracking')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, cluster_id)
);

COMMENT ON TABLE project_trend_links IS
  'Links projects to Intelligence trend clusters. Projects reference trends, not own signals.';

-- ============================================================
-- 4. Indexes
-- ============================================================

-- project_research: lookup by project + latest version
CREATE INDEX idx_pr_project ON project_research(project_id, version DESC);

-- cross_department_refs: lookup by source and target
CREATE INDEX idx_cdr_source ON cross_department_refs(source_department, source_type, source_id);
CREATE INDEX idx_cdr_target ON cross_department_refs(target_department, target_type, target_id);

-- project_trend_links: lookup by project or cluster
CREATE INDEX idx_ptl_project ON project_trend_links(project_id);
CREATE INDEX idx_ptl_cluster ON project_trend_links(cluster_id);

-- ============================================================
-- 5. RLS policies
-- ============================================================

-- ---- project_research ----
ALTER TABLE project_research ENABLE ROW LEVEL SECURITY;

-- Members can read research for their projects
CREATE POLICY "members_select_research" ON project_research
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- Owners and editors can insert research
CREATE POLICY "editors_insert_research" ON project_research
  FOR INSERT WITH CHECK (
    get_project_role(project_id, auth.uid()) IN ('owner', 'editor')
  );

-- Owners and editors can update research
CREATE POLICY "editors_update_research" ON project_research
  FOR UPDATE USING (
    get_project_role(project_id, auth.uid()) IN ('owner', 'editor')
  );

-- ---- cross_department_refs ----
ALTER TABLE cross_department_refs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read references
CREATE POLICY "authenticated_select_refs" ON cross_department_refs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Any authenticated user can create references (write access)
CREATE POLICY "authenticated_insert_refs" ON cross_department_refs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ---- project_trend_links ----
ALTER TABLE project_trend_links ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read trend links
CREATE POLICY "authenticated_select_trend_links" ON project_trend_links
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Project members can link trends to their projects
CREATE POLICY "members_insert_trend_links" ON project_trend_links
  FOR INSERT WITH CHECK (is_project_member(project_id, auth.uid()));

-- Project members can remove trend links
CREATE POLICY "members_delete_trend_links" ON project_trend_links
  FOR DELETE USING (is_project_member(project_id, auth.uid()));

COMMIT;
