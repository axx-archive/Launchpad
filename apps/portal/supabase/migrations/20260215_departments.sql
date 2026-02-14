-- ============================================================
-- Departments Schema Migration
-- Date: 2026-02-15
-- Depends on: initial migration (projects, automation_log)
--
-- Adds department + pipeline_mode columns to projects and
-- department column to automation_log. All existing data
-- defaults to 'creative'. Zero behavior changes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ALTER projects — add department column
-- ============================================================

ALTER TABLE projects ADD COLUMN department TEXT NOT NULL DEFAULT 'creative'
  CHECK (department IN ('intelligence', 'strategy', 'creative'));

COMMENT ON COLUMN projects.department IS
  'Which department this project lives in (UI grouping). Defaults to creative for all existing projects.';

-- ============================================================
-- 2. ALTER projects — add pipeline_mode column
-- ============================================================

ALTER TABLE projects ADD COLUMN pipeline_mode TEXT NOT NULL DEFAULT 'creative'
  CHECK (pipeline_mode IN ('intelligence', 'strategy', 'creative'));

COMMENT ON COLUMN projects.pipeline_mode IS
  'Controls which job chain fires. May differ from department when a project is promoted across departments.';

-- ============================================================
-- 3. ALTER automation_log — add department column
-- ============================================================

ALTER TABLE automation_log ADD COLUMN department TEXT DEFAULT 'creative';

COMMENT ON COLUMN automation_log.department IS
  'Department context for this log entry. Defaults to creative for existing entries.';

-- ============================================================
-- 4. Indexes
-- ============================================================

-- Filter projects by department (dashboard queries)
CREATE INDEX idx_projects_department ON projects(department);

-- Filter automation_log by department (admin queries)
CREATE INDEX idx_automation_log_department ON automation_log(department);

-- ============================================================
-- 5. Verification queries (run after migration)
-- ============================================================

-- Verify: department column exists with correct default
-- SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'projects' AND column_name = 'department';
-- Expected: 1 row, default 'creative', NOT NULL

-- Verify: pipeline_mode column exists with correct default
-- SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'projects' AND column_name = 'pipeline_mode';
-- Expected: 1 row, default 'creative', NOT NULL

-- Verify: all existing projects default to creative
-- SELECT COUNT(*) FROM projects WHERE department != 'creative';
-- Expected: 0

-- Verify: automation_log department column exists
-- SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'automation_log' AND column_name = 'department';
-- Expected: 1 row, default 'creative', nullable

COMMIT;
