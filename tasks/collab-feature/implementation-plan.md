# Collaboration Feature — Unified Implementation Plan

> Synthesized by Technical Product Lead
> Date: 2026-02-13
>
> **Source documents:**
> - `architecture-research.md` — Current system analysis (systems-eng)
> - `data-model-design.md` — Data model, API, permissions (tech-lead)
> - `ux-vision.md` — UX flows, product decisions (creative-lead)
> - `ui-components-design.md` — Component specs, responsive, a11y (ux-dev)

---

## Design Reconciliation

Before phases, here are the design decisions that reconcile differences across the four documents:

### 1. Table naming: `project_members` + `project_invitations`

The data model uses two tables (`project_members` for active memberships, `project_invitations` for pending invites). The UX/UI docs reference a single `project_collaborators` table with a `status` field. **We go with the two-table approach** — it produces cleaner RLS policies (active members get access; pending invitations don't grant access until accepted/activated).

### 2. Invitation flow: Hybrid (immediate for existing users, token for new users)

The data model spec proposed a token-based accept flow for all invitations. The UX vision says "no accept/reject gate — existing users get immediate access." **Reconciled approach:**

- **Existing Launchpad user**: Create `project_members` record immediately on invite. No token needed. User sees the project on their dashboard on next visit. Invitation email is a notification, not a permission gate.
- **Non-existing user**: Create `project_invitations` record with token. Email contains magic link to sign-in with redirect to the project. On first sign-in, middleware/callback checks for pending invitations matching the email and auto-creates `project_members` records.

This means `project_invitations` is only used for users who don't have accounts yet. For existing users, the flow is: invite → immediate `project_members` insert → done.

### 3. Who can invite: Owners only (v1)

The data model allowed editors to invite. The UX vision restricts to owners only for v1. **We go with owners only** — simpler permission model, prevents permission creep. The RLS and API contracts in the data model spec should be narrowed accordingly (remove editor invite permissions).

### 4. Ownership transfer: Deferred (not in v1)

The data model spec included a transfer endpoint. The UX vision says "not in v1." **Deferred.** The `POST /api/projects/[id]/members/transfer` endpoint is designed but not implemented in v1. The data model supports it without changes.

### 5. Scout message attribution: Add `sender_id` column

The UX vision raised this question. For multi-user Scout, we **add `sender_id UUID REFERENCES auth.users(id)` to `scout_messages`**. This is a simple nullable column addition — existing messages have `sender_id = NULL` (implying the original owner). New messages from collaborators include the sender's user ID. The UI can then display "sarah:" vs "aj:" prefixes on user messages.

### 6. TypeScript type naming: `MemberRole`

Standardize on `MemberRole` (not `CollaboratorRole`) since the database table is `project_members`. Types: `'owner' | 'editor' | 'viewer'`.

### 7. `isAllowedUser()` middleware extension

The UX vision identified that invited users who aren't in `ALLOWED_DOMAINS` or `ALLOWED_EMAILS` would be blocked by middleware. **Fix: Extend `isAllowedUser()` to check for active `project_members` records or pending `project_invitations` matching the user's email.** This is a database call, so it needs the admin client and should be cached briefly.

---

## Phase 1: Database + RLS

**Goal:** All new tables, functions, triggers, RLS policies, and backfill. After this phase, the database supports collaboration — but no UI or API changes yet.

**Complexity:** Medium — requires careful RLS policy migration to avoid breaking existing access.

### 1.1 Create new tables

```sql
-- user_profiles (lightweight display info)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- project_members (active memberships)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- project_invitations (pending invites for non-existing users)
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

-- Indexes
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_invitations_token ON project_invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_email ON project_invitations(email) WHERE status = 'pending';
```

### 1.2 Add columns to existing tables

```sql
-- Visibility on projects
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'shared'));

-- Scout message sender attribution
ALTER TABLE scout_messages ADD COLUMN sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

### 1.3 Helper functions

```sql
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_project_role(p_project_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 1.4 Trigger: auto-create owner membership on project insert

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

### 1.5 Backfill existing data

```sql
-- Create owner memberships for all existing projects
INSERT INTO project_members (project_id, user_id, role)
SELECT id, user_id, 'owner' FROM projects
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Create user profiles from existing auth users
INSERT INTO user_profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

### 1.6 RLS policies — new tables

```sql
-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_profiles" ON user_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());
CREATE POLICY "own_profile_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- project_members
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

-- project_invitations
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_invitations" ON project_invitations
  FOR SELECT USING (
    is_project_member(project_id, auth.uid())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
CREATE POLICY "owners_insert_invitations" ON project_invitations
  FOR INSERT WITH CHECK (get_project_role(project_id, auth.uid()) = 'owner');
```

### 1.7 RLS policies — update existing tables

**Strategy:** Add new membership-based policies alongside existing ownership policies. Both coexist (PostgreSQL RLS uses OR across policies for same operation). Then drop old policies after verification.

```sql
-- Step A: Add new policies (additive — won't break existing access)

-- projects: members can see projects they're on
CREATE POLICY "members_select_projects" ON projects
  FOR SELECT USING (is_project_member(id, auth.uid()));

-- projects: owners and editors can update
CREATE POLICY "members_update_projects" ON projects
  FOR UPDATE USING (get_project_role(id, auth.uid()) IN ('owner', 'editor'));

-- scout_messages: all members can read
CREATE POLICY "members_select_messages" ON scout_messages
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- scout_messages: owners and editors can write
CREATE POLICY "members_insert_messages" ON scout_messages
  FOR INSERT WITH CHECK (
    get_project_role(project_id, auth.uid()) IN ('owner', 'editor')
  );

-- brand_assets: members can read, editors can write
CREATE POLICY "members_select_brand_assets" ON brand_assets
  FOR SELECT USING (is_project_member(project_id, auth.uid()));
CREATE POLICY "editors_insert_brand_assets" ON brand_assets
  FOR INSERT WITH CHECK (get_project_role(project_id, auth.uid()) IN ('owner', 'editor'));
CREATE POLICY "editors_delete_brand_assets" ON brand_assets
  FOR DELETE USING (get_project_role(project_id, auth.uid()) IN ('owner', 'editor'));

-- project_narratives: members can read
CREATE POLICY "members_select_narratives" ON project_narratives
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- Step B: Verify (test with real users)

-- Step C: Drop old policies
DROP POLICY IF EXISTS "clients_own_projects_select" ON projects;
DROP POLICY IF EXISTS "clients_own_projects_insert" ON projects;
DROP POLICY IF EXISTS "clients_own_projects_update" ON projects;
DROP POLICY IF EXISTS "clients_own_messages_select" ON scout_messages;
DROP POLICY IF EXISTS "clients_own_messages_insert" ON scout_messages;
```

### 1.8 Verification queries

```sql
-- Every project has exactly one owner membership
SELECT p.id FROM projects p
LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
WHERE pm.id IS NULL;
-- Expected: 0 rows

-- No duplicate memberships
SELECT project_id, user_id, COUNT(*)
FROM project_members GROUP BY project_id, user_id HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

### Files changed in Phase 1
- New: `supabase/migrations/YYYYMMDD_collaboration.sql`

---

## Phase 2: API Routes

**Goal:** All new API endpoints for collaboration, plus updates to existing routes to use role-based access.

**Complexity:** Medium — mostly new route files following existing patterns. The main risk is updating `verifyAccess()` across all existing routes.

### 2.1 New shared access helper

**File:** `src/lib/auth.ts` — add these functions:

```typescript
// Replace verifyAccess pattern across all routes
async function verifyProjectAccess(
  projectId: string,
  requiredRole?: MemberRole | MemberRole[]
): Promise<AccessResult | { error: string; status: number }>

// Get all members of a project for notification fan-out
async function getProjectMemberIds(
  projectId: string,
  excludeUserId?: string
): Promise<string[]>

// Extend isAllowedUser to check for project memberships/invitations
async function isAllowedUserExtended(email: string): Promise<boolean>
```

### 2.2 New API routes

| Route | File | Method | Purpose |
|-------|------|--------|---------|
| `/api/projects/[id]/members` | `route.ts` | GET | List members + pending invitations |
| `/api/projects/[id]/members/invite` | `route.ts` | POST | Invite user by email |
| `/api/projects/[id]/members/[userId]` | `route.ts` | DELETE | Remove member |
| `/api/projects/[id]/members/[userId]` | `route.ts` | PATCH | Change member role |
| `/api/projects/[id]/members/invite/[invitationId]` | `route.ts` | DELETE | Revoke pending invitation |
| `/api/invitations` | `route.ts` | GET | List current user's pending invitations |
| `/api/invitations/accept` | `route.ts` | POST | Accept invitation (for non-existing user flow) |

### 2.3 Invite flow logic (key route)

`POST /api/projects/[id]/members/invite`:

```
1. Verify caller is owner (verifyProjectAccess with requiredRole: 'owner')
2. Validate email format, not self-invite, not already a member
3. Check if email belongs to existing Launchpad user:
   a. YES (user exists in auth.users):
      - Insert into project_members immediately (role from request)
      - Send notification to invitee (in-app)
      - Send email notification via Resend
      - Return { status: 'active' }
   b. NO (user doesn't exist):
      - Insert into project_invitations (generates token)
      - Send invitation email with magic link: {APP_URL}/sign-in?redirect=/project/{id}
      - Return { status: 'pending' }
4. Notify all existing project members
```

### 2.4 Middleware update

`src/middleware.ts` — extend `isAllowedUser()` call:

```
Before: isAllowedUser(email) checks ADMIN_EMAILS, ALLOWED_DOMAINS, ALLOWED_EMAILS
After:  isAllowedUser(email) also checks project_members and project_invitations tables
```

Use admin client (service role) for this check. Cache result for the session duration to avoid repeated DB calls per request.

### 2.5 Auth callback update

`src/app/auth/callback/page.tsx` — after successful authentication:

```
1. Ensure user_profiles record exists (upsert)
2. Check project_invitations for matching email with status 'pending'
3. For each pending invitation:
   a. Create project_members record
   b. Update invitation status to 'accepted'
   c. Notify project members
```

### 2.6 Update existing routes

Replace `verifyAccess()` → `verifyProjectAccess()` with appropriate role requirements:

| Route | Required Role |
|-------|--------------|
| `GET /api/projects/[id]` | Any member |
| `PATCH /api/projects/[id]` | `owner` or `editor` |
| `DELETE /api/projects/[id]` | `owner` (or admin) |
| `GET /api/projects/[id]/documents` | Any member |
| `POST /api/projects/[id]/documents` | `owner` or `editor` |
| `DELETE /api/projects/[id]/documents` | `owner` or `editor` |
| `GET /api/projects/[id]/brand-assets` | Any member |
| `POST /api/projects/[id]/brand-assets` | `owner` or `editor` |
| `PATCH /api/projects/[id]/brand-assets` | `owner` or `editor` |
| `DELETE /api/projects/[id]/brand-assets` | `owner` or `editor` |
| `POST /api/scout` | `owner` or `editor` |
| `POST /api/projects/[id]/approve` | `owner` |
| `POST /api/projects/[id]/start-build` | `owner` |
| `GET /api/projects/[id]/narrative` | Any member |
| `POST /api/projects/[id]/narrative/review` | `owner` |
| `GET /api/projects/[id]/pipeline` | Any member |
| `PATCH /api/projects/[id]/status` | Admin only (unchanged) |

### 2.7 Update Scout route for sender attribution

`POST /api/scout` — when persisting user messages, include `sender_id: user.id`.

### 2.8 Update notification fan-out

All routes that currently notify just the project owner should use `getProjectMemberIds()` to notify all members:

- `POST /api/projects/[id]/status` — status change notifications
- `POST /api/scout` — edit brief submission notifications
- `POST /api/projects/[id]/narrative/review` — narrative decision notifications

### 2.9 Update dashboard query

`GET /api/projects` — include projects where user is a member (not just owner):

```typescript
// For non-admin users:
// 1. Owned projects (existing query, unchanged — RLS handles it)
// 2. Shared projects: query project_members → join projects
const { data: memberships } = await supabase
  .from("project_members")
  .select("role, projects(*)")
  .neq("role", "owner");  // exclude owned (already in main query)
```

### Files changed in Phase 2
- Modified: `src/lib/auth.ts`
- Modified: `src/middleware.ts`
- Modified: `src/app/auth/callback/page.tsx`
- Modified: All existing `src/app/api/projects/[id]/*` route files (verifyAccess swap)
- Modified: `src/app/api/scout/route.ts` (sender_id)
- Modified: `src/app/api/projects/route.ts` (dashboard query)
- New: `src/app/api/projects/[id]/members/route.ts`
- New: `src/app/api/projects/[id]/members/invite/route.ts`
- New: `src/app/api/projects/[id]/members/invite/[invitationId]/route.ts`
- New: `src/app/api/projects/[id]/members/[userId]/route.ts`
- New: `src/app/api/invitations/route.ts`
- New: `src/app/api/invitations/accept/route.ts`
- Modified: `src/types/database.ts` (new types)

---

## Phase 3: UI Components

**Goal:** All new React components and modifications to existing components. After this phase, the collaboration UI is functional.

**Complexity:** Medium — 7 new components (~415 lines), modifications to 6 existing components (~50 lines of changes). All following established Launchpad design patterns.

### 3.1 New components (build in this order)

| # | Component | Lines | Dependencies |
|---|-----------|-------|-------------|
| 1 | `RoleBadge.tsx` | ~25 | None |
| 2 | `SharedBadge.tsx` | ~15 | `RoleBadge` |
| 3 | `CollaboratorAvatars.tsx` | ~60 | None |
| 4 | `ShareButton.tsx` | ~15 | None |
| 5 | `CollaboratorList.tsx` | ~80 | `RoleBadge` |
| 6 | `InviteForm.tsx` | ~100 | `RoleBadge` |
| 7 | `ShareModal.tsx` | ~120 | `CollaboratorList`, `InviteForm`, `TerminalChrome` |

Build order matters: RoleBadge first (reused by 3 other components), ShareModal last (depends on CollaboratorList + InviteForm).

### 3.2 Modify existing components

| # | Component | Changes |
|---|-----------|---------|
| 1 | `ProjectCard.tsx` | Add `isShared`, `ownerEmail`, `userRole` props. Render `SharedBadge` + footer "via" line for shared projects. |
| 2 | `Nav.tsx` | Add `userRole` prop. Show `RoleBadge` in nav for non-owners. |
| 3 | `ScoutChat.tsx` | Add `readOnly` prop. Replace input area with informational message for viewers. Disable suggested prompts, attachments, drag-drop when read-only. |
| 4 | `DashboardClient.tsx` | Add `sharedProjects` prop. Add ownership filter tabs ("all" / "my projects" / "shared with me"). Add shared count in header summary. Merge and sort projects. |
| 5 | `ProjectDetailClient.tsx` | Add `userRole`, `collaborators` props. Replace `isOwner` boolean with role-based checks. Add `ShareButton`, `CollaboratorAvatars`, `ShareModal`. Wire `readOnly` to `BrandAssetsPanel` and `ScoutChat` for viewers. |
| 6 | `BrandAssetsPanel.tsx` | Wire existing `readOnly` prop to viewer role check (change is in `ProjectDetailClient`, not this file). |

### 3.3 Server page changes

| Page | Changes |
|------|---------|
| `dashboard/page.tsx` | Fetch shared projects via `project_members` join. Pass both arrays to `DashboardClient`. |
| `project/[id]/page.tsx` | Determine user role from `project_members`. Fetch collaborators list. Pass `userRole` and `collaborators` to `ProjectDetailClient`. |

### 3.4 Invitation email template

Add to `src/lib/email.ts`:

```typescript
async function sendInvitationEmail({
  to: string,
  inviterEmail: string,
  projectName: string,
  role: string,
  loginUrl: string,  // for non-existing users
})
```

Uses existing Resend setup. Simple text email (matches existing notification email style).

### Files changed in Phase 3
- New: `src/components/RoleBadge.tsx`
- New: `src/components/SharedBadge.tsx`
- New: `src/components/CollaboratorAvatars.tsx`
- New: `src/components/ShareButton.tsx`
- New: `src/components/CollaboratorList.tsx`
- New: `src/components/InviteForm.tsx`
- New: `src/components/ShareModal.tsx`
- Modified: `src/components/ProjectCard.tsx`
- Modified: `src/components/Nav.tsx`
- Modified: `src/components/ScoutChat.tsx`
- Modified: `src/app/dashboard/DashboardClient.tsx`
- Modified: `src/app/dashboard/page.tsx`
- Modified: `src/app/project/[id]/ProjectDetailClient.tsx`
- Modified: `src/app/project/[id]/page.tsx`
- Modified: `src/lib/email.ts`

---

## Phase 4: Integration + Polish

**Goal:** End-to-end testing, edge case handling, and polish. Ship-ready after this phase.

**Complexity:** Low-medium — mostly testing and fixing edge cases, not new features.

### 4.1 Integration tests

| Test | What it validates |
|------|-------------------|
| Owner invites existing user | Member created, notification sent, project visible on invitee's dashboard |
| Owner invites non-existing user | Invitation created, email sent, user signs up → auto-membership, project visible |
| Editor uses Scout | Can send messages, upload files, submit edit briefs |
| Viewer sees project | Can view all content, Scout is read-only, no upload buttons |
| Owner removes member | Membership deleted, project disappears from removed user's dashboard |
| Owner changes role | Role updated, UI permissions change (e.g., editor → viewer loses Scout access) |
| RLS enforcement | Direct Supabase queries from non-member return empty results |
| Admin override | Admins can view/edit all projects regardless of membership |
| Middleware allowlist | Invited user not in ALLOWED_DOMAINS can still sign in and access project |
| Concurrent invites | Multiple invitations to same email don't create duplicate memberships |

### 4.2 Edge cases to handle

| Edge case | Handling |
|-----------|---------|
| Invite yourself | 400 error: "cannot invite yourself" |
| Invite existing member | 409 error: "{email} already has access" |
| Invite to non-existent project | 404 (normal — RLS blocks visibility) |
| Remove last owner | 403 error: "project must have an owner" (enforced in API) |
| Revoke accepted invitation | No-op (invitation already accepted, membership persists) |
| User deletes account with memberships | CASCADE deletes memberships. If owner, project is orphaned → background job periodically cleans orphaned projects or warns. |
| Expired invitation clicked | 410 error: "invitation expired. ask the owner to re-invite." |
| Token reuse after accept | 410 error: "invitation already used" |

### 4.3 Accessibility audit

- All new modals: focus trap, Escape to close, `aria-modal`, `aria-labelledby`
- Role badges: `aria-label` for screen readers
- Remove buttons: `aria-label` with collaborator email
- Read-only Scout: informational text readable by screen readers
- Keyboard navigation: full Tab cycle through ShareModal
- `prefers-reduced-motion`: disable modal transitions

### 4.4 Mobile testing

- ShareModal fills viewport correctly at all breakpoints
- CollaboratorAvatars wrap/stack on narrow screens
- Email truncation in CollaboratorList (`truncate max-w-[180px]`)
- Touch targets meet 44px minimum for remove buttons
- Dashboard filter tabs scrollable horizontally on mobile

### 4.5 Performance considerations

- `is_project_member()` SQL function is called on every RLS check. Ensure `idx_project_members_user` and `idx_project_members_project` indexes are used. The function is `STABLE` so Postgres can cache it within a transaction.
- Dashboard query now includes a join to `project_members`. Monitor query plan for performance.
- `isAllowedUser()` middleware check adds a DB call. Cache per session (already uses cookie-based sessions).
- Notification fan-out for large teams: batch insert. For v1, limit to 10 members per project max.

### Files changed in Phase 4
- No new files — this is testing, fixes, and polish on existing Phase 1-3 work.

---

## Implementation Sequence

```
Phase 1: Database + RLS          ████████████ (first — everything depends on this)
Phase 2: API Routes              ████████████████ (depends on Phase 1)
Phase 3: UI Components           ████████████████ (depends on Phase 2 for API calls)
Phase 4: Integration + Polish    ████████ (depends on Phase 3)
```

**Total estimated scope:**
- ~1 migration file (Phase 1)
- ~8 new API route files + 10 modified route files (Phase 2)
- ~7 new component files + 8 modified component/page files (Phase 3)
- ~25 new/modified files total

---

## What's NOT In v1

Explicitly deferred to keep scope tight:

| Feature | Why deferred |
|---------|-------------|
| Public link sharing | P1 feature — clean follow-up, doesn't affect data model |
| Ownership transfer | Complex edge cases ("last owner leaves"), low priority |
| Multiple owners | Complicates permission model significantly |
| Teams / organizations | Adds billing, group management — no current demand |
| Real-time presence | Requires WebSocket/Supabase Realtime — separate initiative |
| Activity feed / audit log | Nice-to-have, not blocking core collaboration |
| Comments on sections | Separate feature entirely |
| Collaborator avatars on cards | P1 polish — `CollaboratorAvatars` component is designed, just don't render it on cards in v1 |
| Notification preferences | Per-project mute/digest — defer until notification volume is a real problem |

---

## Open Questions for User

1. **Member cap per project?** Should we limit to 10 members per project in v1? This keeps notification fan-out bounded and prevents abuse. (Recommendation: yes, cap at 10.)

2. **Viewer Scout access?** Current design gives viewers read-only access to the full Scout conversation history. Should viewers see Scout at all, or should it be editor+ only? (Recommendation: viewers can see chat history — it's a key value of sharing.)

3. **Account deletion handling?** If the project owner deletes their account, the project becomes orphaned (no owner). Options: (a) auto-delete the project, (b) auto-transfer to next editor, (c) keep orphaned and let admins clean up. (Recommendation: (c) for now — edge case is rare, admin cleanup is fine.)

4. **Should editors see pending invitations in the share modal?** Current design shows the share modal only to owners. But if an editor opens the project detail page, should they see a member list somewhere (without invite/remove capabilities)? (Recommendation: show `CollaboratorAvatars` to everyone, but the full ShareModal with invite/remove is owner-only.)

5. **Scout message sender display?** With `sender_id` added, should Scout chat show sender names/emails for multi-user conversations? Or keep it as "you" / "scout" for now? (Recommendation: show sender email for messages from other collaborators. "you" for own messages, "scout" for assistant.)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RLS policy migration breaks existing access | Medium | High | Additive migration (new policies alongside old), verify before dropping old |
| Performance: `is_project_member()` called per-row in RLS | Low | Medium | Indexed, `STABLE` function, bounded member count |
| Invitation email deliverability | Low | Low | Already using Resend successfully for auth emails |
| Middleware DB call adds latency | Low | Medium | Cache per session, indexed query |
| Orphaned projects on owner deletion | Low | Low | Background cleanup job, admin dashboard visibility |
