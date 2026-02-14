-- Migration: Add revision upload support to brand_assets and scout_messages
--
-- brand_assets: add source column (initial vs revision) and optional FK to scout_messages
-- scout_messages: add attachments JSONB for inline file references

-- 1. brand_assets — source column
ALTER TABLE brand_assets
  ADD COLUMN source TEXT NOT NULL DEFAULT 'initial'
    CHECK (source IN ('initial', 'revision'));

-- 2. brand_assets — linked_message_id (ON DELETE SET NULL per tech lead review)
ALTER TABLE brand_assets
  ADD COLUMN linked_message_id UUID REFERENCES scout_messages(id) ON DELETE SET NULL;

-- 3. scout_messages — attachments JSONB
ALTER TABLE scout_messages
  ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
