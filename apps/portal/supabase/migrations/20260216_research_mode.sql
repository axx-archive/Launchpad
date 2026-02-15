ALTER TABLE projects
ADD COLUMN IF NOT EXISTS research_mode TEXT DEFAULT 'full'
CHECK (research_mode IN ('full', 'skip', 'attached'));
