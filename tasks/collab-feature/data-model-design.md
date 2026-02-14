# Collaboration Feature — Data Model, API Contracts & Permissions

> Designed by Technical Product Lead
> Date: 2026-02-13
> Based on: `architecture-research.md` (systems-eng)

---

## 1. Data Model Changes

### 1.1 New Table: `project_members`

The core collaboration primitive. Replaces single-owner `user_id` with a membership model.

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
```

**Design decisions:**
- `ON DELETE CASCADE` on `project_id` — if a project is deleted, all memberships go with it.
- `ON DELETE CASCADE` on `user_id` — if a user account is deleted, their memberships are cleaned up.
- `ON DELETE SET NULL` on `invited_by` — keep audit trail even if the inviter's account is deleted.
- `UNIQUE (project_id, user_id)` — a user can only have one role per project.
- No `updated_at` — role changes are infrequent; we can add this later if needed.

### 1.2 New Table: `project_invitations`

Email-based invitation flow with token-based acceptance.

```sql
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

  UNIQUE (project_id, email, status)  -- one pending invite per email per project
);

CREATE INDEX idx_invitations_token ON project_invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_email ON project_invitations(email) WHERE status = 'pending';
```

**Design decisions:**
- Can't invite someone as `owner` — ownership is assigned at creation and transferred explicitly.
- Token is a 32-byte hex string (64 chars) — URL-safe, high entropy.
- 7-day expiry by default.
- Partial unique index: only one pending invite per email per project (can re-invite after revocation).
- `email` instead of `user_id` — invitee may not have an account yet. Resolved on acceptance.

### 1.3 New Table: `user_profiles`

Lightweight profile for display purposes. Created on first sign-in.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Design decisions:**
- `id` is the user's auth UUID — 1:1 with `auth.users`.
- `email` is denormalized from auth for easy lookups without `auth.admin.listUsers()` (which has rate limits and is expensive).
- `display_name` and `avatar_url` are optional — MVP shows email, display name is a progressive enhancement.
- Created automatically when a user first signs in (via middleware or auth callback).

### 1.4 Column Addition: `projects.visibility`

Controls whether the project appears on a public or discoverable list (future use, but the column should exist now).

```sql
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'shared'));
```

**Values:**
- `private` — only visible to members (default, current behavior).
- `shared` — visible to members. The distinction from `private` is semantic: `shared` indicates the owner has explicitly opted into collaboration. This gates UI elements like "Share" buttons and member lists.

**Note:** We are NOT adding `public` visibility in this phase. All projects require membership to access. Public/link-sharing is a future enhancement.

### 1.5 Unchanged: `projects.user_id`

We **keep** `user_id` on the `projects` table. It remains the "creator" field and is used for:
- Backward compatibility during migration
- Quick creator lookup without joining `project_members`
- The creator is always the initial `owner` in `project_members`

It is NOT the access control field anymore — that role shifts to `project_members`.

---

## 2. Permission Model

### 2.1 Role Definitions

| Permission | Owner | Editor | Viewer | Admin (env) |
|-----------|-------|--------|--------|-------------|
| View project details | yes | yes | yes | yes |
| View Scout chat history | yes | yes | yes | yes |
| Send Scout messages | yes | yes | no | yes |
| Upload/delete documents | yes | yes | no | yes |
| Upload/delete brand assets | yes | yes | no | yes |
| Approve/reject narrative | yes | no | no | yes |
| Approve/request-changes on PitchApp | yes | no | no | yes |
| Submit edit briefs (via Scout) | yes | yes | no | yes |
| Invite members | yes | yes (editors only, not owners) | no | yes |
| Remove members | yes | no | no | yes |
| Change member roles | yes | no | no | yes |
| Transfer ownership | yes | no | no | yes |
| Delete project | yes | no | no | yes |
| Update project metadata | yes | yes | no | yes |
| View analytics | yes | yes | yes | yes |
| View pipeline jobs | yes | yes | yes | yes |
| Start build | yes | no | no | yes |
| Change project status | no | no | no | yes (admin-only) |

**Key principles:**
- **Viewer** = read-only access to everything. Cannot modify anything.
- **Editor** = can contribute (chat, upload, submit briefs) but cannot make approval decisions or manage membership.
- **Owner** = full control, including membership management and approvals. Only one owner per project (enforced in application logic).
- **Admin** = platform-level override via `ADMIN_EMAILS` env var. Unchanged from current system.

### 2.2 Ownership Rules

- Every project has exactly **one** owner at all times.
- The project creator is the initial owner.
- Ownership can be transferred (owner → editor demotion + target → owner promotion, in a transaction).
- An owner cannot remove themselves — they must transfer ownership first.
- Deleting the owner's account cascades: project is deleted (via `project_members` CASCADE → if no owner remains, the project is orphaned. We handle this with an `ON DELETE` trigger or periodic cleanup).

### 2.3 RLS Policy Rewrites

#### Helper Function

```sql
-- Check if a user is a member of a project
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get a user's role on a project (returns NULL if not a member)
CREATE OR REPLACE FUNCTION get_project_role(p_project_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

#### Updated Policies: `projects`

```sql
-- Drop existing policies
DROP POLICY IF EXISTS "clients_own_projects_select" ON projects;
DROP POLICY IF EXISTS "clients_own_projects_insert" ON projects;
DROP POLICY IF EXISTS "clients_own_projects_update" ON projects;

-- New: users can see projects they're a member of
CREATE POLICY "members_select_projects" ON projects
  FOR SELECT USING (
    is_project_member(id, auth.uid())
  );

-- Insert: anyone can create a project (they become owner via trigger)
CREATE POLICY "authenticated_insert_projects" ON projects
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

-- Update: owners and editors can update project metadata
CREATE POLICY "members_update_projects" ON projects
  FOR UPDATE USING (
    get_project_role(id, auth.uid()) IN ('owner', 'editor')
  );
```

#### Updated Policies: `scout_messages`

```sql
DROP POLICY IF EXISTS "clients_own_messages_select" ON scout_messages;
DROP POLICY IF EXISTS "clients_own_messages_insert" ON scout_messages;

-- All members can read chat history
CREATE POLICY "members_select_messages" ON scout_messages
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
  );

-- Owners and editors can send messages
CREATE POLICY "members_insert_messages" ON scout_messages
  FOR INSERT WITH CHECK (
    get_project_role(project_id, auth.uid()) IN ('owner', 'editor')
  );
```

#### Updated Policies: `notifications`

```sql
-- Notifications remain user-scoped (unchanged)
-- No change needed — notifications are per-user, not per-project
-- The change is in *who gets notified*, handled in application code
```

#### New Policies: `project_members`

```sql
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Members can see who else is on their projects
CREATE POLICY "members_select_members" ON project_members
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
  );

-- Owners can add members (application also enforces role checks)
CREATE POLICY "owners_insert_members" ON project_members
  FOR INSERT WITH CHECK (
    get_project_role(project_id, auth.uid()) = 'owner'
  );

-- Owners can update member roles
CREATE POLICY "owners_update_members" ON project_members
  FOR UPDATE USING (
    get_project_role(project_id, auth.uid()) = 'owner'
  );

-- Owners can remove members (or members can remove themselves)
CREATE POLICY "owners_delete_members" ON project_members
  FOR DELETE USING (
    get_project_role(project_id, auth.uid()) = 'owner'
    OR user_id = auth.uid()  -- members can leave
  );
```

#### New Policies: `project_invitations`

```sql
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;

-- Members can see invitations for their projects
CREATE POLICY "members_select_invitations" ON project_invitations
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Owners and editors can create invitations
CREATE POLICY "members_insert_invitations" ON project_invitations
  FOR INSERT WITH CHECK (
    get_project_role(project_id, auth.uid()) IN ('owner', 'editor')
  );
```

#### New Policies: `user_profiles`

```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read profiles (needed for member lists)
CREATE POLICY "authenticated_select_profiles" ON user_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can update their own profile
CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "own_profile_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());
```

#### Policies for Existing Tables (Membership-Scoped)

Tables that currently have no user-facing RLS but need it with collaboration:

```sql
-- brand_assets: members can read, owners/editors can write
CREATE POLICY "members_select_brand_assets" ON brand_assets
  FOR SELECT USING (is_project_member(project_id, auth.uid()));
CREATE POLICY "editors_insert_brand_assets" ON brand_assets
  FOR INSERT WITH CHECK (get_project_role(project_id, auth.uid()) IN ('owner', 'editor'));
CREATE POLICY "editors_delete_brand_assets" ON brand_assets
  FOR DELETE USING (get_project_role(project_id, auth.uid()) IN ('owner', 'editor'));

-- project_narratives: members can read
CREATE POLICY "members_select_narratives" ON project_narratives
  FOR SELECT USING (is_project_member(project_id, auth.uid()));
```

### 2.4 Application-Level Permission Helper

Replace the current `verifyAccess()` pattern with a role-aware version:

```typescript
type ProjectRole = 'owner' | 'editor' | 'viewer';

interface AccessResult {
  user: User;
  role: ProjectRole | null;  // null = not a member
  isAdmin: boolean;
  project: { id: string; user_id: string };
}

async function verifyProjectAccess(
  projectId: string,
  requiredRole?: ProjectRole | ProjectRole[]
): Promise<AccessResult | { error: string; status: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 };

  const admin = isAdmin(user.email);
  const client = admin ? createAdminClient() : supabase;

  // Fetch project + membership in one query
  const { data: project } = await client
    .from("projects")
    .select("id, user_id, project_members!inner(role)")
    .eq("id", projectId)
    .eq("project_members.user_id", user.id)
    .single();

  // Admin bypass
  if (!project && admin) {
    const { data: adminProject } = await createAdminClient()
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();
    if (!adminProject) return { error: "project not found", status: 404 };
    return { user, role: null, isAdmin: true, project: adminProject };
  }

  if (!project) return { error: "project not found or no access", status: 404 };

  const role = project.project_members[0]?.role as ProjectRole;

  // Check required role if specified
  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!admin && !allowed.includes(role)) {
      return { error: "insufficient permissions", status: 403 };
    }
  }

  return { user, role, isAdmin: admin, project };
}
```

---

## 3. API Contracts

### 3.1 List Project Members

```
GET /api/projects/[id]/members
```

**Auth:** Any project member or admin.

**Response (200):**
```json
{
  "members": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "email": "alice@example.com",
      "display_name": "Alice",
      "role": "owner",
      "created_at": "2026-02-13T00:00:00Z"
    },
    {
      "id": "uuid",
      "user_id": "uuid",
      "email": "bob@example.com",
      "display_name": null,
      "role": "editor",
      "created_at": "2026-02-13T01:00:00Z"
    }
  ],
  "pending_invitations": [
    {
      "id": "uuid",
      "email": "carol@example.com",
      "role": "viewer",
      "invited_by": "alice@example.com",
      "expires_at": "2026-02-20T00:00:00Z",
      "created_at": "2026-02-13T02:00:00Z"
    }
  ]
}
```

**Errors:**
- 401: Not authenticated
- 404: Project not found or not a member

### 3.2 Invite User

```
POST /api/projects/[id]/members/invite
```

**Auth:** Owner or editor (editors can only invite as `editor` or `viewer`, not `owner`).

**Request:**
```json
{
  "email": "bob@example.com",
  "role": "editor"
}
```

**Response (201):**
```json
{
  "invitation": {
    "id": "uuid",
    "email": "bob@example.com",
    "role": "editor",
    "expires_at": "2026-02-20T00:00:00Z"
  }
}
```

**Side effects:**
- Creates `project_invitations` record
- Sends invitation email via Resend with accept link: `{APP_URL}/invitation?token={token}`
- Creates notification for all project members: "Alice invited bob@example.com as editor"

**Errors:**
- 400: Invalid email format, invalid role, or self-invite
- 403: Insufficient permissions (viewer, or editor trying to invite as owner)
- 404: Project not found or not a member
- 409: User is already a member, or pending invitation exists for this email

### 3.3 Accept Invitation

```
POST /api/invitations/accept
```

**Auth:** Authenticated user whose email matches the invitation.

**Request:**
```json
{
  "token": "hex-token-string"
}
```

**Response (200):**
```json
{
  "project": {
    "id": "uuid",
    "company_name": "Acme Corp",
    "project_name": "Series A Deck"
  },
  "role": "editor"
}
```

**Side effects:**
- Creates `project_members` record
- Updates invitation status to `accepted` + sets `accepted_at`
- Creates `user_profiles` record if not exists (from `auth.users` email)
- Notifies all existing project members: "bob@example.com joined as editor"

**Errors:**
- 400: Missing or invalid token
- 401: Not authenticated
- 403: Email mismatch (authenticated user's email doesn't match invitation email)
- 404: Invitation not found
- 410: Invitation expired or already accepted/revoked

### 3.4 Remove Member

```
DELETE /api/projects/[id]/members/[userId]
```

**Auth:** Owner (can remove anyone except themselves), or the member themselves (leaving).

**Request:** None (user ID is in the URL).

**Response (200):**
```json
{
  "removed": true
}
```

**Side effects:**
- Deletes `project_members` record
- Notifies remaining members: "bob@example.com was removed" or "bob@example.com left"
- If the removed user had pending Scout chat context, no cleanup needed (messages persist for history)

**Errors:**
- 403: Not the owner (unless removing self), or owner trying to remove themselves
- 404: Project not found, user not a member

### 3.5 Change Member Role

```
PATCH /api/projects/[id]/members/[userId]
```

**Auth:** Owner only.

**Request:**
```json
{
  "role": "viewer"
}
```

**Response (200):**
```json
{
  "member": {
    "user_id": "uuid",
    "role": "viewer"
  }
}
```

**Constraints:**
- Cannot change own role (use transfer ownership instead).
- Cannot promote to `owner` (use transfer ownership endpoint).
- Can only demote/promote between `editor` and `viewer`.

**Errors:**
- 400: Invalid role, or attempting to set `owner`
- 403: Not the project owner
- 404: Project not found, user not a member

### 3.6 Transfer Ownership

```
POST /api/projects/[id]/members/transfer
```

**Auth:** Current owner only.

**Request:**
```json
{
  "new_owner_id": "uuid"
}
```

**Response (200):**
```json
{
  "previous_owner": { "user_id": "uuid", "new_role": "editor" },
  "new_owner": { "user_id": "uuid", "role": "owner" }
}
```

**Side effects (transactional):**
- Current owner → `editor`
- Target member → `owner`
- Updates `projects.user_id` to the new owner (for backward compat)
- Notifies all members

**Errors:**
- 403: Not the current owner
- 404: Target user is not a member of this project

### 3.7 Revoke Invitation

```
DELETE /api/projects/[id]/members/invite/[invitationId]
```

**Auth:** Owner only.

**Request:** None.

**Response (200):**
```json
{
  "revoked": true
}
```

**Side effects:**
- Sets invitation status to `revoked`

**Errors:**
- 403: Not the owner
- 404: Invitation not found or not pending

### 3.8 List My Invitations

```
GET /api/invitations
```

**Auth:** Any authenticated user.

**Response (200):**
```json
{
  "invitations": [
    {
      "id": "uuid",
      "project": {
        "id": "uuid",
        "company_name": "Acme Corp",
        "project_name": "Series A Deck"
      },
      "role": "editor",
      "invited_by_email": "alice@example.com",
      "expires_at": "2026-02-20T00:00:00Z",
      "created_at": "2026-02-13T00:00:00Z"
    }
  ]
}
```

**Note:** Only returns pending, non-expired invitations.

### 3.9 Update Project Visibility

No separate endpoint needed — handled by existing `PATCH /api/projects/[id]`:

```json
{
  "visibility": "shared"
}
```

Added to the existing allowed fields list. Only the owner can change visibility.

---

## 4. Database Triggers & Functions

### 4.1 Auto-Create Owner Membership on Project Insert

```sql
CREATE OR REPLACE FUNCTION create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_owner_membership
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION create_owner_membership();
```

This ensures every new project automatically gets an owner membership record — no application code change needed for project creation.

### 4.2 Auto-Create User Profile on First Sign-In

Handled in application code (auth callback or middleware) rather than a database trigger, since we need access to the auth session to get the email:

```typescript
// In auth callback or middleware — after successful authentication
async function ensureUserProfile(userId: string, email: string) {
  const adminClient = createAdminClient();
  await adminClient.from("user_profiles").upsert(
    { id: userId, email },
    { onConflict: "id", ignoreDuplicates: true }
  );
}
```

### 4.3 Notification Fan-Out Helper

```typescript
async function notifyProjectMembers(
  projectId: string,
  excludeUserId: string,  // don't notify the actor
  notification: { type: string; title: string; body: string }
) {
  const adminClient = createAdminClient();

  const { data: members } = await adminClient
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .neq("user_id", excludeUserId);

  if (!members?.length) return;

  // Also notify admins who aren't already members
  const adminIds = await getAdminUserIds(adminClient);
  const memberIds = new Set(members.map(m => m.user_id));
  const allRecipients = [
    ...members.map(m => m.user_id),
    ...adminIds.filter(id => !memberIds.has(id))
  ];

  await adminClient.from("notifications").insert(
    allRecipients.map(userId => ({
      user_id: userId,
      project_id: projectId,
      ...notification
    }))
  );
}
```

---

## 5. Migration Strategy

### 5.1 Migration Order

The migration must be executed in this exact order to avoid breaking existing access:

```
Phase 1: Add new tables + functions (non-breaking)
Phase 2: Backfill project_members from existing projects
Phase 3: Add new RLS policies alongside existing ones (both active)
Phase 4: Verify new policies work correctly
Phase 5: Drop old policies
Phase 6: Add visibility column
```

### 5.2 Phase 1 — New Tables (Non-Breaking)

```sql
-- This is purely additive — no existing behavior changes
CREATE TABLE user_profiles (...);
CREATE TABLE project_members (...);
CREATE TABLE project_invitations (...);

CREATE FUNCTION is_project_member(...);
CREATE FUNCTION get_project_role(...);
CREATE FUNCTION create_owner_membership(...);
CREATE TRIGGER trigger_create_owner_membership ...;
```

### 5.3 Phase 2 — Backfill

```sql
-- Create owner membership for every existing project
INSERT INTO project_members (project_id, user_id, role)
SELECT id, user_id, 'owner'
FROM projects
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Create user profiles from existing auth users
INSERT INTO user_profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

**Verification query:**
```sql
-- Ensure every project has exactly one owner
SELECT p.id, p.user_id, pm.user_id as member_user_id, pm.role
FROM projects p
LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
WHERE pm.id IS NULL;
-- Should return 0 rows
```

### 5.4 Phase 3 — New RLS Policies (Parallel)

Add new membership-based policies **without dropping old ones**. Both old and new policies use `OR` semantics in Postgres RLS — if either policy passes, access is granted.

```sql
-- Add new policies (these are additive — they grant additional access, not less)
CREATE POLICY "members_select_projects" ON projects
  FOR SELECT USING (is_project_member(id, auth.uid()));

-- etc. for all new policies
```

### 5.5 Phase 4 — Verify

Test with a non-admin user:
1. User can see their own projects (via both old `user_id` policy AND new membership policy)
2. If invited to another project, they can see it (via new membership policy only)
3. No access to projects they're not invited to

### 5.6 Phase 5 — Drop Old Policies

```sql
-- Only after verification
DROP POLICY "clients_own_projects_select" ON projects;
DROP POLICY "clients_own_projects_insert" ON projects;
DROP POLICY "clients_own_projects_update" ON projects;
DROP POLICY "clients_own_messages_select" ON scout_messages;
DROP POLICY "clients_own_messages_insert" ON scout_messages;
```

### 5.7 Phase 6 — Visibility Column

```sql
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'shared'));
```

All existing projects default to `private`. No behavioral change until UI exposes the toggle.

### 5.8 Default Behaviors After Migration

| Scenario | Before | After |
|----------|--------|-------|
| User creates a project | `user_id` set, RLS grants access | `user_id` set + trigger creates `owner` membership |
| User views their projects | RLS: `auth.uid() = user_id` | RLS: `is_project_member(id, auth.uid())` |
| Admin views all projects | Service role client | Service role client (unchanged) |
| User views another's project | Blocked (404) | Blocked unless member |
| Pipeline jobs run | Service role | Service role (unchanged) |

---

## 6. Open Questions

1. **Invitation cap per project?** Should we limit the number of members per project (e.g., max 10)? This prevents abuse and keeps notification fan-out bounded.

2. **Email-only invites vs. link invites?** Current design requires knowing the invitee's email. Should we also support a shareable link that anyone with the link can use to request access?

3. **Viewer access to Scout?** Current design gives viewers read-only access to Scout chat history. Should viewers be able to see the chat at all, or should it be editor+ only?

4. **Ownership transfer on account deletion?** If the project owner deletes their account, the project is orphaned. Should we auto-transfer to the next editor, or delete the project?

5. **Notification preferences?** With collaboration, notifications increase significantly. Should we add per-project notification preferences (mute, digest, etc.) in this phase or defer?

---

## 7. TypeScript Type Additions

```typescript
// New types to add to src/types/database.ts

