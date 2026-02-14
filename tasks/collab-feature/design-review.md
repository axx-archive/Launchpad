# Collaboration Feature — Design Review

> Reviewed by: Code Reviewer
> Date: 2026-02-13
>
> **Documents reviewed:**
> - `architecture-research.md` — Current system analysis
> - `data-model-design.md` — Data model, API, permissions
> - `ux-vision.md` — UX flows, product decisions
> - `ui-components-design.md` — Component specs, responsive, a11y
> - `implementation-plan.md` — Unified synthesis
>
> **Source code validated against:**
> - `apps/portal/src/middleware.ts`
> - `apps/portal/src/lib/auth.ts`
> - `apps/portal/src/app/auth/callback/page.tsx`
> - `apps/portal/src/app/api/projects/[id]/brand-assets/route.ts`
> - `apps/portal/src/app/api/scout/route.ts`
> - `apps/portal/src/types/database.ts`
> - `apps/portal/supabase/migration.sql`

---

## Overall Assessment

The design is thorough, well-reasoned, and the reconciliation between the four source documents is solid. The phased migration strategy (additive policies, parallel coexistence, then drop old) is the right approach. The decision to use two tables (`project_members` + `project_invitations`) instead of one is cleaner for RLS.

That said, I found **3 critical issues**, **5 high-severity issues**, and several medium/low findings that should be addressed before implementation begins.

---

## CRITICAL — Must Fix Before Implementation

### C1. `isAllowedUser()` is synchronous — making it async breaks middleware

**Location:** `src/lib/auth.ts:70`, `src/middleware.ts:42,66`

The implementation plan (§2.4) says: "extend `isAllowedUser()` to check `project_members` and `project_invitations` tables." The current function is **pure synchronous** — it reads env vars only. Making it async requires:

1. Changing the function signature to `async function isAllowedUser(...): Promise<boolean>`
2. Adding `await` at **every call site** in `middleware.ts` (lines 42 and 66)
3. Adding a database query to **every single HTTP request** (middleware runs on all non-static routes)

**Risks:**
- **Latency:** Every request now hits the DB before routing. Even with caching, the first request per session adds ~50-100ms.
- **Error handling:** If the DB call fails, do you block the user or allow them through? Neither is great.
- **Edge function limits:** If middleware runs on Vercel Edge, you need to ensure the Supabase client works in that runtime (it does with `@supabase/ssr`, but the admin client uses the service role key, which should NOT be in Edge middleware — it would be exposed).

**Recommendation:** Don't modify `isAllowedUser()`. Instead:
- Add the invited user's email to `ALLOWED_EMAILS` env var when they're first invited (one-time admin action or automated).
- OR: Create a separate `isInvitedUser()` check that only runs when `isAllowedUser()` returns false, using the **anon client** (not admin) with a lightweight query. This avoids leaking the service role key into middleware.
- OR: Move the invitation check to the auth callback only (not middleware). When a non-allowed user signs in via an invitation link, the callback checks for pending invitations and if found, adds them to the allowlist. Subsequent requests pass the env-var check.

### C2. Missing UPDATE/DELETE RLS policies on `project_invitations`

**Location:** `data-model-design.md` §2.3, `implementation-plan.md` §1.6

The invitation table only has SELECT and INSERT policies. But:
- **Revoke invitation** (`DELETE /api/projects/[id]/members/invite/[invitationId]`) needs to UPDATE `status` to `'revoked'`
- **Accept invitation** (`POST /api/invitations/accept`) needs to UPDATE `status` to `'accepted'` and set `accepted_at`

Neither operation has an RLS policy. If these endpoints use the user's session client, the UPDATE will silently fail (RLS blocks it). If they use the admin client, the policies aren't needed — but this must be explicitly documented.

**Recommendation:** Either:
- Add UPDATE policies: `owners_update_invitations` (for revoke) and a service-role-only update (for accept)
- OR: Document that both operations use the admin client (service role) and explain why

### C3. `projects.user_id` FK is `NO ACTION` — owner account deletion will fail, not cascade

**Location:** `supabase/migration.sql:10`

The existing FK is:
```sql
user_id uuid references auth.users(id) not null
```

