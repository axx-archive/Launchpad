-- Migration: Add edit_brief_json column to scout_messages
-- Stores structured JSON briefs from the submit_edit_brief tool (Phase 2)
-- Coexists with edit_brief_md for backwards compatibility

ALTER TABLE scout_messages ADD COLUMN IF NOT EXISTS edit_brief_json JSONB;