type MemberRole = 'owner' | 'editor' | 'viewer';
type InvitationStatus = 'pending' | 'accepted' | 'revoked';
type ProjectVisibility = 'private' | 'shared';

interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
}

interface ProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  role: MemberRole;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Update existing Project type
interface Project {
  // ... existing fields ...
  visibility: ProjectVisibility;
}
```

---

## 8. Impact on Existing Routes

### Routes That Need `verifyAccess()` → `verifyProjectAccess()` Update

| Route | Current Check | New Check | Breaking? |
|-------|--------------|-----------|-----------|
| `GET /api/projects` | RLS (user_id) | RLS (membership) | No — returns same + shared projects |
| `POST /api/projects` | RLS (user_id) | RLS (user_id) + trigger adds membership | No |
| `GET /api/projects/[id]` | RLS or admin | RLS (membership) or admin | No |
| `PATCH /api/projects/[id]` | user_id match | role: owner/editor | No for owners |
| `DELETE /api/projects/[id]` | Admin only | Admin or owner | Expands access slightly |
| `GET /api/projects/[id]/documents` | verifyAccess | verifyProjectAccess (any member) | No |
| `POST /api/projects/[id]/documents` | verifyAccess | verifyProjectAccess (owner/editor) | No for owners |
| `GET/POST/PATCH/DELETE brand-assets` | verifyAccess | verifyProjectAccess (role-based) | No for owners |
| `POST /api/scout` | RLS (project ownership) | RLS (membership, owner/editor) | No for owners |
| `POST /api/projects/[id]/approve` | isOwner check | role: owner | No |
| `POST /api/projects/[id]/start-build` | isOwner check | role: owner | No |
| `GET /api/projects/[id]/narrative` | RLS | RLS (membership) | No |
| `POST /api/projects/[id]/narrative/review` | isOwner check | role: owner | No |
| `PATCH /api/projects/[id]/status` | Admin only | Admin only (unchanged) | No |

**Key insight:** No existing behavior breaks. The migration is purely additive — every project owner retains exactly the same access they have today, plus collaborators gain access to shared projects.

---

## 9. Summary

### New Tables
- `project_members` — user-project-role junction table
- `project_invitations` — email-based invite tokens
- `user_profiles` — lightweight user display info

### New Column
- `projects.visibility` — `private` | `shared`

### New API Endpoints
- `GET /api/projects/[id]/members` — list members + pending invitations
- `POST /api/projects/[id]/members/invite` — send invitation
- `POST /api/invitations/accept` — accept invitation by token
- `GET /api/invitations` — list user's pending invitations
- `DELETE /api/projects/[id]/members/[userId]` — remove member or leave
- `PATCH /api/projects/[id]/members/[userId]` — change role
- `POST /api/projects/[id]/members/transfer` — transfer ownership
- `DELETE /api/projects/[id]/members/invite/[invitationId]` — revoke invitation

### RLS Changes
- 7 existing policies rewritten to use `is_project_member()` / `get_project_role()`
- 12 new policies for new tables + previously unprotected tables
- Helper SQL functions: `is_project_member()`, `get_project_role()`

### Migration
- 6-phase migration preserving backward compatibility
- Backfill creates owner memberships for all existing projects
- Zero downtime — new and old policies coexist during transition
