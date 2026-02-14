-- ============================================================
-- Collaboration Feature Migration
-- Date: 2026-02-14
-- Depends on: initial migration.sql (projects, scout_messages, notifications)
--
-- This migration adds multi-user collaboration to Launchpad:
--   - user_profiles (display info)
--   - project_members (active memberships with roles)
--   - project_invitations (pending invites for non-existing users)
--   - Helper functions, triggers, backfill, RLS policies
-- ============================================================

BEGIN;

-- ============================================================
-- 1. New Tables
-- ============================================================

-- user_profiles: lightweight display info synced from auth.users
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- project_members: active memberships (owner/editor/viewer)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- project_invitations: pending invites for users who don't have accounts yet
-- NOTE: Consider periodic cleanup of expired/revoked rows. (L1)
CREATE TABLE project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, email, status)
);

-- Indexes for new tables
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_invitations_token ON project_invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_email ON project_invitations(email) WHERE status = 'pending';
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- ============================================================
-- 2. ALTER existing tables
-- ============================================================

-- Visibility hint on projects
-- NOTE: visibility is a UI hint only, not an access control mechanism.
-- Access is controlled by project_members. (L2)
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'shared'));

-- Scout message sender attribution for multi-user conversations
ALTER TABLE scout_messages ADD COLUMN sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 3. Comments on existing columns
-- ============================================================

-- FK is NO ACTION (not CASCADE). Owner must delete or transfer
-- projects before deleting their account. (C3 — Option A)
COMMENT ON COLUMN projects.user_id IS
  'Original project owner. FK is NO ACTION — owner must delete/transfer projects before deleting account.';

COMMENT ON COLUMN projects.visibility IS
  'UI hint only, not access control. Access controlled by project_members.';

COMMENT ON TABLE project_invitations IS
  'Pending invites for non-existing users. Consider periodic cleanup of expired/revoked rows.';

-- ============================================================
-- 4. Helper functions (SECURITY DEFINER with explicit search_path — H3 fix)
-- ============================================================

-- Check if a user is a member of a project (any role)
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- Get a user's role on a project (NULL if not a member)
CREATE OR REPLACE FUNCTION get_project_role(p_project_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;

-- ============================================================
-- 5. Trigger: auto-create owner membership on project INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER trigger_create_owner_membership
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION create_owner_membership();

-- ============================================================
-- 6. Backfill existing data
-- ============================================================

-- Create owner memberships for all existing projects
INSERT INTO project_members (project_id, user_id, role)
SELECT id, user_id, 'owner' FROM projects
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Create user profiles from existing auth users
INSERT INTO user_profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. RLS — new tables
-- ============================================================

-- ---- user_profiles ----
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_profiles" ON user_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "own_profile_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- project_members ----
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_members" ON project_members
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "owners_insert_members" ON project_members
  FOR INSERT WITH CHECK (get_project_role(project_id, auth.uid()) = 'owner');

CREATE POLICY "owners_update_members" ON project_members
  FOR UPDATE USING (get_project_role(project_id, auth.uid()) = 'owner');

CREATE POLICY "owners_or_self_delete_members" ON project_members
  FOR DELETE USING (
    get_project_role(project_id, auth.uid()) = 'owner'
    OR user_id = auth.uid()
  );

-- ---- project_invitations ----
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_or_invitee_select_invitations" ON project_invitations
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "owners_insert_invitations" ON project_invitations
  FOR INSERT WITH CHECK (get_project_role(project_id, auth.uid()) = 'owner');

-- C2 fix: UPDATE policy for revoking invitations (owner sets status to 'revoked')
CREATE POLICY "owners_update_invitations" ON project_invitations
  FOR UPDATE USING (get_project_role(project_id, auth.uid()) = 'owner');

-- C2 fix: DELETE policy for cleanup of old invitation rows
CREATE POLICY "owners_delete_invitations" ON project_invitations
  FOR DELETE USING (get_project_role(project_id, auth.uid()) = 'owner');

-- ============================================================
-- 8. RLS — existing tables (additive — new policies alongside old)
-- ============================================================

-- ---- projects ----
-- Members can see projects they belong to
CREATE POLICY "members_select_projects" ON projects
  FOR SELECT USING (is_project_member(id, auth.uid()));

-- Owners and editors can update projects
CREATE POLICY "members_update_projects" ON projects
  FOR UPDATE USING (get_project_role(id, auth.uid()) IN ('owner', 'editor'));

-- ---- scout_messages ----
-- All members can read messages
CREATE POLICY "members_select_messages" ON scout_messages
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- Owners and editors can write messages
CREATE POLICY "members_insert_messages" ON scout_messages
  FOR INSERT WITH CHECK (
    get_project_role(project_id, auth.uid()) IN ('owner', 'editor')
  );

-- ---- brand_assets ----
-- Members can read brand assets
CREATE POLICY "members_select_brand_assets" ON brand_assets
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- Editors and owners can insert brand assets
CREATE POLICY "editors_insert_brand_assets" ON brand_assets
  FOR INSERT WITH CHECK (get_project_role(project_id, auth.uid()) IN ('owner', 'editor'));

-- Editors and owners can delete brand assets
CREATE POLICY "editors_delete_brand_assets" ON brand_assets
  FOR DELETE USING (get_project_role(project_id, auth.uid()) IN ('owner', 'editor'));

-- ---- project_narratives ----
-- Members can read narratives
CREATE POLICY "members_select_narratives" ON project_narratives
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- ============================================================
-- 9. Drop old ownership-based policies (replaced by membership-based)
--
-- IMPORTANT: Only run this section AFTER verifying the new policies
-- work correctly in staging. During transition, both old and new
-- policies coexist (PostgreSQL OR's permissive policies together).
--
-- Uncomment these when ready to cut over:
-- ============================================================

-- DROP POLICY IF EXISTS "clients_own_projects_select" ON projects;
-- DROP POLICY IF EXISTS "clients_own_projects_insert" ON projects;
-- DROP POLICY IF EXISTS "clients_own_projects_update" ON projects;
-- DROP POLICY IF EXISTS "clients_own_messages_select" ON scout_messages;
-- DROP POLICY IF EXISTS "clients_own_messages_insert" ON scout_messages;

-- ============================================================
-- 10. Verification queries (run after migration to confirm correctness)
-- ============================================================

-- Verify: every project has exactly one owner membership
-- SELECT p.id FROM projects p
--   LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
--   WHERE pm.id IS NULL;
-- Expected: 0 rows

-- Verify: no duplicate memberships
-- SELECT project_id, user_id, COUNT(*)
--   FROM project_members GROUP BY project_id, user_id HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Verify: all auth users have a profile
-- SELECT u.id FROM auth.users u
--   LEFT JOIN user_profiles up ON up.id = u.id
--   WHERE up.id IS NULL;
-- Expected: 0 rows

-- Verify: visibility column exists with correct default
-- SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'projects' AND column_name = 'visibility';
-- Expected: 1 row, default 'private', NOT NULL

-- Verify: sender_id column exists on scout_messages
-- SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'scout_messages' AND column_name = 'sender_id';
-- Expected: 1 row, nullable

-- Verify: helper functions exist
-- SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN ('is_project_member', 'get_project_role');
-- Expected: 2 rows, both prosecdef = true

-- Verify: trigger exists
-- SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_table = 'projects'
--   AND trigger_name = 'trigger_create_owner_membership';
-- Expected: 1 row

COMMIT;
