# Launchpad Portal — Architecture Research for Collaboration Feature

> Research completed by Systems Engineer agent
> Date: 2026-02-13

---

## 1. Current Authentication System

### Auth Method: Magic Link (Passwordless)

The portal uses **Supabase Auth with magic link (OTP) emails**. There are no passwords anywhere.

**Flow:**

1. User enters email at `/sign-in` page
2. Client calls `POST /api/auth/sign-in` (server-side route)
3. Server-side route uses admin client to auto-provision user if they don't exist (`admin.createUser`), then sends OTP via anon client (`signInWithOtp`)
4. User clicks magic link in email → redirected to `/auth/callback`
5. Callback page handles both **implicit flow** (hash fragment tokens) and **PKCE** (query param code) — calls `setSession()` or `exchangeCodeForSession()`
6. Session stored as HTTP-only cookie via `@supabase/ssr`
7. Middleware (`middleware.ts`) validates session on every request via `getUser()` (server-validated, not just JWT decode)

### Three Supabase Clients

| Client | File | Auth Level | Used For |
|--------|------|-----------|----------|
| **Browser client** | `lib/supabase/client.ts` | Anon key, implicit flow | Client-side auth actions |
| **Server client** | `lib/supabase/server.ts` | Anon key + user cookies | SSR pages & API routes (RLS-scoped) |
| **Admin client** | `lib/supabase/admin.ts` | Service role key | Bypasses RLS — admin ops, pipeline, notifications |

### Access Control Layers

**Layer 1: Middleware (`middleware.ts`)**
- Validates session via `getUser()` on every request
- Public routes: `/sign-in`, `/auth/callback`, `/api/auth`
- Redirects unauthenticated users to `/sign-in`
- Checks email whitelist via `isAllowedUser()` — blocks unauthorized users

**Layer 2: `isAllowedUser()` function (`lib/auth.ts`)**
- Admins always allowed (checked via `isAdmin()`)
- Domain-based: `ALLOWED_DOMAINS` env var (e.g., "shareability.com")
- Individual: `ALLOWED_EMAILS` env var
- If neither env var is set → open access (anyone can sign in)

**Layer 3: `isAdmin()` function (`lib/auth.ts`)**
- Email match against `ADMIN_EMAILS` env var (comma-separated list)
- No database role column — purely env-var based
- `getAdminUserIds()` resolves admin emails to Supabase user IDs, cached 5 minutes

**Key Insight: No user profiles table.** User identity is just `auth.users` from Supabase. Admin detection is email-based via env var. There is no "user profile", "display name", or "role" stored in the database.

---

## 2. Data Model

### Tables (9 total)

```
projects                 ← Core entity, one per PitchApp engagement
project_narratives       ← Versioned story documents with approval workflow
scout_messages           ← AI chat history + structured edit briefs
notifications            ← User notification inbox
pitchapp_manifests       ← Section metadata for Scout AI context
pipeline_jobs            ← Automation job queue
automation_log           ← Audit trail with cost tracking
analytics_events         ← Viewer engagement data (lightweight, no PII)
pitchapp_versions        ← Deployment history
brand_assets             ← Uploaded brand images/fonts/files
```

### The `projects` Table (Core Entity)

```sql
projects (
  id UUID PK,
  user_id UUID → auth.users NOT NULL,    ← THE OWNER
  company_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  type TEXT (investor_pitch | client_proposal | research_report | website | other),
  status TEXT (requested | narrative_review | brand_collection | in_progress | review | revision | live | on_hold),
  autonomy_level TEXT (manual | supervised | full_auto),
  pitchapp_url TEXT,
  target_audience TEXT,
  materials_link TEXT,
  timeline_preference TEXT,
  notes TEXT,
  revision_cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**Key column: `user_id`** — This is the single-owner foreign key. Every project belongs to exactly one user. There is no concept of multiple users on a project.

### Related Tables — All Scoped via `project_id`

| Table | Scoped By | Relationship |
|-------|----------|--------------|
| `scout_messages` | `project_id → projects(id) CASCADE` | Chat messages per project |
| `notifications` | `user_id → auth.users` + `project_id` | Per-user, optionally linked to project |
| `pitchapp_manifests` | `project_id → projects(id)` | One manifest per project |
| `pipeline_jobs` | `project_id → projects(id)` | Jobs queued per project |
| `automation_log` | `project_id` (nullable) | Audit entries per project |
| `project_narratives` | `project_id → projects(id) CASCADE` | Versioned narratives |
| `brand_assets` | `project_id` | Uploaded brand files per project |
| `analytics_events` | `project_id` | Viewer analytics |
| `pitchapp_versions` | `project_id` | Deploy history |

### Storage Buckets

| Bucket | Purpose | Path Pattern |
|--------|---------|-------------|
| `documents` | Uploaded materials (PDFs, docs, images) | `{project_id}/{timestamp}_{filename}` |
| `brand-assets` | Brand images, fonts, logos | `{project_id}/{category}/{timestamp}_{filename}` |

---

## 3. How Projects Are Scoped to Users Today

### Single-Owner Model

Every project has exactly one `user_id`. The ownership chain:

```
auth.users (id) ← projects.user_id ← scout_messages.project_id
                                    ← brand_assets.project_id
                                    ← notifications.user_id
                                    ← etc.