No `ON DELETE` clause → PostgreSQL defaults to `NO ACTION` (same as `RESTRICT`). This means: **if the owner tries to delete their Supabase auth account, the deletion FAILS** because `projects.user_id` still references them.

Meanwhile, the new `project_members.user_id` has `ON DELETE CASCADE`. So:
- Deleting the user would cascade-delete their memberships ✓
- But it would FAIL on the `projects.user_id` FK ✗

The data model design (§2.2) says "Deleting the owner's account cascades: project is deleted" — **this is incorrect** given the actual FK constraint.

**Recommendation:** Decide explicitly:
- **Option A:** Keep `NO ACTION` (current behavior). Owner can't delete account while they own projects. Document this. Require ownership transfer or project deletion first.
- **Option B:** Add `ON DELETE CASCADE` to `projects.user_id` FK. Owner deletes account → projects are deleted → all child data cascades. This is destructive but clean.
- **Option C:** Add `ON DELETE SET NULL` and make `user_id` nullable. Orphaned projects remain, admins clean up.

Option A is safest for v1. Document it clearly and show a user-facing error if they try to delete their account while owning projects.

---

## HIGH — Should Fix Before Implementation

### H1. Auth callback is client-side — can't reliably auto-accept invitations

**Location:** `src/app/auth/callback/page.tsx` (entire file is `"use client"`)

The implementation plan (§2.5) says the auth callback should: check for pending invitations by email, create `project_members` records, and update invitation status. But the callback is a **client component** that runs in the browser. It uses the browser Supabase client.

**Problems:**
- The browser client operates under the user's session (anon key + JWT). It can't read `project_invitations` if there's no RLS policy granting access to the invitee before they're a member. (The SELECT policy allows access via email match to `auth.users`, so this actually works — but only for SELECT, not UPDATE.)
- Creating `project_members` records requires the owner's INSERT policy — but the user isn't a member yet, so `get_project_role()` returns NULL, and the INSERT policy (`owners_insert_members`) blocks it.
- The callback currently does `router.replace("/dashboard")` immediately after auth — there's no await for invitation processing.

**Recommendation:** Don't do invitation processing in the client-side callback. Instead:
- Create a **server-side API route** `POST /api/invitations/auto-accept` that uses the admin client
- Call it from the callback after successful authentication (before redirect)
- OR: Handle it in a server component/middleware on the dashboard page load (check on first page render)

### H2. Scout route doesn't check role before calling Anthropic

**Location:** `src/app/api/scout/route.ts:220-225`

The Scout route loads the project via RLS (`supabase.from("projects").select("*").eq("id", projectId).single()`). With new membership-based RLS, any member (including viewers) passes this check. The route then proceeds to:
1. Load conversation history
2. Call Anthropic API (expensive)
3. Stream response
4. Persist the user message

For viewers, the user message INSERT would fail at RLS (the `members_insert_messages` policy requires owner/editor role). But this failure happens **after** the Anthropic call has already been made and tokens consumed.

**Recommendation:** Add an explicit role check early in the Scout route:
```typescript
const { data: membership } = await supabase
  .from("project_members")
  .select("role")
  .eq("project_id", projectId)
  .eq("user_id", user.id)
  .single();

if (!membership || membership.role === 'viewer') {
  return new Response(
    JSON.stringify({ error: "viewers cannot send Scout messages" }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}
```

### H3. `SECURITY DEFINER` functions need explicit search_path

**Location:** `data-model-design.md` §2.3

The `is_project_member()` and `get_project_role()` functions use `SECURITY DEFINER`, which executes with the function creator's privileges (typically superuser). This is necessary but creates a risk: if the `search_path` is manipulated, an attacker could create a malicious `project_members` table in a different schema that gets resolved first.

**Recommendation:** Set the search_path explicitly:
```sql
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;
```

Apply to both `is_project_member()` and `get_project_role()`.

### H4. No brute-force protection on invitation accept endpoint

**Location:** `data-model-design.md` §3.3

The `POST /api/invitations/accept` endpoint takes a `token` string and checks it against the database. The token is 64 hex chars (256 bits of entropy) — computationally infeasible to brute-force. However:

- There's no rate limiting on the accept endpoint
- Failed attempts aren't logged
- The error responses may leak information (404 "not found" vs 403 "email mismatch" vs 410 "expired" tells an attacker whether a token exists)

