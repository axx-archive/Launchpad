-- Migration: Create automation_log table
-- Audit trail for all automation activity — every pipeline action gets logged here.
-- Used for cost tracking, debugging, and the admin automation dashboard.

CREATE TABLE automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id),
  event TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  cost_usd NUMERIC(8,4),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_automation_log_project ON automation_log(project_id);
CREATE INDEX idx_automation_log_created ON automation_log(created_at);

ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by cron workers and API routes)
CREATE POLICY "Service role full access" ON automation_log
  FOR ALL USING (auth.role() = 'service_role');