```

### RLS (Row Level Security) — Enforced at Database Level

From `supabase/migration.sql`:

**Projects:**
```sql
-- Users can only see/create/update their own projects
create policy "clients_own_projects_select" on projects
  for select using (auth.uid() = user_id);
create policy "clients_own_projects_insert" on projects
  for insert with check (auth.uid() = user_id);
create policy "clients_own_projects_update" on projects
  for update using (auth.uid() = user_id);
```

**Scout messages:**
```sql
-- Users see messages for projects they own
create policy "clients_own_messages_select" on scout_messages
  for select using (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
create policy "clients_own_messages_insert" on scout_messages
  for insert with check (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
```

**Notifications:**
```sql
-- Users see and update their own notifications only
create policy "clients_own_notifications_select" on notifications
  for select using (auth.uid() = user_id);
create policy "clients_update_own_notifications" on notifications
  for update using (auth.uid() = user_id);
```

**Service-role-only tables** (`pipeline_jobs`, `automation_log`, `analytics_events`, `pitchapp_versions`, `pitchapp_manifests`, `brand_assets`) have no user-facing RLS policies — only accessible via admin/service role client.

### Application-Level Access Checks

The API routes implement a consistent pattern:

**Pattern A: Rely on RLS (most routes)**
```ts
// Server client with user cookies → RLS filters automatically
const supabase = await createClient();
const { data: project } = await supabase
  .from("projects").select("*").eq("id", id).single();
// If user doesn't own it, RLS returns null → 404
```

Used in: Dashboard page, project detail page, scout route, narrative route

**Pattern B: Explicit ownership check + admin bypass**
```ts
// Used in documents & brand-assets routes
async function verifyAccess(projectId: string) {
  const { data: project } = await client
    .from("projects").select("id, user_id").eq("id", projectId).single();
  if (!admin && project.user_id !== user.id) {
    return { error: "forbidden", status: 403 };
  }
}
```

Used in: Documents route, brand-assets route, pipeline route

**Pattern C: Admin-only (service role bypass)**
```ts
// Admin uses service role client → sees all
const admin = isAdmin(user.email);
const client = admin ? createAdminClient() : supabase;
```

Used in: Project list (GET /api/projects), project detail (GET /api/projects/[id]), status updates, admin dashboard

### Dashboard Queries

**Client dashboard (`/dashboard/page.tsx`):**
```ts
const { data: projects } = await supabase
  .from("projects").select("*").order("updated_at", { ascending: false });
// RLS automatically filters to user's own projects
```

**Admin dashboard (`/admin/page.tsx`):**
```ts
const adminClient = createAdminClient(); // bypasses RLS
const { data: projects } = await adminClient.from("projects").select("*");
// Sees all projects, resolves submitter emails via admin.listUsers()
```

**Project detail page (`/project/[id]/page.tsx`):**
```ts
const { data: project } = await supabase
  .from("projects").select("*").eq("id", id).single();
// RLS ensures user only sees their own — if not owner, returns null → 404
```

### Ownership Detection in UI

```ts
// ProjectDetailClient.tsx
const isOwner = project.user_id === userId;
const showApproval = project.status === "review" && isOwner;
const showNarrativeApproval = project.status === "narrative_review" && isOwner;
```

This `isOwner` check gates UI actions like approval, narrative review, brand asset management. Currently it's always `true` for non-admin users (RLS prevents seeing non-owned projects).

---

## 4. Current RLS Policies (Complete Inventory)

### User-Scoped Tables (RLS enforces ownership)

| Table | Operation | Policy | Logic |
|-------|-----------|--------|-------|
| `projects` | SELECT | `clients_own_projects_select` | `auth.uid() = user_id` |
| `projects` | INSERT | `clients_own_projects_insert` | `auth.uid() = user_id` |
| `projects` | UPDATE | `clients_own_projects_update` | `auth.uid() = user_id` |
| `scout_messages` | SELECT | `clients_own_messages_select` | `project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())` |
| `scout_messages` | INSERT | `clients_own_messages_insert` | `project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())` |
| `notifications` | SELECT | `clients_own_notifications_select` | `auth.uid() = user_id` |
| `notifications` | UPDATE | `clients_update_own_notifications` | `auth.uid() = user_id` |
| `notifications` | INSERT | `service_role_insert_notifications` | `with check (true)` — service role only |

### Service-Role-Only Tables

These tables have RLS enabled but **no user-facing policies** — only the service role key can read/write:

- `pipeline_jobs`
- `automation_log`
- `analytics_events`
- `pitchapp_versions`
- `pitchapp_manifests`
- `brand_assets`
- `project_narratives` (has SELECT policies scoped via project ownership subquery)

### Key RLS Gap: No DELETE Policies on Projects

The migration only defines SELECT/INSERT/UPDATE on projects. DELETE is not defined in user-facing RLS — deletion is admin-only via service role client in the API route.

---

## 5. Existing Multi-User / Sharing Patterns

### Finding: **There are ZERO existing collaboration, sharing, invitation, or team patterns.**

Exhaustive search confirms:
- No `project_members` or `project_collaborators` table
- No invitation tokens, share links, or access codes
- No organization/team/workspace concept
- No "shared with me" views
- No transfer ownership functionality
- No role-based access beyond admin/non-admin

### What Exists That's Relevant

1. **Admin bypass pattern** — The `isAdmin()` + service role client pattern gives admins access to all projects. This is the closest thing to multi-user access, but it's all-or-nothing.

2. **Notification system** — The `notifications` table already supports per-user notifications linked to projects. This could be extended for collaboration notifications.

3. **Email system** — Resend-based email notifications already exist (`lib/email.ts`). Invitation emails would follow the same pattern.

4. **`submitter_email` pattern** — Admin dashboard resolves user emails from `auth.users` for display. This pattern would be reused for showing collaborator info.

5. **`isOwner` flag in UI** — `ProjectDetailClient.tsx` already computes `isOwner` to gate certain actions. This is the natural extension point for role-based permissions.

---

## 6. Gaps and Risks for Adding Collaboration

### Gap 1: Single-Owner Data Model
- `projects.user_id` is a single FK — there's no way to express "User A and User B both have access"
- **Required:** A junction table (e.g., `project_members`) mapping users to projects with roles
- **RLS impact:** Every policy that checks `auth.uid() = user_id` must be rewritten to check membership

### Gap 2: No User Profiles
- Users are just `auth.users` entries — no display names, avatars, or profile data
- Collaboration UX needs to show "who" — at minimum, email addresses displayed
- **Required:** Either a `user_profiles` table or resolve from `auth.users` on demand (current admin pattern)
- **Risk:** `auth.admin.listUsers()` is expensive and has rate limits — not suitable for frequent lookups

### Gap 3: RLS Policies Must Change
- Current policies: `auth.uid() = user_id` (single owner)
- New policies: `auth.uid() IN (SELECT user_id FROM project_members WHERE project_id = ...)`
- **All 7 user-facing policies must be rewritten**
- Scout messages, notifications, and narratives inherit access through project ownership — their policies use subqueries on `projects.user_id` which must also change

### Gap 4: No Invitation Flow
- No token-based invitation system exists
- The magic link auth flow creates users on demand — inviting a non-existent user would work (auto-provision), but the invitation acceptance flow needs building
- **Required:** `project_invitations` table + email templates + acceptance flow

### Gap 5: Admin vs Collaborator Permission Granularity
- Currently: admin = god mode, everyone else = own projects only
- Collaboration introduces roles: owner, editor, viewer
- Actions that need role gating: approve PitchApp, upload docs, send Scout messages, delete project, manage brand assets
- **Required:** Permission matrix per role, enforced in both API routes and UI

### Gap 6: Notification Routing
- Notifications are currently sent to the project owner (`existingProject.user_id`)
- With collaboration, key events (status changes, new briefs, approvals) should notify all project members
- **Required:** Helper function to get all members of a project for notification fan-out

### Gap 7: Pipeline & Automation
- Pipeline jobs reference `project_id` not `user_id` — no change needed
- Automation cron scripts use service role — no change needed
- Admin notifications for new projects go to `ADMIN_EMAILS` — no change needed
- **Low risk** — pipeline layer is decoupled from user access

### Gap 8: Storage Access
- Documents and brand assets are stored under `{project_id}/` paths
- Access is controlled at the API route level (verifyAccess checks ownership)
- With collaboration, `verifyAccess()` must check membership instead of `user_id` match
- Storage bucket policies may need updating if using Supabase Storage RLS

### Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| RLS policy rewrite breaks existing access | **HIGH** | Incremental migration, test with both old and new policies |
| No user profiles = poor UX | **MEDIUM** | Start with email-only display, add profiles later |
| Notification fan-out to all members | **MEDIUM** | Reusable helper, batch inserts |
| Invitation email deliverability | **LOW** | Already using Resend for auth emails |
| Pipeline unaffected | **LOW** | Service role bypasses RLS, no user-facing changes |
| Storage permissions | **MEDIUM** | API routes control access — update verifyAccess |

---

## 7. Files That Must Change for Collaboration

### Database (New Tables + Migration)
- New migration SQL for `project_members`, `project_invitations`, optionally `user_profiles`
- Updated RLS policies on `projects`, `scout_messages`, `notifications`, `project_narratives`

### Backend — API Routes (Access Control Changes)
| File | Change Needed |
|------|--------------|
| `src/app/api/projects/route.ts` | GET: Query via membership, not just `user_id`. POST: Auto-add creator as owner member |
| `src/app/api/projects/[id]/route.ts` | PATCH/DELETE: Check membership + role |
| `src/app/api/projects/[id]/documents/route.ts` | `verifyAccess`: Check membership |
| `src/app/api/projects/[id]/brand-assets/route.ts` | `verifyAccess`: Check membership |
| `src/app/api/projects/[id]/approve/route.ts` | Owner-only approval check |
| `src/app/api/projects/[id]/status/route.ts` | Notify all members, not just owner |
| `src/app/api/projects/[id]/pipeline/route.ts` | Check membership for viewing |
| `src/app/api/projects/[id]/narrative/route.ts` | Check membership for viewing |
| `src/app/api/projects/[id]/narrative/review/route.ts` | Owner-only or editor role |
| `src/app/api/scout/route.ts` | RLS already handles via project ownership subquery — will work if RLS updated |
| `src/app/api/notifications/route.ts` | Already user-scoped — no change if notifications target individual members |

### Backend — New API Routes Needed
| Route | Purpose |
|-------|---------|
| `POST /api/projects/[id]/invite` | Send invitation |
| `DELETE /api/projects/[id]/members/[userId]` | Remove member |
| `PATCH /api/projects/[id]/members/[userId]` | Change role |
| `GET /api/projects/[id]/members` | List members |
| `POST /api/invitations/accept` | Accept invitation |
| `GET /api/invitations` | List pending invitations for current user |

### Frontend — Pages
| File | Change Needed |
|------|--------------|
| `src/app/dashboard/page.tsx` | Query must include projects where user is a member |
| `src/app/dashboard/DashboardClient.tsx` | Show role badges, "shared with me" section |
| `src/app/project/[id]/page.tsx` | Pass membership/role info to client |
| `src/app/project/[id]/ProjectDetailClient.tsx` | Role-based UI gating (replace `isOwner` with role check) |

### Frontend — New Components Needed
| Component | Purpose |
|-----------|---------|
| `InviteModal` | Email input + role selector + send |
| `MembersList` | Show current members + roles |
| `InvitationBanner` | "You were invited to..." acceptance UI |
| `RoleBadge` | Visual indicator of user's role on a project |

### Auth / Lib
| File | Change Needed |
|------|--------------|
| `src/lib/auth.ts` | New helpers: `getProjectMembers()`, `checkProjectAccess()` |
| `src/lib/email.ts` | New template: invitation email |

---

## 8. Summary

The Launchpad Portal is a well-architected single-owner system. The clean separation between user-scoped (RLS) and admin (service role) access patterns provides a solid foundation, but collaboration requires fundamental changes:

1. **New junction table** (`project_members`) to replace single `user_id` ownership
2. **RLS policy rewrite** — every user-facing policy must check membership
3. **Role system** — owner/editor/viewer with per-action permissions
4. **Invitation flow** — email-based, leveraging existing Resend + magic link patterns
5. **Notification fan-out** — events notify all members, not just the owner
6. **UI role gating** — replace `isOwner` boolean with role-based permission checks

The pipeline/automation layer is clean — it uses service role and won't need changes. The biggest risk is the RLS migration, which must be done atomically to avoid breaking existing access.
