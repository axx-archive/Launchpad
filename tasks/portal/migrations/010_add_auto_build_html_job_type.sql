-- Migration: Add auto-build-html to pipeline_jobs job_type check constraint
-- The auto-build-html job type was added to the pipeline executor but was never
-- added to the DB constraint, causing follow-up job creation to fail silently.

ALTER TABLE pipeline_jobs DROP CONSTRAINT pipeline_jobs_job_type_check;

ALTER TABLE pipeline_jobs ADD CONSTRAINT pipeline_jobs_job_type_check
  CHECK (job_type IN (
    'auto-pull',
    'auto-narrative',
    'auto-copy',
    'auto-build',
    'auto-build-html',
    'auto-review',
    'auto-push',
    'auto-brief',
    'auto-revise',
    'health-check'
  ));
