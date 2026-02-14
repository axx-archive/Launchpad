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

### Database Tables

Core tables and their purpose:

| Table | Purpose |
|-------|---------|
| `projects` | Project data (status, autonomy_level, pitchapp_url) |
| `project_members` | Per-project role membership (owner/editor/viewer) |
| `project_invitations` | Pending invitations to projects |
| `user_profiles` | User display names and metadata |
| `project_narratives` | Versioned narrative storage (status: pending_review/approved/rejected/superseded) |
| `scout_messages` | Scout conversation history and edit briefs |
| `notifications` | Client/admin notifications |
| `pipeline_jobs` | Job queue (status: pending/queued/running/completed/failed), JSONB `progress` column |
| `automation_log` | Event log (health checks, cost tracking, alerts) |
| `pitchapp_versions` | Version records for deployed PitchApps |
| `narrative_confidence_scores` | 5-dimension narrative quality scores (migration: `20260214_narrative_confidence.sql`) |
| `brand_analysis` | Brand DNA extraction results — colors, fonts, style direction (migration: `20260214_brand_analysis.sql`) |
| `analytics_events` | PitchApp viewer tracking — views, scroll depth, dwell time (migration: `20260214_analytics_events.sql`) |

### Migrations

| Migration | Content |
|-----------|---------|
| `20260214_collaboration.sql` | project_members, project_invitations, user_profiles, membership-based RLS |
| `20260214_pipeline_progress.sql` | JSONB `progress` column on pipeline_jobs |
| `20260214_narrative_confidence.sql` | narrative_confidence_scores table (specificity, evidence_quality, emotional_arc, differentiation, overall) |
| `20260214_brand_analysis.sql` | brand_analysis table for Claude Vision brand extraction |
| `20260214_analytics_events.sql` | analytics_events table for PitchApp viewer tracking |

### Environment Variables

Located in `apps/portal/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — public API URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role (bypasses RLS, server-side only)
- `ANTHROPIC_API_KEY` — for Scout, narrative generation, research agent, confidence scoring, brand analysis

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Auth:** Supabase Auth (magic link / passwordless)
- **Database:** Supabase (PostgreSQL) with RLS + Realtime
- **Realtime:** Supabase Realtime with polling fallback (see `src/hooks/useRealtimeSubscription.ts`)
- **AI:** Anthropic SDK — Claude Opus (research agent, auto-build), Claude Sonnet (narrative scoring, Scout)
- **Styling:** Tailwind CSS
- **Email:** Resend
- **Deployment:** Vercel → `launchpad.bonfire.tools`

## Key Architecture

- **3 Supabase clients:** browser (anon), server (user cookies + RLS), admin (service role, bypasses RLS)
- **Middleware:** `src/middleware.ts` — auth check + allowlist (`isAllowedUser` is synchronous, do NOT make async)
- **RLS:** Membership-based via `is_project_member()` and `get_project_role()` helper functions
- **Roles:** owner / editor / viewer (per-project via `project_members` table)
- **Security:** `verifyProjectAccess()` on all API routes, PII removed from logs, rate limiting on auth, signed URLs for document downloads, global security headers (CSP, HSTS, X-Frame-Options), input validation on file uploads
- **Realtime:** `useRealtimeSubscription` hook — generic Supabase Realtime with automatic polling fallback. Used by PipelineActivity, NotificationBell, DashboardClient, ProjectDetailClient.
- **Loading states:** Skeleton loading pages at `src/app/dashboard/loading.tsx` and `src/app/project/[id]/loading.tsx`

## Collaboration System

Per-project sharing with 3 roles:
- **Owner:** full control, approvals, invite/remove members
- **Editor:** Scout chat, uploads, edit requests
- **Viewer:** read-only access, Scout history visible but can't send

Key tables: `project_members`, `project_invitations`, `user_profiles`

Old RLS policies (single-owner `auth.uid() = user_id`) are still active alongside new membership-based policies. Drop old policies after staging verification — they're commented out at the bottom of `supabase/migrations/20260214_collaboration.sql`.

---

## Pipeline

The automated build pipeline runs through these stages:

```
auto-pull → auto-research → auto-narrative → [approval gate] → auto-build + auto-one-pager + auto-emails (parallel) → auto-build-html → auto-review → auto-push
```

### Pipeline Stages

| Stage | Purpose |
|-------|---------|
| `auto-pull` | CLI pulls mission data and documents |
| `auto-research` | Claude Opus with `web_search` tool, 2-turn research loop on the company/market |
| `auto-narrative` | Claude extracts story arc from materials + research |
| `auto-build` | Claude generates copy document |
| `auto-one-pager` | Generates one-pager deliverable (parallel with auto-build) |
| `auto-emails` | Generates email sequence deliverables (parallel with auto-build) |
| `auto-build-html` | Claude agent builds HTML/CSS/JS with tools |
| `auto-review` | 5-persona AI review with P0 auto-fix |
| `auto-push` | Vercel deploy + portal update |

### Pipeline Job Tracking

- Jobs are tracked in the `pipeline_jobs` table with JSONB `progress` column
- `PipelineActivity.tsx` shows progress bar and queue position for each job
- Failed jobs can be retried via `POST /api/projects/[id]/pipeline/retry` or escalated via `POST /api/projects/[id]/pipeline/escalate`
- `PipelineFlow.tsx` renders a visual DAG of pipeline stages

### Build Theater

`BuildTheater.tsx` provides a live visualization of the AI build process with 7 personas:

| Code | Persona |
|------|---------|
| RA | Research Agent |
| RS | Research Synthesizer |
| NS | Narrative Strategist |
| CW | Copywriter |
| DV | Developer |
| QA | Quality Assurance |
| DE | Deployment Engineer |

Includes a progress bar, terminal log, and Realtime subscription to stream build activity.

### Narrative Confidence Scoring

After narrative extraction, `scoreNarrative()` uses Claude Sonnet to rate the narrative across 5 dimensions:
- Specificity, Evidence Quality, Emotional Arc, Differentiation, Overall
- `ConfidenceScores.tsx` renders the scores visually

### Brand DNA Extraction

`POST /api/projects/[id]/analyze-brand` uses Claude Vision API to analyze uploaded brand assets (logos, decks, screenshots) and extract:
- Color palette, typography, style direction
- Results stored in `brand_analysis` table and displayed in `BrandDNA.tsx`
- Brand analysis is injected into the auto-build pipeline for style-matched output

---

## API Routes

### Project CRUD & Pipeline

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/projects` | List / create projects |
| GET/PATCH | `/api/projects/[id]` | Get / update project |
| POST | `/api/projects/[id]/status` | Update project status |
| POST | `/api/projects/[id]/approve` | Approve project for next stage |
| POST | `/api/projects/[id]/start-build` | Trigger pipeline build |
| GET | `/api/projects/[id]/pipeline` | Pipeline job status |
| POST | `/api/projects/[id]/pipeline/retry` | Retry a failed pipeline job |
| POST | `/api/projects/[id]/pipeline/escalate` | Escalate a pipeline issue |

