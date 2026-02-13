-- Migration: Create pipeline_jobs table
-- Orchestration queue for autonomous pipeline — tracks each step of the build/revision cycle.
-- Jobs move through: pending → queued → running → completed|failed|cancelled

CREATE TABLE pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('auto-pull','auto-narrative','auto-copy','auto-build','auto-review','auto-push','auto-brief','auto-revise','health-check')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','running','completed','failed','cancelled')),
  payload JSONB DEFAULT '{}',
  result JSONB,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pipeline_jobs_project ON pipeline_jobs(project_id);
CREATE INDEX idx_pipeline_jobs_status ON pipeline_jobs(status);

ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by cron workers and API routes)
CREATE POLICY "Service role full access" ON pipeline_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- Admins can view all jobs via service role client (no direct user access needed)
