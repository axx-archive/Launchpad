-- Add progress JSONB column to pipeline_jobs for real-time build progress tracking
-- Stores: { turn, max_turns, last_action } during agentic loops
ALTER TABLE pipeline_jobs
  ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT NULL;

-- Allow Realtime to broadcast progress updates
-- (pipeline_jobs is already in the realtime publication if it exists)