### Documents & Brand

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/projects/[id]/documents` | List / upload documents |
| GET | `/api/projects/[id]/documents/download` | Signed URL document download |
| GET/POST | `/api/projects/[id]/brand-assets` | Brand asset management |
| POST/GET | `/api/projects/[id]/analyze-brand` | Brand DNA extraction (Claude Vision) |

### Narrative & Deliverables

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/projects/[id]/narrative` | Narrative content |
| POST | `/api/projects/[id]/narrative/review` | Narrative approval/rejection |
| GET | `/api/projects/[id]/deliverables` | One-pager and email sequence content |
| GET | `/api/projects/[id]/credits` | Agency credits breakdown (AI work, time, cost, phases) |

### Scout & Notifications

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/scout` | Scout AI chat (streaming) |
| GET/PATCH | `/api/notifications` | Notifications list / mark read |

### Analytics

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/analytics` | Public endpoint — collect PitchApp viewer events |
| GET | `/api/analytics/insights` | Section engagement analytics for a project |
| GET | `/api/analytics/script.js` | Enhanced tracking script (IntersectionObserver, dwell time, scroll depth, bounce detection, engagement scoring) |

### Auth & Users

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/sign-in` | Magic link sign-in |
| GET | `/api/users` | User list (for invite form) |
| GET/POST | `/api/invitations` | Invitation management |
| POST | `/api/invitations/auto-accept` | Auto-accept pending invitations |
| GET | `/api/versions` | PitchApp version history |

### Collaboration

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/projects/[id]/members` | List / add project members |
| DELETE | `/api/projects/[id]/members/[userId]` | Remove a member |
| POST | `/api/projects/[id]/members/invite` | Send project invitation |
| DELETE | `/api/projects/[id]/members/invite/[invitationId]` | Revoke invitation |

