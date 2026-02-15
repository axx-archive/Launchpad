-- Migration: 20260216_source_context.sql
-- Purpose: Add source_context JSONB column to projects table.
--          Stores denormalized upstream context captured at promotion time.
--          Read by pipeline stages (auto-research, auto-narrative) for prompt injection.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_context JSONB;

COMMENT ON COLUMN projects.source_context IS
  'Denormalized upstream context captured at promotion time. Read by pipeline stages for prompt injection.';

-- === ROLLBACK ===
-- ALTER TABLE projects DROP COLUMN IF EXISTS source_context;
