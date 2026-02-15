-- Migration: 20260216_smart_memory.sql
-- Purpose: Smart Memory system — user preferences, system learnings,
--          learning versions, feedback signals, auto-versioning trigger, RLS.

BEGIN;

-- ============================================================
-- 1. user_preferences — per-user, per-department, per-category
-- ============================================================

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('creative', 'strategy', 'intelligence')),
  category TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('inferred', 'scout_feedback', 'edit_brief', 'section_reaction', 'approval_pattern')),
  source_ref JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, department, category, preference_key)
);

COMMENT ON TABLE user_preferences IS
  'Per-user, per-department learned preferences. Key/value model allows unlimited dimensions without schema changes. Injected into pipeline prompts when confidence >= 0.5.';

CREATE INDEX idx_user_prefs_user_dept ON user_preferences(user_id, department);

-- ============================================================
-- 2. system_learnings — platform-wide knowledge base
-- ============================================================

CREATE TABLE system_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL
    CHECK (department IN ('creative', 'strategy', 'intelligence', 'global')),
  category TEXT NOT NULL,
  learning_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  source_projects UUID[],
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  decay_weight REAL NOT NULL DEFAULT 1.0 CHECK (decay_weight >= 0 AND decay_weight <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'admin_override')),
  admin_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (department, category, learning_key)
);

COMMENT ON TABLE system_learnings IS
  'Platform-wide learnings. Department-scoped or global. Versioned with auto-versioning trigger. Decays if not validated.';

CREATE INDEX idx_learnings_dept_cat ON system_learnings(department, category);
CREATE INDEX idx_learnings_status ON system_learnings(status) WHERE status = 'active';
CREATE INDEX idx_learnings_confidence ON system_learnings(confidence DESC);

-- ============================================================
-- 3. learning_versions — version history for system learnings
-- ============================================================

CREATE TABLE learning_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES system_learnings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,
  confidence REAL NOT NULL,
  change_reason TEXT,
  changed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (learning_id, version)
);

-- ============================================================
-- 4. feedback_signals — raw feedback events (input to learning)
-- ============================================================

CREATE TABLE feedback_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  signal_type TEXT NOT NULL
    CHECK (signal_type IN (
      'edit_brief',
      'narrative_revision',
      'narrative_approval',
      'pitchapp_approval',
      'scout_feedback',
      'scout_probe_response',
      'revision_count',
      'section_change',
      'animation_request',
      'style_correction'
    )),

  content JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE feedback_signals IS
  'Raw feedback events from user actions. Processed into user_preferences and system_learnings by extraction pipeline. The processed flag is set transactionally with the INSERT into target tables to ensure idempotency.';

-- ============================================================
-- 5. Indexes
-- ============================================================

CREATE INDEX idx_fs_user ON feedback_signals(user_id, signal_type);
CREATE INDEX idx_fs_project ON feedback_signals(project_id);
CREATE INDEX idx_fs_unprocessed ON feedback_signals(processed) WHERE processed = false;

-- ============================================================
-- 6. Auto-versioning trigger for system_learnings
-- ============================================================

CREATE OR REPLACE FUNCTION version_learning()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.confidence IS DISTINCT FROM NEW.confidence THEN
    INSERT INTO learning_versions (learning_id, version, content, confidence, change_reason, changed_by)
    VALUES (OLD.id, OLD.version, OLD.content, OLD.confidence, 'auto-versioned on update', 'system');
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_version_learning
  BEFORE UPDATE ON system_learnings
  FOR EACH ROW
  EXECUTE FUNCTION version_learning();

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_prefs_select" ON user_preferences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_prefs_update" ON user_preferences
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_prefs_insert" ON user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

ALTER TABLE system_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_learnings" ON system_learnings
  FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'active');

ALTER TABLE learning_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_versions" ON learning_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);

ALTER TABLE feedback_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_signals" ON feedback_signals
  FOR ALL USING (user_id = auth.uid());

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if migration needs reverting)
-- ============================================================
-- DROP TRIGGER IF EXISTS trigger_version_learning ON system_learnings;
-- DROP FUNCTION IF EXISTS version_learning();
-- DROP TABLE IF EXISTS feedback_signals;
-- DROP TABLE IF EXISTS learning_versions;
-- DROP TABLE IF EXISTS system_learnings;
-- DROP TABLE IF EXISTS user_preferences;