### Admin

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/admin/automation` | Automation settings and controls |

---

## Components

### Core UI

| Component | Purpose |
|-----------|---------|
| `Nav.tsx` | Top navigation with sidebar active state highlighting |
| `ProjectCard.tsx` | Dashboard project cards with status, 3D tilt hover |
| `StatusDot.tsx` | Colored status indicator |
| `TerminalChrome.tsx` | Traffic light dots + title bar |
| `TerminalInput.tsx` | Monospace `$` prompt input |
| `Toast.tsx` | Minimal notifications |
| `LoadingSkeleton.tsx` | Shimmer loading placeholders |
| `DetailRow.tsx` | Key-value display row |

### Scout & Chat

| Component | Purpose |
|-----------|---------|
| `ScoutChat.tsx` | Terminal-style Scout conversation with suggested prompts |
| `ChatAttachmentButton.tsx` | File attachment in Scout chat |
| `MessageAttachment.tsx` | Render attachments in messages |

### Project Detail

| Component | Purpose |
|-----------|---------|
| `NarrativePreview.tsx` | Narrative arc display as section cards |
| `NarrativeApproval.tsx` | 2-step approval confirmation (click then "confirm?") |
| `ApprovalAction.tsx` | 2-step approval button pattern |
| `ConfidenceScores.tsx` | 5-dimension narrative quality radar/bar chart |
| `ProgressTimeline.tsx` | Project status timeline |
| `VersionHistory.tsx` | PitchApp version records |
| `PipelineActivity.tsx` | Live pipeline job status with progress bars and queue position (Realtime) |
| `PipelineFlow.tsx` | Visual DAG showing pipeline stages |

### Build & Deliverables

| Component | Purpose |
|-----------|---------|
| `BuildTheater.tsx` | Live AI team visualization — 7 personas, progress bar, terminal log (Realtime) |
| `ProjectDeliverables.tsx` | Tabbed view of one-pager and email sequence content |
| `AgencyCredits.tsx` | Modal showing AI work breakdown (time, cost, phases) |
| `ViewerInsights.tsx` | Dashboard for PitchApp analytics — section engagement, dwell time, scroll depth |

### Brand & Assets

| Component | Purpose |
|-----------|---------|
| `BrandDNA.tsx` | Brand DNA extraction results — colors, fonts, style direction |
| `BrandAssetsPanel.tsx` | Brand asset management panel |
| `BrandAssetSlot.tsx` | Individual brand asset upload slot |
| `BrandCollectionGate.tsx` | "Include assets" vs "skip assets" gate with `skipAssets` parameter |
| `AssetThumbnail.tsx` | Thumbnail preview for uploaded assets |
| `FileUpload.tsx` | File upload with validation |
| `FileList.tsx` | Uploaded file list |
| `StagedFiles.tsx` | Files staged for upload |

### Collaboration

| Component | Purpose |
|-----------|---------|
| `ShareButton.tsx` | Share project button |
| `ShareModal.tsx` | Sharing modal with member list |
| `InviteForm.tsx` | User dropdown invite form (restricted to @shareability.com) |
| `CollaboratorList.tsx` | List of project members with roles |
| `CollaboratorAvatars.tsx` | Avatar stack for project cards |
| `RoleBadge.tsx` | Role indicator badge |
| `SharedBadge.tsx` | Shared project indicator |
| `NotificationBell.tsx` | Notification bell with Realtime subscription |
| `LaunchSequence.tsx` | Launch celebration animation |

### Hooks

| Hook | Purpose |
|------|---------|
| `useRealtimeSubscription` | Generic Supabase Realtime subscription with automatic polling fallback. Used by PipelineActivity, NotificationBell, DashboardClient, ProjectDetailClient. |

---

## Design System

### Accessibility

WCAG AA contrast audit applied across ~30 components. Opacity values bumped from `/30`-`/60` to `/70` range for text and interactive elements.

### Typography

Cormorant Garamond used more prominently for headlines, status text, and Scout greeting. CSS design tokens:
- `--text-xl`, `--text-2xl`, `--text-3xl`

### Button Styles

- `btn-primary` class: accent background (`#c07840`) with dark text
- 2-step confirmation pattern on destructive/approval actions (click then "confirm?")

### Celebration Animations

Milestone celebrations triggered on key approval moments:
- **Narrative approve:** Ember particle burst (`ember-float` keyframes)
- **PitchApp approve:** Glow burst animation (`celebration-glow` keyframes)
- **Text entrance:** `celebration-text-enter` keyframes

### Empty States

Custom empty states for: project list, pipeline activity, notifications.

### Error Logging

`console.error` added in all `catch` blocks across components and API routes for debuggability.
