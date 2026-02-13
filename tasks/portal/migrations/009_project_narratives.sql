-- New table for versioned narrative storage
CREATE TABLE project_narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  sections JSONB,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'superseded')),
  source_job_id UUID REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
  revision_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, version)
);

CREATE INDEX idx_narratives_project ON project_narratives(project_id);
CREATE INDEX idx_narratives_status ON project_narratives(status, project_id);

ALTER TABLE project_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project narratives" ON project_narratives
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access" ON project_narratives
  FOR ALL USING (auth.role() = 'service_role');

-- Add narrative_review to projects status constraint
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('requested', 'narrative_review', 'in_progress', 'review', 'revision', 'live', 'on_hold'));
