# Launchpad Automation — Cron Scripts

Automated pipeline for detecting, building, and deploying PitchApps with human approval gates.

## Architecture

```
MISSION SCANNER (15 min)     APPROVAL WATCHER (5 min)     PIPELINE EXECUTOR (2 min)
  Detects new projects  ──→   Checks approval gates  ──→   Executes queued jobs
  Detects stale builds         Upgrades pending→queued       Runs CLI + AI steps
  Detects new briefs                                         Creates follow-up jobs

HEALTH MONITOR (6h)
  Checks live PitchApp URLs
  Logs response times
  Alerts on failures
```

## Scripts

| Script | Schedule | Purpose |
|--------|----------|---------|
| `mission-scanner.mjs` | Every 15 min | Detect new projects, stale builds, new edit briefs |
| `health-monitor.mjs` | Every 6 hours | Check live PitchApp URLs respond (HTTP HEAD) |
| `approval-watcher.mjs` | Every 5 min | Bridge human approvals and automated execution |
| `pipeline-executor.mjs` | Every 2 min | Execute queued pipeline jobs (pull, research, narrative, build, one-pager, emails, build-html, review, revise, push, brief) |

## Running Manually

Each script can be run standalone:

```bash
# Run with env vars
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/cron/mission-scanner.mjs

# Or with .env.local fallback (from PitchApp root)
node scripts/cron/mission-scanner.mjs
node scripts/cron/health-monitor.mjs
node scripts/cron/approval-watcher.mjs
node scripts/cron/pipeline-executor.mjs
```

All scripts output JSON to stdout. Errors go to stderr.

## PM2 Setup

```bash
# Install PM2 globally
npm install -g pm2

# Start all cron jobs
pm2 start scripts/cron/ecosystem.config.cjs

# Monitor
pm2 status
pm2 logs
pm2 logs mission-scanner --lines 50

# Stop all
pm2 stop all

# Restart after changes
pm2 restart all
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) |

If env vars are not set, scripts fall back to reading `apps/portal/.env.local`.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOMATION_ENABLED` | `true` | Kill switch — set to `false` to halt all automation |
| `ANTHROPIC_API_KEY` | — | Required for AI-powered steps (research, narrative, confidence scoring, build, one-pager, emails, review) |
| `DAILY_COST_CAP_CENTS` | `5000` | Daily cost cap in cents ($50) |
| `BUILD_COST_CAP_CENTS` | `1500` | Per-build cost cap in cents ($15) |
| `MAX_CONCURRENT_BUILDS` | `2` | Max simultaneous AI builds |
| `MAX_BUILDS_PER_HOUR` | `5` | Max builds started per hour |

## Safety Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| **Kill switch** | `AUTOMATION_ENABLED=false` halts all scripts immediately |
| **Daily cost cap** | $50/day default — circuit breaker stops new jobs |
| **Per-build cap** | $15/build — cancels individual build if exceeded |
| **Max concurrent** | 2 simultaneous builds, 5/hour rate limit |
| **Retry limits** | 3 attempts max per job, then marked as failed |
| **Approval gates** | Supervised mode requires admin approval at every step |
| **Autonomy levels** | Per-project: `manual` / `supervised` / `full_auto` |

### Kill Switch

Emergency stop for all automation:

```bash
# Stop immediately (PM2)
pm2 stop all

# Or set env var (scripts check this on each run)
export AUTOMATION_ENABLED=false
```

## Autonomy Levels

Each project has an `autonomy_level` column:

| Level | Behavior |
|-------|----------|
| `manual` | Never auto-process. Scanner skips entirely. |
| `supervised` | Create jobs but require admin approval at every gate. Default. |
| `full_auto` | Only require approval at narrative review. Everything else runs automatically. |

## Pipeline Flow

### Full Autonomy Sequence

```
New Project Detected (scanner)
  → auto-pull job created
  → [approval gate for supervised]
  → auto-pull executes (CLI pulls mission data)
  → auto-research executes (Claude Opus + web_search, 2-turn research loop)
  → auto-narrative job created
  → [approval gate for supervised, auto for full_auto]
  → auto-narrative executes (Claude extracts story, informed by research)
  → Narrative confidence scored (5 dimensions via Claude Sonnet)
  → [ALWAYS requires client narrative approval before build]
  → auto-build + auto-one-pager + auto-emails execute (parallel)
  → auto-build-html executes (Claude agent builds HTML/CSS/JS with tools)
  → auto-review executes (5-persona AI review with P0 auto-fix)
  → [verdict gate: only PASS or CONDITIONAL proceeds to push]
  → auto-push executes (Vercel deploy + portal update)
  → Client reviews with Scout
```

### Pipeline Stages Reference

