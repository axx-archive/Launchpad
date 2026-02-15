-- Migration: Add research quality scoring and auto-polish support
-- Run BEFORE deploying auto-polish pipeline code
-- Stop PM2 executor during migration: pm2 stop pipeline-executor

BEGIN;

-- Add quality columns to project_research
ALTER TABLE project_research ADD COLUMN IF NOT EXISTS quality_scores JSONB DEFAULT NULL;
ALTER TABLE project_research ADD COLUMN IF NOT EXISTS is_polished BOOLEAN DEFAULT FALSE;

-- Update CHECK constraint to include auto-polish job type
ALTER TABLE pipeline_jobs DROP CONSTRAINT IF EXISTS pipeline_jobs_job_type_check;
ALTER TABLE pipeline_jobs ADD CONSTRAINT pipeline_jobs_job_type_check CHECK (job_type IN (
  -- Creative
  'auto-pull', 'auto-research', 'auto-narrative', 'auto-copy', 'auto-build', 'auto-build-html',
  'auto-review', 'auto-push', 'auto-brief', 'auto-revise', 'auto-one-pager', 'auto-emails',
  -- Health
  'health-check',
  -- Intelligence
  'auto-ingest', 'auto-cluster', 'auto-score', 'auto-snapshot',
  'auto-analyze-trends', 'auto-generate-brief',
  -- Strategy
  'auto-polish'
));

COMMIT;
