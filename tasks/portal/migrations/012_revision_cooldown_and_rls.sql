-- Migration: Brief accumulation cooldown + storage RLS hardening
--
-- 1. Add revision_cooldown_until to projects for brief accumulation
-- 2. Tighten brand-assets bucket storage policies

-- 1. Brief accumulation cooldown
ALTER TABLE projects
  ADD COLUMN revision_cooldown_until TIMESTAMPTZ;

-- 2. Storage RLS — brand-assets bucket
-- Ensure RLS is enabled on storage.objects (Supabase default, but be explicit)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- INSERT: users can only upload to their own project folders
CREATE POLICY "brand_assets_insert_own_project"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM projects WHERE user_id = auth.uid()
    )
  );

-- SELECT: users can only read their own project assets
CREATE POLICY "brand_assets_select_own_project"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM projects WHERE user_id = auth.uid()
    )
  );

-- DELETE: users can only delete their own project assets
CREATE POLICY "brand_assets_delete_own_project"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM projects WHERE user_id = auth.uid()
    )
  );

-- NOTE: Service role (used by admin client, pipeline, CLI) bypasses RLS entirely.
-- These policies only restrict direct client-side Supabase access.

-- 3. Storage cleanup gap (DOCUMENTED — not implemented yet)
--
-- When a project is deleted:
-- - FK CASCADE deletes brand_assets DB rows
-- - But storage objects in brand-assets/{project_id}/ and documents/{project_id}/ remain
--
-- Options for future cleanup:
-- a) Supabase Edge Function triggered on project DELETE
-- b) Cron job that scans for orphaned storage folders (no matching project)
-- c) Postgres trigger that calls a cleanup function via pg_net
--
-- For now: orphaned storage is acceptable (bounded by per-project 25MB limit).
-- Monitor total storage usage. Implement cleanup when project deletion volume warrants it.