**Recommendation:**
- Add rate limiting (5 attempts per IP per minute)
- Return a uniform error for all failure cases: `400: "invalid or expired invitation"`
- Log failed attempts for security monitoring

### H5. Notification fan-out includes ALL admins for ALL projects

**Location:** `data-model-design.md` §4.3

The `notifyProjectMembers` helper sends notifications to all project members AND all admin users:
```typescript
const adminIds = await getAdminUserIds(adminClient);
const allRecipients = [...members.map(m => m.user_id), ...adminIds.filter(id => !memberIds.has(id))];
```

This means admins receive collaboration notifications (member joined, member removed, etc.) for **every project in the system**. For an admin managing 50+ projects, this would be extremely noisy.

**Recommendation:** Only include admins in notifications for:
- Status change events (existing behavior)
- Brief submissions (existing behavior)
- Do NOT include admins in collaboration-specific events (member added, member removed, invitation sent) unless the admin is an actual project member

---

## MEDIUM — Should Address During Implementation

### M1. Naming inconsistency in UI components doc

The UI components document (`ui-components-design.md`) references `project_collaborators` in code examples (§14, §15) while the data model and implementation plan use `project_members`. The implementation plan acknowledges this in Reconciliation Decision #1, but the UI doc's code snippets weren't updated. This will cause confusion during implementation.

**Action:** Update code snippets in `ui-components-design.md` before handing off to frontend developers.

### M2. Invitation token URL flow is redundant with auto-accept

The design has two acceptance flows:
1. **Token-based:** User clicks link with token → `POST /api/invitations/accept` with token
2. **Auto-accept:** Auth callback checks `project_invitations` by email → creates memberships

For the non-existing user flow, the invitation email sends them to `/sign-in?redirect=/project/{id}` (no token in URL). On sign-in, the auto-accept creates the membership. The token-based accept endpoint is never actually triggered in the normal flow.

**Recommendation:** Either:
- Include the token in the invitation URL and use it (provides explicit acceptance)
- OR: Remove the token-based accept endpoint from v1 scope and rely entirely on auto-accept by email

I'd recommend keeping the token-based flow as a backup, but document clearly which flow is primary.

### M3. RLS performance at scale — `is_project_member()` per-row evaluation

The `is_project_member()` function is called per-row during RLS evaluation. For `SELECT * FROM projects`, Postgres evaluates the function for every row in the table before filtering. With the composite index on `(project_id, user_id)`, each call is an index lookup, but it's still one function call per row.

Current scale is likely small (< 100 projects), so this is fine for v1. But monitor:
- Query plans for the dashboard query (should show index scan, not seq scan)
- Query time as project count grows beyond 500

**Mitigation if needed later:** Replace function-based RLS with a subquery-based policy:
```sql
FOR SELECT USING (
  id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
)
```
Postgres can often optimize this into a semi-join.

### M4. Scout message `sender_id` display requires profile resolution

The plan adds `sender_id` to `scout_messages` for multi-user attribution. But the `ScoutChat` component will need to resolve `sender_id` UUIDs to display names/emails. Options:
- Join with `user_profiles` in the messages query
- Fetch collaborator list once and use as a lookup map

**Recommendation:** Fetch the collaborators list (already loaded for the project detail page) and pass it to `ScoutChat` as a lookup map. Avoid N+1 queries.

### M5. Missing DELETE policy on `projects` table

The architecture research notes there's no DELETE RLS policy on `projects`. The implementation plan says `DELETE /api/projects/[id]` should work for owners, but there's no RLS policy to support this. Currently deletion is admin-only via service role.

**Recommendation:** Either:
- Add a DELETE policy: `FOR DELETE USING (get_project_role(id, auth.uid()) = 'owner')`
- OR: Keep deletion admin-only via service role (current behavior). If the plan promotes owner deletion to a user-facing feature, the policy is required.

### M6. No member cap defined in schema

The implementation plan recommends a cap of 10 members per project (§4.5) but doesn't enforce it in the schema or API. This should be an application-level check in the invite endpoint, not a DB constraint (constraints on aggregates are complex in Postgres).

