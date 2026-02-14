-- Fix pipeline_jobs job_type CHECK constraint to include all department job types
-- The original constraint only had Creative pipeline types.

BEGIN;

ALTER TABLE pipeline_jobs DROP CONSTRAINT IF EXISTS pipeline_jobs_job_type_check;
ALTER TABLE pipeline_jobs ADD CONSTRAINT pipeline_jobs_job_type_check CHECK (job_type IN (
  -- Creative pipeline
  'auto-pull', 'auto-research', 'auto-narrative', 'auto-copy', 'auto-build', 'auto-build-html',
  'auto-review', 'auto-push', 'auto-brief', 'auto-revise', 'auto-one-pager', 'auto-emails',
  -- Health
  'health-check',
  -- Intelligence pipeline
  'auto-ingest', 'auto-cluster', 'auto-score', 'auto-snapshot',
  'auto-analyze-trends', 'auto-generate-brief'
));

COMMIT;
