-- 007_versions.sql
-- PitchApp version tracking
-- Records each deployment push as a version

CREATE TABLE pitchapp_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  pushed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_versions_project ON pitchapp_versions(project_id);

-- RLS: only service role can access (writes go through API route with admin client)
ALTER TABLE pitchapp_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON pitchapp_versions
  FOR ALL USING (auth.role() = 'service_role');
