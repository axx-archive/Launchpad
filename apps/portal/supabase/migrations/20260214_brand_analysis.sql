-- Brand DNA extraction results from Claude Vision analysis of uploaded brand assets
-- Stores extracted colors, fonts, style direction, and usage notes
-- Shape: { colors: {...}, fonts: {...}, style_direction: "...", logo_notes: "...", analyzed_at: "..." }
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_analysis JSONB DEFAULT NULL;
