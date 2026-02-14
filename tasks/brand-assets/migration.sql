-- Brand Assets Feature — SQL Migration
-- Run this manually in the Supabase SQL Editor

-- ==========================================================================
-- 1. Create storage bucket
-- ==========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  false,
  20971520,  -- 20MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'image/svg+xml', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

-- ==========================================================================
-- 2. Create brand_assets table
-- ==========================================================================

CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('logo', 'hero', 'team', 'background', 'other')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_brand_assets_project_id ON brand_assets(project_id);

-- ==========================================================================
-- 3. Row-Level Security
-- ==========================================================================

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "Users can view own project assets"
  ON brand_assets FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own project assets"
  ON brand_assets FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own project assets"
  ON brand_assets FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own project assets"
  ON brand_assets FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Admin policy (Required Change #1 from architecture review)
CREATE POLICY "Service role has full access"
  ON brand_assets FOR ALL
  USING (auth.role() = 'service_role');

-- ==========================================================================
-- 4. Storage RLS for brand-assets bucket
-- ==========================================================================

CREATE POLICY "Users can upload brand assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can read brand assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete brand assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
  );
