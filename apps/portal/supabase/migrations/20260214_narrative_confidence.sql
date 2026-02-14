-- Add confidence scoring to project_narratives
-- Stores dimensional scores from AI self-assessment after narrative generation
-- Shape: { specificity, evidence, arc, differentiation, overall, notes }
ALTER TABLE project_narratives
  ADD COLUMN IF NOT EXISTS confidence JSONB DEFAULT NULL;
