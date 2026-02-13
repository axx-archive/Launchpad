-- 006_analytics.sql
-- Viewer analytics for deployed PitchApps
-- Tracks page views, scroll depth, and session engagement

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'scroll_depth', 'session_end')),
  data JSONB DEFAULT '{}',
  device_type TEXT,
  referrer TEXT,
  viewport_width INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_project ON analytics_events(project_id);
CREATE INDEX idx_analytics_created ON analytics_events(created_at);
CREATE INDEX idx_analytics_session ON analytics_events(session_id);
CREATE INDEX idx_analytics_event_type ON analytics_events(project_id, event_type);

-- RLS: only service role can access (public writes go through API route with admin client)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON analytics_events
  FOR ALL USING (auth.role() = 'service_role');
