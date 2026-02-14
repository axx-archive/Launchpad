# Launchpad Portal

> The Portal is the Next.js app at `launchpad.bonfire.tools`. It manages PitchApp projects, hosts Scout (AI chat), and runs the build pipeline. For PitchApp conventions, section types, animation patterns, and the overall product ecosystem, see the root `CLAUDE.md`. This file covers Portal-specific internals (database, auth, architecture).

## Supabase Database

**Project ref:** `mapjobkrgwyoutnvrvvc`
**Dashboard:** `https://supabase.com/dashboard/project/mapjobkrgwyoutnvrvvc`

### Connection (for migrations)

```bash
# Direct connection (works from local — use this, NOT the pooler)
/opt/homebrew/Cellar/libpq/18.2/bin/psql "postgresql://postgres:3DyhxpdB0W6nuVjF@db.mapjobkrgwyoutnvrvvc.supabase.co:5432/postgres"

# Run a migration file
/opt/homebrew/Cellar/libpq/18.2/bin/psql "postgresql://postgres:3DyhxpdB0W6nuVjF@db.mapjobkrgwyoutnvrvvc.supabase.co:5432/postgres" -f apps/portal/supabase/migrations/<filename>.sql
```

**Notes:**
- The pooler URL (`aws-0-us-east-1.pooler.supabase.com:6543`) does NOT work — returns "Tenant or user not found"
- Use the direct connection (`db.mapjobkrgwyoutnvrvvc.supabase.co:5432`) instead
- `psql` is installed via `libpq` at `/opt/homebrew/Cellar/libpq/18.2/bin/psql`
- Migration files live in `apps/portal/supabase/migrations/`

### Environment Variables

Located in `apps/portal/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — public API URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role (bypasses RLS, server-side only)

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Auth:** Supabase Auth (magic link / passwordless)
- **Database:** Supabase (PostgreSQL) with RLS
- **Styling:** Tailwind CSS
- **Email:** Resend
- **Deployment:** Vercel → `launchpad.bonfire.tools`

## Key Architecture

- **3 Supabase clients:** browser (anon), server (user cookies + RLS), admin (service role, bypasses RLS)
- **Middleware:** `src/middleware.ts` — auth check + allowlist (`isAllowedUser` is synchronous, do NOT make async)
- **RLS:** Membership-based via `is_project_member()` and `get_project_role()` helper functions
- **Roles:** owner / editor / viewer (per-project via `project_members` table)

## Collaboration System

Added 2026-02-14. Per-project sharing with 3 roles:
- **Owner:** full control, approvals, invite/remove members
- **Editor:** Scout chat, uploads, edit requests
- **Viewer:** read-only access, Scout history visible but can't send

Key tables: `project_members`, `project_invitations`, `user_profiles`

Old RLS policies (single-owner `auth.uid() = user_id`) are still active alongside new membership-based policies. Drop old policies after staging verification — they're commented out at the bottom of `supabase/migrations/20260214_collaboration.sql`.
