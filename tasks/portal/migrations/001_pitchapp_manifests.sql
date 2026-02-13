-- Migration: Create pitchapp_manifests table
-- Stores extracted manifest data from deployed PitchApps (sections, design tokens, copy)
-- One manifest per project (project_id is UNIQUE)

CREATE TABLE pitchapp_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  sections JSONB NOT NULL,
  design_tokens JSONB,
  raw_copy TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pitchapp_manifests ENABLE ROW LEVEL SECURITY;

-- Users can view manifests for their own projects
CREATE POLICY "Users can view own project manifests" ON pitchapp_manifests
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Service role has full CRUD access (used by launchpad-cli on push)
CREATE POLICY "Service role full access" ON pitchapp_manifests
  FOR ALL USING (auth.role() = 'service_role');
