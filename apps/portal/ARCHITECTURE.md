# Launchpad Portal — Architecture

Current-state architecture reference for `apps/portal/`. For getting started and project structure, see `README.md`.

---

## 1. Database Schema

All tables in Supabase project `mapjobkrgwyoutnvrvvc`. Migrations in `tasks/portal/migrations/`.

### Tables

```
projects                 # Core: one row per PitchApp engagement
├── id (UUID PK)
├── user_id (UUID → auth.users)
├── company_name, project_name
├── type (investor_pitch | client_proposal | research_report | website | other)
├── status (requested | narrative_review | in_progress | review | revision | live | on_hold)
├── autonomy_level (manual | supervised | full_auto)
├── pitchapp_url, target_audience, materials_link, timeline_preference, notes
└── created_at, updated_at

project_narratives       # Versioned narrative storage with approval workflow
├── id (UUID PK)
├── project_id (UUID → projects, CASCADE)
├── version (INT, UNIQUE with project_id)
├── content (TEXT — full narrative markdown)
├── sections (JSONB — parsed section cards)
├── status (pending_review | approved | rejected | superseded)
├── source_job_id (UUID → pipeline_jobs, SET NULL)
├── revision_notes, reviewed_by, reviewed_at
└── created_at, updated_at

scout_messages           # Chat history + structured edit briefs
├── id (UUID PK)
├── project_id (UUID → projects)
├── role (user | assistant)
├── content, edit_brief_md, edit_brief_json
└── created_at

notifications            # User notifications (realtime-enabled)
├── id (UUID PK)
├── user_id, project_id, type, title, body
├── read (BOOLEAN)
└── created_at

pitchapp_manifests       # PitchApp section metadata (for Scout context)
├── id (UUID PK)
├── project_id (UUID → projects)
├── sections (JSONB), design_tokens (JSONB), meta (JSONB)
└── created_at

pipeline_jobs            # Automation job queue
├── id (UUID PK)
├── project_id (UUID → projects)
├── job_type (auto-pull | auto-narrative | auto-build | auto-copy | auto-build-html | auto-review | auto-revise | auto-push | auto-brief)
├── status (pending | queued | running | completed | failed | cancelled)
├── payload, result (JSONB)
├── attempts, max_attempts, last_error
├── started_at, completed_at
└── created_at

automation_log           # Audit trail with cost tracking
├── id (UUID PK)
├── job_id (UUID → pipeline_jobs, SET NULL)
├── project_id, event, details (JSONB)
└── created_at

analytics_events         # Viewer engagement (lightweight, no PII)
├── id (UUID PK)
├── project_id, event_type, session_id
├── metadata (JSONB)
└── created_at

pitchapp_versions        # Deployment history
├── id (UUID PK)
├── project_id, version_number, pitchapp_url
├── deployed_by, notes
└── created_at
```

### Row Level Security

All tables have RLS enabled:

- **User-scoped tables** (`projects`, `scout_messages`, `notifications`, `project_narratives`): Users can only SELECT rows linked to their own `user_id` or `project_id`.
- **Service-role-only tables** (`pipeline_jobs`, `automation_log`, `analytics_events`, `pitchapp_versions`, `pitchapp_manifests`): Only accessible via service role key (cron scripts, admin API routes).
- No public/anon access to any table.

### Key RPC

```sql
claim_next_job()  -- Atomic job claim with FOR UPDATE SKIP LOCKED
                  -- Prevents race conditions between pipeline-executor instances
```

---

## 2. Auth Flow

**Method:** Supabase magic link (passwordless email)

1. User enters email at `/sign-in`
2. `supabase.auth.signInWithOtp()` sends magic link
3. User clicks link → `/auth/callback` exchanges code for session
4. Session stored as HTTP-only cookie via `@supabase/ssr`
5. `middleware.ts` validates session on every request via `getUser()` (server-validated, not just cookie)

**Admin detection:** `getAdminUserIds()` in `lib/auth.ts` fetches users matching `ADMIN_EMAILS` env var, cached for 5 minutes.

**No profiles table.** Admin status is determined by email match against env var, not a database role column.

---

## 3. API Routes

