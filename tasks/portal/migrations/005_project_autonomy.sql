-- Migration: Add autonomy_level column to projects table
-- Per-project automation config: manual (no automation), supervised (human gates),
-- or full_auto (autonomous with safety guardrails only).

ALTER TABLE projects ADD COLUMN autonomy_level TEXT NOT NULL DEFAULT 'supervised'
  CHECK (autonomy_level IN ('manual','supervised','full_auto'));