**Action:** Add a check in `POST /api/projects/[id]/members/invite`:
```typescript
const { count } = await supabase
  .from("project_members")
  .select("id", { count: "exact", head: true })
  .eq("project_id", projectId);

if ((count ?? 0) >= MAX_MEMBERS_PER_PROJECT) {
  return NextResponse.json({ error: "project member limit reached" }, { status: 400 });
}
```

---

## LOW — Nice-to-Fix / Monitor

### L1. `project_invitations` UNIQUE constraint allows row accumulation

`UNIQUE (project_id, email, status)` means you can have one row per status. Over time, a frequently re-invited user accumulates rows: one pending, one accepted, one revoked. If revoked and re-invited multiple times, old revoked rows persist.

**Action:** Consider a periodic cleanup job for expired/revoked invitations, or change the constraint approach.

### L2. Visibility column naming could be confused with access control

`projects.visibility: 'private' | 'shared'` is semantic-only (UI gating), not an access control mechanism. The name "private" might suggest it affects who can see the project.

**Action:** Add a comment in the migration: `-- NOTE: visibility is a UI hint only, not an access control mechanism. Access is controlled by project_members.`

### L3. No audit trail for role changes

When an owner changes a member's role (editor → viewer), no record is kept. For accountability, consider logging role changes to `automation_log`.

### L4. UX vision says editors can't invite — but permission table in data model says they can

The UX vision (§Product Decisions) says: "No, owners only (v1)." The data model permission table (§2.1) says: "Invite members: yes (editors can invite editors/viewers, not owners)." The implementation plan reconciles this (Decision #3: owners only), but the data model RLS still has `owners_insert_invitations` correctly limiting to owners. Just ensure the API route also checks for owner role, not just the RLS.

### L5. Self-invite not blocked at RLS level

The API contract says self-invite returns 400, but this is an application-level check. At the RLS level, an owner could insert a duplicate membership for themselves (which would fail the UNIQUE constraint anyway). Not a real risk, just noting the defense-in-depth gap.

---

## Riskiest Parts of the Plan

Ranked by risk (likelihood × impact):

1. **RLS migration** — Phase 1.7 (update existing policies). If the additive approach has unexpected interactions with existing policies, users could temporarily lose access. **Mitigation:** Test in a staging environment with real data before production.

2. **`isAllowedUser()` extension** — Phase 2.4. The current function is simple and reliable. Adding DB calls to middleware is the change most likely to cause production issues. **Mitigation:** See recommendation in C1 above.

3. **Auth callback invitation processing** — Phase 2.5. The client-side callback isn't designed for server-side DB operations. **Mitigation:** See recommendation in H1 above.

4. **Scout route access control gap** — Phase 2.6. Viewers could trigger expensive Anthropic calls before RLS blocks the message persist. **Mitigation:** See recommendation in H2 above.

---

## Assumptions That Need Validation

1. **Supabase supports `gen_random_bytes()` in DEFAULT expressions.** This is used for invitation tokens. Should work in Postgres 13+, which Supabase uses. Verify in staging.

2. **`SECURITY DEFINER` functions work correctly with RLS policy evaluation.** This is a well-documented Supabase pattern, but test with real queries to confirm the function cache behavior.

3. **Supabase `!inner` join syntax works with the `.eq()` filter on the joined table.** The `verifyProjectAccess()` query uses this pattern. Verify the Supabase JS client generates the correct PostgREST query.

4. **Parallel RLS policies use OR semantics.** The migration relies on old and new policies coexisting during transition. This is standard PostgreSQL behavior (multiple permissive policies are OR'd together), but verify no restrictive policies exist that could interfere.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 3 | C1 (middleware async), C2 (missing invitation UPDATE policy), C3 (FK cascade behavior) |
| HIGH | 5 | H1 (auth callback client-side), H2 (Scout no role check), H3 (search_path), H4 (brute-force), H5 (admin notification noise) |
| MEDIUM | 6 | M1-M6 |
| LOW | 5 | L1-L5 |

**Verdict:** The design is fundamentally sound. The two-table approach, phased migration, and role model are all good decisions. The critical and high issues are all solvable without changing the architecture — they're implementation details that were under-specified. Fix C1-C3 and H1-H2 before starting implementation; the rest can be addressed during the build.