Every route follows the same pattern: `createClient()` → `getUser()` → auth check → RLS-scoped queries.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/scout` | POST | Scout chat — streaming SSE with tool use loop |
| `/api/projects` | GET | List projects (admin: all, user: own) |
| `/api/projects/[id]/approve` | POST | Client PitchApp approval (approve/request_changes/escalate) |
| `/api/projects/[id]/status` | PATCH | Status transition (with email notification) |
| `/api/projects/[id]/narrative` | GET | Current narrative + version history |
| `/api/projects/[id]/narrative/review` | POST | Narrative approve/reject/escalate |
| `/api/analytics` | POST | Viewer event collection (rate-limited, public-ish) |
| `/api/analytics/script.js` | GET | Serves analytics script with cache headers |
| `/api/analytics/insights` | GET | Aggregated analytics (90-day bounded) |
| `/api/versions` | GET | PitchApp version history |
| `/api/notifications/read` | PATCH | Mark notifications as read |
| `/api/admin/automation` | GET | Pipeline jobs + cost summary (admin only) |

### Scout Route (`/api/scout`)

The most complex route. Handles:

1. Auth + rate limiting (2s between messages, 50/day/project)
2. Loads project + manifest + narrative + docs + conversation history in parallel
3. Builds status-aware system prompt via `buildSystemPrompt()` (narrative review mode, proactive review mode, etc.)
4. Streams Claude response via SSE with up to 3 tool use rounds
5. Detects edit brief / narrative revision submissions from tool results
6. For narrative revisions: performs reject flow via admin client (updates narrative status, creates auto-narrative job, sends notifications)
7. Persists assistant response + brief data post-stream

**Tool use:** Scout has 6 tools — `read_document`, `get_section_detail`, `list_edit_briefs`, `submit_edit_brief`, `submit_narrative_revision`, `view_screenshot`.

---

## 4. Scout System

### Architecture

```
lib/scout/
├── context.ts    # buildSystemPrompt() — assembles the full system prompt
├── knowledge.ts  # Domain knowledge: section types, narrative arc, status guidance
├── tools.ts      # Tool definitions + handlers (6 tools)
└── types.ts      # PitchAppManifest, ManifestSection, DesignTokens
```

### Status-Aware Behavior

Scout's personality and capabilities change based on project status:

| Status | Scout Mode | Extra Context |
|--------|-----------|---------------|
| `requested` | Intake | Basic project info |
| `narrative_review` | Creative director reviewing story | Full narrative content + section cards + revision instructions |
| `in_progress` | Status updates | Build progress info |
| `review` | Proactive reviewer | Manifest talking points, section-specific observations |
| `revision` | Edit coordinator | Previous briefs, ongoing changes |
| `live` | Maintenance | Deployment info |

### Tool Flow

Tools return structured data (not side effects). The route handler performs database operations:

- `submit_edit_brief` → returns JSON with `__brief_submitted` flag → route persists to `scout_messages` and notifies admins
- `submit_narrative_revision` → returns JSON with `__narrative_revision_submitted` flag → route rejects narrative via admin client, creates auto-narrative job

---

## 5. Autonomous Pipeline

Four PM2 cron scripts in `scripts/cron/`. Full docs in `scripts/cron/README.md`.

### Pipeline Sequence

```
mission-scanner (15min) → Detects new projects → Creates auto-pull job
                                                        ↓
approval-watcher (5min) → Checks approval gates → Promotes pending → queued
                                                        ↓
pipeline-executor (2min) → Claims queued job → Executes handler:
  auto-pull       → CLI pulls mission data from portal
  auto-narrative  → Claude extracts story → Saves to project_narratives → Sets narrative_review
  auto-build      → Claude generates PitchApp copy doc (approval gate: narrative must be approved)
  auto-build-html → Claude agent with tools builds HTML/CSS/JS from copy doc
  auto-review     → 5-persona AI review → P0 auto-fix → verdict gate before push
  auto-revise     → Claude agent applies edit briefs to existing build
  auto-push       → Vercel deploy + push URL to portal
  auto-brief      → CLI pulls edit briefs

health-monitor (6h) → HTTP HEAD checks on live PitchApp URLs
```

### Safety Guardrails

- **Kill switch:** `AUTOMATION_ENABLED=false`
- **Cost caps:** $50/day, $15/build (circuit breaker pattern)
- **Concurrency:** Max 2 simultaneous, 5/hour
- **Retry:** 3 attempts max, then failed
- **Atomic claiming:** PostgreSQL `FOR UPDATE SKIP LOCKED` via RPC
- **Stale recovery:** Jobs stuck >10min in `running` are reset by approval-watcher
- **Autonomy levels:** Per-project `manual`/`supervised`/`full_auto`

### AI Integration

Pipeline-executor uses `@anthropic-ai/sdk` directly (not Claude Code):
- Model: `claude-sonnet-4-5-20250929`
- Loaded from `apps/portal/node_modules/`
- Cost tracked per call via `estimateCostCents()` → `logCost()`

---

## 6. Email Notifications

Via Resend (`lib/email.ts`). Templates use HTML with `escapeHtml()` for user-supplied content.

| Trigger | Template |
|---------|----------|
| Project status change | Status-specific message with portal link |
| Narrative ready | "your story arc is ready for review" |
| Build starting | "narrative approved — build starting" |
| Edit brief received | Admin notification |

---

## 7. Viewer Analytics

Lightweight script (`templates/analytics/pitchapp-analytics.js`) injected into deployed PitchApps:

- < 5KB, no cookies, no PII, no external dependencies
- Tracks: page views, scroll depth, time on page, section visibility
- Posts to `/api/analytics` (rate-limited: 100 req/min/IP)
- Dashboard: `ViewerInsights.tsx` with CSS-only charts (no charting library)
- Data bounded to 90 days in all queries

---

## 8. Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Auth | Magic link (no passwords) | 5-20 users, simplest possible flow |
| AI SDK | `@anthropic-ai/sdk` direct | Full control, no abstraction layer |
| Scout streaming | SSE (not WebSocket) | Simpler, works with Vercel serverless |
| Tool architecture | Tools return data, route handles side effects | Avoids auth issues from self-calling endpoints |
| Admin detection | Email match vs env var (cached) | No profiles table needed |
| Pipeline scheduling | PM2 cron (local) | Simple, no infra cost. Move to VPS for 24/7 |
| Job claiming | PostgreSQL RPC with SKIP LOCKED | Prevents race conditions without external queue |
| Analytics | Custom lightweight script | No third-party dependency, privacy-first |
| CSS | Tailwind 4 with CSS variables | Matches bonfire design system |

---

## 9. Migrations

Applied in order via Supabase Management API:

| Migration | Description |
|-----------|-------------|
| 001 | Initial schema (projects, scout_messages, notifications) |
| 002 | PitchApp manifests + documents storage |
| 003 | Pipeline jobs table |
| 004 | Automation log with cost tracking |
| 005 | Project autonomy_level column |
| 006 | Analytics events table + RLS |
| 007 | PitchApp versions table + RLS |
| 008 | Atomic `claim_next_job()` RPC function |
| 009 | Project narratives table + narrative_review status |
