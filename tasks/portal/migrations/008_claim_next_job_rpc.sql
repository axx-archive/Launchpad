-- RPC function for atomic job claiming in pipeline executor
-- Prevents race conditions when multiple executors run concurrently
-- Uses FOR UPDATE SKIP LOCKED to safely claim one job at a time

CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS SETOF pipeline_jobs AS $$
  UPDATE pipeline_jobs
  SET status = 'running', started_at = now(), attempts = attempts + 1
  WHERE id = (
    SELECT id FROM pipeline_jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