| Stage | Handler | AI Model | Notes |
|-------|---------|----------|-------|
| `auto-pull` | `handleAutoPull()` | — | CLI pulls mission data |
| `auto-research` | `handleAutoResearch()` | Claude Opus | `web_search` tool, 2-turn loop |
| `auto-narrative` | `handleAutoNarrative()` | Claude | Supports `revision_notes` in payload |
| `auto-build` | `handleAutoBuild()` | Claude | Generates copy doc (parallel with one-pager/emails) |
| `auto-one-pager` | `handleAutoOnePager()` | Claude | One-pager deliverable (parallel) |
| `auto-emails` | `handleAutoEmails()` | Claude | Email sequence deliverables (parallel) |
| `auto-build-html` | `handleAutoBuildHtml()` | Claude | Agent builds HTML/CSS/JS with tools |
| `auto-review` | `handleAutoReview()` | Claude | 5-persona review, P0 auto-fix |
| `auto-push` | `handleAutoPush()` | — | Vercel deploy + portal update |

### Pipeline Job Progress

Jobs have a JSONB `progress` column on the `pipeline_jobs` table that tracks stage-level progress. The portal's `PipelineActivity.tsx` renders progress bars and queue positions using this data in real-time via Supabase Realtime.

### Retry and Escalation

Failed pipeline jobs can be retried or escalated through the portal:

- **Retry:** `POST /api/projects/[id]/pipeline/retry` — re-queues a failed job (respects max 3 retry limit)
- **Escalate:** `POST /api/projects/[id]/pipeline/escalate` — flags the job for manual attention

### Revision Sequence

```
Edit briefs submitted via Scout
  → auto-brief executes (CLI pulls structured edit briefs)
  → auto-revise executes (Claude agent applies edits to existing build)
  → auto-push executes (Vercel deploy + portal update)
```

## Narrative Approval Flow

The narrative review cycle is a key approval gate in the pipeline:

```
auto-pull completes
  → auto-research executes (Claude Opus + web_search, 2-turn research loop)
  → auto-narrative job created
  → Claude extracts story arc from materials + research
  → Narrative confidence scored (5 dimensions via Claude Sonnet)
  → Narrative saved to project_narratives table (status: pending_review)
  → Project status set to narrative_review
  → Client notified — sees story arc as section cards + confidence scores in portal
  → Client approves → auto-build + auto-one-pager + auto-emails jobs created (queued, parallel)
  → Client rejects (via Scout) → new auto-narrative job with revision_notes
```

The approval-watcher checks `project_narratives` for approved narratives before promoting
auto-build jobs. The pipeline-executor's `handleAutoNarrative()` supports `revision_notes`
in the job payload for iterative rework.

## Database Tables

These scripts read from and write to:

- `projects` — Project data (status, autonomy_level, pitchapp_url)
- `project_members` — Per-project role membership (used by `notifyProjectMembers()` for multi-member notifications)
- `project_narratives` — Versioned narrative storage (status: pending_review/approved/rejected/superseded)
- `narrative_confidence_scores` — 5-dimension quality scores from `scoreNarrative()` (specificity, evidence_quality, emotional_arc, differentiation, overall)
- `brand_analysis` — Brand DNA extraction results, injected into auto-build pipeline
- `scout_messages` — Edit briefs from client conversations
- `pipeline_jobs` — Job queue (status: pending → queued → running → completed/failed), JSONB `progress` column for stage tracking
- `automation_log` — Event log (health checks, cost tracking, alerts)
- `notifications` — Client/admin notifications (narrative ready, approved, etc.)
- `analytics_events` — PitchApp viewer tracking (views, scroll depth, dwell time, section engagement)

## Shared Utilities

- `lib/supabase.mjs` — Supabase client + helpers (dbGet, dbPatch, dbPost, logAutomation)
- `lib/cost-tracker.mjs` — Cost estimation, daily aggregation, circuit breaker checks

## Troubleshooting

**Scripts exit immediately:**
Check `AUTOMATION_ENABLED` env var. If set to `false`, scripts skip execution.

**"Missing Supabase credentials" error:**
Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars, or ensure `apps/portal/.env.local` exists.

**Pipeline executor not picking up jobs:**
1. Check circuit breaker: `node -e "import('./lib/cost-tracker.mjs').then(m => m.checkCircuitBreaker().then(console.log))"`
2. Check job status in `pipeline_jobs` table — jobs must be `queued` (not `pending`)
3. Check approval watcher is running — it promotes `pending` → `queued`

**AI steps failing:**
Ensure `ANTHROPIC_API_KEY` is set. The SDK is loaded from `apps/portal/node_modules/@anthropic-ai/sdk`.
