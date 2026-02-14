# Launchpad 3-Department Platform: Formal Phased Roadmap

> **Synthesized from:** Technical Architecture (Product Lead), Creative Vision (Creative Lead), UX Flows (UX Designer), Backend Architecture (Systems Engineer)
> **Reviewed by:** Code Reviewer / Technical Critic
> **Date:** 2026-02-14

---

## Executive Summary

Launchpad evolves from a single-pipeline PitchApp builder into a **three-department platform** — Intelligence, Strategy, and Creative — with a theatrical **triptych home screen** as the entry experience.

| Department | Code | Function | Primary Output |
|------------|------|----------|----------------|
| **Intelligence** | `INT` | Cultural trend analysis (Shareability rebuilt as AI) | Trend reports, white-space maps, pitch-ready briefs |
| **Strategy** | `STR` | Deep research — company, market, competitive | Research briefs, positioning frameworks |
| **Creative** | `CRE` | Narrative + design (current PitchApp pipeline) | PitchApps, one-pagers, email sequences |

The departments are deeply interconnected: Intelligence findings feed Strategy research, Strategy research feeds Creative builds, and Creative builds reference upstream data with full provenance.

### Architectural Principles

1. **Single `projects` table extended** — not three separate tables. `department` + `pipeline_mode` columns control behavior.
2. **Mode-aware pipeline** — `createFollowUpJobs()` consults per-department sequence maps instead of one `PIPELINE_SEQUENCE`.
3. **Intelligence runs continuously** — signal ingestion on its own PM2 schedule, not triggered by project creation.
4. **Promotion, not transfer** — data flows between departments via explicit user action. The source always stays.
5. **Studios, not silos** — same design DNA across departments (TerminalChrome, `$` prompt, film grain, grid background), with palette shifts for identity.
6. **Zero downtime migration** — all schema changes are additive with defaults matching current behavior.

---

## Phase 0: Schema Foundation

**Risk:** Low — additive changes only, no behavior changes for existing projects.

### Goal
Lay the database foundation for all three departments. Every existing project defaults to `department = 'creative'`, `pipeline_mode = 'creative'`. Nothing breaks.

### Database Migration: `20260215_departments.sql`

**Modified tables:**

| Table | Change |
|-------|--------|
| `projects` | Add `department TEXT NOT NULL DEFAULT 'creative' CHECK (department IN ('intelligence', 'strategy', 'creative'))` |
| `projects` | Add `pipeline_mode TEXT NOT NULL DEFAULT 'creative' CHECK (pipeline_mode IN ('intelligence', 'strategy', 'creative'))` |
| `automation_log` | Add `department TEXT DEFAULT 'creative'` |

> **Design decision: `department` vs `pipeline_mode`** — A project lives in one department (its home, for UI grouping), but `pipeline_mode` controls which job chain fires. When a Strategy project is promoted to Creative, the department stays `strategy` for provenance but `pipeline_mode` changes to `creative` to trigger the build chain.

**New tables — Intelligence:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trend_clusters` | LLM-identified cultural trends | `name`, `summary`, `category`, `tags TEXT[]`, `lifecycle` (emerging/peaking/cooling/evergreen/dormant), `velocity_score`, `velocity_percentile`, `signal_count`, `first_seen_at`, `last_signal_at`, `merged_into_id`, `is_active` |
| `signals` | Raw content items from platforms | `source` (reddit/youtube/x/rss), `source_id` (UNIQUE with source), `title`, `content_snippet`, `author`, `subreddit`, `channel_id`, `upvotes`, `comments`, `views`, `likes`, `engagement_delta JSONB`, `pull_count`, `is_clustered`, `content_hash` |
| `signal_cluster_assignments` | Junction: signals ↔ clusters (M:N) | `signal_id`, `cluster_id`, `confidence REAL`, `is_primary`, `assigned_by` (llm/manual/merge) |
| `entities` | Named entities extracted from signals | `name`, `entity_type` (person/brand/product/event/place), `normalized_name` (UNIQUE with type), `signal_count` |
| `entity_signal_links` | Junction: entities ↔ signals | `entity_id`, `signal_id`, `mention_context` |
| `velocity_scores` | Daily scoring snapshots | `cluster_id`, `score_date` (UNIQUE with cluster), `engagement_z`, `signal_freq_z`, `velocity`, `percentile`, `signal_count`, `lifecycle` |
| `intelligence_briefs` | Generated reports/digests | `brief_type` (daily_digest/trend_deep_dive/alert), `title`, `content`, `cluster_ids UUID[]`, `source_job_id` |
| `api_quota_tracking` | External API rate limit tracking | `api_source`, `period_start`, `period_end`, `units_used`, `units_limit` |

**New tables — Strategy:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `project_research` | Versioned research content | `project_id`, `version`, `content TEXT` (markdown), `research_type` (market/competitive/trend/custom), `trend_cluster_ids UUID[]`, `status` (draft/approved/superseded), `source_job_id` |

**New tables — Cross-Department:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `cross_department_refs` | Links entities across departments | `source_department`, `source_type`, `source_id`, `target_department`, `target_type`, `target_id`, `relationship` (informed_by/promoted_to/references), `metadata JSONB` |
| `project_trend_links` | Projects ↔ Intelligence trends | `project_id`, `cluster_id`, `link_type` (reference/inspiration/tracking), `notes` |

**RLS:**

| Table Set | Access Pattern |
|-----------|---------------|
| Intelligence tables | New `has_intelligence_access()` function — Phase 1: any authenticated user; Phase 2: role-based |
| `project_research` | Existing `is_project_member()` pattern |
| `cross_department_refs` | Read: any authenticated user; Write: project member on either side |

**Indexes (critical):**

```
idx_signals_source_unique ON signals(source, source_id)         -- idempotent upserts
idx_signals_unclustered ON signals(ingested_at DESC) WHERE is_clustered = false
idx_clusters_lifecycle ON trend_clusters(lifecycle) WHERE is_active = true
idx_clusters_velocity ON trend_clusters(velocity_percentile DESC)
idx_clusters_tags ON trend_clusters USING GIN(tags)
idx_vs_cluster_date ON velocity_scores(cluster_id, score_date)  -- unique
idx_pr_project ON project_research(project_id, version DESC)
```

**RPC functions:**

| Function | Purpose |
|----------|---------|
| `upsert_signal(p_signal JSONB)` | Atomic idempotent signal insert with engagement_delta calculation |
| `calculate_daily_velocity(p_date DATE)` | Full velocity scoring pipeline in SQL — raw scores → z-scores → percentiles → lifecycle → propagate to `trend_clusters` |
| `has_intelligence_access()` | RLS helper for Intelligence tables |

### TypeScript Types

**Modified:** `apps/portal/src/types/database.ts`

```typescript
// New types
export type Department = "intelligence" | "strategy" | "creative";
export type PipelineMode = "intelligence" | "strategy" | "creative";

// Extended ProjectType
export type ProjectType =
  | "investor_pitch" | "client_proposal" | "research_report" | "website" | "other"
  | "trend_monitor" | "white_space_analysis" | "influencer_tracker"       // Intelligence
  | "market_research" | "competitive_analysis" | "funding_landscape";     // Strategy

// Extended ProjectStatus
export type ProjectStatus =
  | "requested" | "narrative_review" | "brand_collection"                 // Creative (existing)
  | "in_progress" | "review" | "revision" | "live" | "on_hold"
  | "research_queued" | "researching" | "research_review" | "research_complete"  // Strategy
  | "monitoring" | "paused" | "analyzing";                               // Intelligence
```

**New files:**
- `apps/portal/src/types/intelligence.ts` — TrendCluster, Signal, SignalClusterAssignment, Entity, VelocityScore, IntelligenceBrief, ApiQuotaTracking interfaces
- `apps/portal/src/types/strategy.ts` — ProjectResearch interface

### Environment Variables

New entries in `apps/portal/.env.local`:

```
YOUTUBE_API_KEY=...
YOUTUBE_DAILY_QUOTA=10000
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USERNAME=...
REDDIT_PASSWORD=...
REDDIT_USER_AGENT=launchpad-intel/1.0
```

### Deliverables

| File | Type |
|------|------|
| `apps/portal/supabase/migrations/20260215_departments.sql` | Migration |
| `apps/portal/supabase/migrations/20260215_intelligence_core.sql` | Migration |
| `apps/portal/supabase/migrations/20260215_intelligence_velocity.sql` | Migration |
| `apps/portal/supabase/migrations/20260215_intelligence_rls.sql` | Migration |
| `apps/portal/supabase/migrations/20260215_cross_department.sql` | Migration |
| `apps/portal/src/types/intelligence.ts` | Types |
| `apps/portal/src/types/strategy.ts` | Types |
| `apps/portal/src/types/database.ts` | Modified |

---

## Phase 1: Strategy Department

**Risk:** Low — Strategy reuses existing `auto-pull` + `auto-research` handlers. The only new code is storage, review flow, and UI.
**Depends on:** Phase 0

### Goal
Ship the Strategy department as the first new department. Users can create research-only projects, run the existing AI research pipeline, view structured outputs, iterate via Scout, and export or promote to Creative.

### Pipeline Changes

**Modified file:** `scripts/cron/pipeline-executor.mjs`

Replace single `PIPELINE_SEQUENCE` with mode-aware sequences:

```javascript
const PIPELINE_SEQUENCES = {
  creative: {
    "auto-pull": "auto-research",
    "auto-research": "auto-narrative",
    "auto-narrative": null,            // Approval gate
    "auto-build": "auto-build-html",   // (and concurrent auto-one-pager, auto-emails)
    "auto-build-html": "auto-review",
    "auto-review": "auto-push",
    "auto-brief": "auto-revise",
    "auto-revise": "auto-push",
  },
  strategy: {
    "auto-pull": "auto-research",
    "auto-research": null,             // Research review gate — STOP
  },
  intelligence: {
    "auto-ingest": "auto-cluster",
    "auto-cluster": "auto-score",
    "auto-score": "auto-snapshot",
    "auto-snapshot": null,             // Cycle complete
    "auto-analyze-trends": "auto-generate-brief",
    "auto-generate-brief": null,       // Brief ready
  },
};
```

**`createFollowUpJobs()` change:** Fetch `pipeline_mode` from project, look up sequence by mode, proceed with existing approval/autonomy logic.

**Modified file:** `scripts/cron/approval-watcher.mjs` — add Strategy approval gates (`research_review` status).

**Modified file:** `scripts/cron/mission-scanner.mjs` — department-aware project scanning.

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/strategy/projects` | List/create Strategy research projects |
| GET/PATCH | `/api/strategy/projects/[id]` | Get/update research project |
| GET | `/api/strategy/projects/[id]/research` | Get versioned research |
| POST | `/api/strategy/projects/[id]/research/review` | Approve/reject research |
| POST | `/api/projects/[id]/promote` | Promote Strategy → Creative (creates new project, links via `cross_department_refs`) |

### Components

**New components:**

| Component | Purpose | Reuses |
|-----------|---------|--------|
| `StrategyDashboard.tsx` | Research project list with filters | DashboardClient pattern |
| `ResearchCard.tsx` | Project card for research | ProjectCard pattern + origin badge |
| `StrategyIntake.tsx` | Research creation form (topic, type, context, depth) | NewProjectClient pattern |
| `ResearchDetail.tsx` | Split view: output left, status/Scout/actions right | ProjectDetailClient layout |
| `ResearchTheater.tsx` | BuildTheater variant for research | BuildTheater with RS/RA persona codes |
| `ResearchOutput.tsx` | Structured report renderer (numbered sections) | NarrativePreview pattern |
| `PromoteModal.tsx` | Cross-department promotion flow | TerminalChrome modal |

**Modified components:**

| Component | Change |
|-----------|--------|
| `Nav.tsx` | Add `department` prop for breadcrumb context |
| `ScoutChat.tsx` | Strategy-specific suggested prompts ("go deeper on [section]", "add a section about...") |

### Pages / Routes

| Route | Page |
|-------|------|
| `/strategy` | StrategyDashboard |
| `/strategy/new` | StrategyIntake |
| `/strategy/research/[id]` | ResearchDetail |

### Deliverables

| File | Type |
|------|------|
| `scripts/cron/pipeline-executor.mjs` | Modified — mode-aware sequences |
| `scripts/cron/approval-watcher.mjs` | Modified — Strategy gates |
| `scripts/cron/mission-scanner.mjs` | Modified — department-aware |
| `apps/portal/src/app/strategy/**` | New pages |
| `apps/portal/src/app/api/strategy/**` | New API routes |
| `apps/portal/src/app/api/projects/[id]/promote/route.ts` | New API |
| `apps/portal/src/components/strategy/**` | New components |
| `apps/portal/src/components/PromoteModal.tsx` | New component |

---

## Phase 2: Intelligence — Signal Ingestion

**Risk:** Medium — new external API dependencies (YouTube Data API v3, Reddit API). Needs quota management and error handling.
**Depends on:** Phase 0

> Phase 2 can run **in parallel** with Phase 1 — they share the Phase 0 schema but are otherwise independent.

### Goal
Deploy the signal ingestion layer: Reddit and YouTube adapters pull signals on a schedule, deduplicate, and store in the `signals` table. The admin dashboard shows ingestion health. No clustering or UI yet — just the data pipeline.

### Signal Ingestion Architecture

**New PM2 worker:** `scripts/cron/signal-ingester.mjs`

- Long-running process (like `pipeline-executor.mjs`)
- Internal scheduler checks `SOURCE_SCHEDULES` every 60 seconds
- Calls platform adapters when due
- Upserts signals via `upsert_signal()` RPC
- Tracks quota via `api_quota_tracking` table
- Queues `auto-cluster` jobs when unclustered signals exceed threshold

```
PM2 Process Map (after Phase 2):
──────────────────────────────────────────────
mission-scanner       */15 * * * *   Creative pipeline scanner
approval-watcher      */5 * * * *    Creative + Strategy gates
pipeline-executor     autorestart    Creative + Strategy execution
health-monitor        */6h           URL health checks
signal-ingester       autorestart    Intelligence signal collection
──────────────────────────────────────────────
```

### Platform Adapters

**New files in `scripts/cron/lib/adapters/`:**

| Adapter | Library | Schedule | Rate Limits |
|---------|---------|----------|-------------|
| `reddit-adapter.mjs` | snoowrap (OAuth2) | Every 90 min | 100 req/min (self-enforced at 90) |
| `youtube-adapter.mjs` | googleapis (API key) | Every 120 min | 10,000 units/day (tracked in `api_quota_tracking`) |

**Reddit strategy:**
- 20-50 configurable subreddits (JSON config, admin-editable)
- Pull `/rising` (25 posts) + `/hot` (25 posts) per subreddit
- Process 5 subreddits per cycle, rotate through full list
- Idempotent upsert keyed on `(source='reddit', source_id=t3_xxxxx)`
- Re-pulls calculate `engagement_delta` (upvotes/comments change)

**YouTube strategy:**
- `videos.list(chart=mostPopular)` — 1 unit, every 2h (12 units/day)
- `search.list(q=keyword)` — 100 units each, 10 keywords/cycle, 6 cycles/day (6,000 units/day)
- `videos.list(id=...)` for velocity re-checks — ~500 units/day
- Total: ~6,500 units/day (3,500 buffer)
- Hard stop at 9,500 units

### Supporting Modules

| File | Purpose |
|------|---------|
| `scripts/cron/lib/quota-tracker.mjs` | `checkQuota(source)`, `consumeQuota(source, units)`, `getQuotaStatus()` |
| `scripts/cron/lib/signal-dedup.mjs` | Cross-source deduplication via `content_hash` (SHA-256) |
| `scripts/cron/lib/adapters/adapter-interface.md` | Shared contract: `fetchSignals(config) → { signals, quota_used, errors }` |

### Cost Tracking Extension

**Modified:** `scripts/cron/lib/cost-tracker.mjs`

```javascript
const DEPARTMENT_CAPS = {
  creative:     parseInt(process.env.CREATIVE_DAILY_CAP_CENTS || "40000", 10),   // $400
  intelligence: parseInt(process.env.INTELLIGENCE_DAILY_CAP_CENTS || "5000", 10), // $50
  strategy:     parseInt(process.env.STRATEGY_DAILY_CAP_CENTS || "5000", 10),     // $50
};

export async function checkDepartmentBudget(department) { ... }
export async function getDailyCostByDepartment() { ... }
```

### Admin Visibility

**Modified:** `AutomationDashboardClient.tsx` — add Intelligence ingestion health panel showing:
- Last run time per adapter
- Quota usage (YouTube units, Reddit requests)
- Error rates
- Signal counts (today, week)

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/intelligence/status` | Ingestion health — last run times, quota, errors |
| GET | `/api/intelligence/signals` | Recent signals feed (paginated, filterable by source) |
| GET | `/api/admin/intelligence/config` | Source configs (subreddits, keywords) |
| PATCH | `/api/admin/intelligence/config` | Update source configs |
| GET | `/api/admin/intelligence/quotas` | Quota dashboard |
| POST | `/api/admin/intelligence/ingest` | Manual trigger: run ingestion now |
| GET | `/api/admin/costs/by-department` | Cost breakdown by department |

### Deliverables

| File | Type |
|------|------|
| `scripts/cron/signal-ingester.mjs` | New PM2 worker |
| `scripts/cron/lib/adapters/reddit-adapter.mjs` | New |
| `scripts/cron/lib/adapters/youtube-adapter.mjs` | New |
| `scripts/cron/lib/quota-tracker.mjs` | New |
| `scripts/cron/lib/signal-dedup.mjs` | New |
| `scripts/cron/lib/cost-tracker.mjs` | Modified — department caps |
| `scripts/cron/ecosystem.config.cjs` | Modified — new PM2 entries |
| `apps/portal/src/app/api/intelligence/signals/route.ts` | New |
| `apps/portal/src/app/api/intelligence/status/route.ts` | New |
| `apps/portal/src/app/api/admin/intelligence/**` | New |
| `apps/portal/src/app/admin/automation/AutomationDashboardClient.tsx` | Modified |

---

## Phase 3: Intelligence — Clustering & Velocity

**Risk:** Higher — LLM clustering quality needs iteration. Start with prompt patterns, tune over time.
**Depends on:** Phase 2 (signals must be flowing)

### Goal
Turn raw signals into trend clusters. Implement LLM-powered incremental clustering, velocity scoring, lifecycle heuristics, and historical snapshots. The core intelligence engine.

### Clustering Pipeline

**New handler in pipeline-executor:** `auto-cluster`

**Algorithm (incremental — O(new_signals), not O(all_signals)):**

1. Load existing active cluster summaries (~2K tokens for 50 clusters — just names + keywords + summaries)
2. Load unclustered signals batch (max 200, via `idx_signals_unclustered` index)
3. LLM prompt: for each signal, assign to existing cluster (with confidence) or propose new cluster
4. Post-processing: create new clusters, insert `signal_cluster_assignments`, mark signals `is_clustered = true`, update denormalized counts

**Model:** Claude Haiku 4.5 (primary) — $0.10/1M input, $0.50/1M output. ~$0.004 per 200-signal batch. GPT-4o-mini as fallback.

**Batching:** 10-20 signals per LLM call (single prompt with multiple signals) to reduce API overhead.

### Velocity Scoring

**New PM2 worker:** `scripts/cron/velocity-calculator.mjs` — daily at 6 AM UTC.

Executes `calculate_daily_velocity(CURRENT_DATE)` RPC function (defined in Phase 0). The function:

1. Calculates raw engagement scores per cluster (sum of engagement deltas from last 24h)
2. Calculates signal frequency per cluster (new signals in last 24h)
3. Computes z-scores for both dimensions
4. Blends: `velocity = 0.7 * engagement_z + 0.3 * signal_freq_z`
5. Computes percentile ranks
6. Assigns lifecycle based on rules:

| Lifecycle | Rule |
|-----------|------|
| **Emerging** | < 48h old AND velocity percentile > 70 |
| **Peaking** | Velocity percentile > 90 |
| **Cooling** | Was > 70th percentile, now < 40th |
| **Evergreen** | > 14 days old AND > 1 signal/day sustained |
| **Dormant** | No new signals for 7 days |

7. Propagates to `trend_clusters` table (velocity_score, velocity_percentile, lifecycle)

### Cluster Maintenance (part of velocity cron)

- **Merge detection:** Two clusters with >60% signal overlap → LLM proposes merge → `merged_into_id`
- **Stale cleanup:** Dormant clusters with 0 signals for 30 days → `is_active = false`
- **Name refinement:** Clusters with >50 new signals since last rename → LLM refreshes `name`/`summary`

### Entity Extraction

Part of the `auto-cluster` handler: extract named entities from signal titles/content, store in `entities` + `entity_signal_links`. Useful for trend detail views and cross-referencing.

### New Pipeline Job Types

```
auto-ingest         → signal pull from adapters (Phase 2)
auto-cluster        → LLM clustering batch
auto-score          → velocity recalculation (can also be triggered by velocity-calculator cron)
auto-snapshot       → historical state snapshot
auto-analyze-trends → on-demand LLM deep dive on selected clusters
auto-generate-brief → pitch-ready brief from cluster data
```

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/intelligence/trends` | List active trends (filterable: lifecycle, category, velocity threshold) |
| GET | `/api/intelligence/trends/[id]` | Trend detail with AI summary, velocity history |
| GET | `/api/intelligence/trends/[id]/signals` | Paginated signals for a trend |
| GET | `/api/intelligence/velocity` | Velocity leaderboard (top movers) |
| GET | `/api/intelligence/entities` | Entity list with signal counts |

### Deliverables

| File | Type |
|------|------|
| `scripts/cron/lib/cluster-engine.mjs` | New — LLM clustering logic |
| `scripts/cron/velocity-calculator.mjs` | New PM2 cron worker |
| `scripts/cron/pipeline-executor.mjs` | Modified — new job handlers (auto-cluster, auto-score, auto-snapshot) |
| `scripts/cron/ecosystem.config.cjs` | Modified — velocity-calculator entry |
| `apps/portal/src/app/api/intelligence/trends/**` | New API routes |
| `apps/portal/src/app/api/intelligence/velocity/route.ts` | New |
| `apps/portal/src/app/api/intelligence/entities/route.ts` | New |

---

## Phase 4: Intelligence — Dashboard & Scoring UI

**Risk:** Medium — significant new UI, but all patterns reuse existing components.
**Depends on:** Phase 3 (clusters and velocity must exist)

### Goal
Ship the Intelligence department UI: trend dashboard, trend detail view, scoring flow, brief generation, and department handoffs.

### Pages / Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/intelligence` | IntelligenceDashboard | Trend dashboard with signal feed + trend card grid |
| `/intelligence/trend/[id]` | TrendDetail | Split view: signal feed left, metadata/velocity/actions right |
| `/intelligence/settings` | IntelligenceSettings | Source config, knockout questions, rubric, alert thresholds |

### Components

**New components:**

| Component | Purpose | Based On |
|-----------|---------|----------|
| `IntelligenceDashboard.tsx` | Trend dashboard: signal bar + trend grid + filters | DashboardClient pattern |
| `SignalFeed.tsx` | Rolling feed of recent signals (3-line live feed, collapsible) | Realtime via `useRealtimeSubscription` |
| `TrendCard.tsx` | Trend card with velocity bar, lifecycle badge, source icons, score | ProjectCard pattern + 3D tilt |
| `VelocityBar.tsx` | 5-chevron velocity indicator (▲▲▲▲▲) | New — accent-colored SVG arrows |
| `LifecycleBadge.tsx` | Mono lifecycle label (emerging/peaking/cooling/etc.) | StatusDot pattern |
| `TrendDetail.tsx` | Split view: signal feed left, overview/velocity/actions/notes right | ProjectDetailClient layout |
| `VelocityChart.tsx` | CSS-only sparkline showing signal velocity over 7d/30d | ViewerInsights daily chart pattern |
| `ScoringFlow.tsx` | 3-stage scoring modal: knockout → rubric → AI comparison | Full-screen overlay, step-by-step |
| `BriefOutput.tsx` | Pitch-ready brief card (hook, insight, evidence, angle, timing) | TerminalChrome card |
| `IntelligenceSettings.tsx` | Source config, scoring dimensions, alert thresholds | Admin panel pattern |

### Scoring Flow (3 Stages)

**Stage 1 — Knockout (3 binary questions):**
- One-at-a-time modal (progress dots)
- If any "no" → flagged "low fit" with explanation
- Questions configurable per organization

**Stage 2 — Full Rubric (10 dimensions, 1-5 scale):**
- Scrollable rubric with running score at bottom
- Score = (sum / 50) * 100
- Dimensions: audience alignment, timing, uniqueness, brand fit, content potential, competitive gap, resource feasibility, shareability, longevity, strategic value

**Stage 3 — AI Comparison:**
- Side-by-side table: user score vs. AI score per dimension
- Delta column highlights disagreements (>1 point)
- AI rationale text
- User can accept AI score, keep theirs, or average
- Direct action: `$ generate brief` if score > 70

### Brief Generation

**Trigger:** `$ generate brief` from scored trend
**Pipeline:** `auto-analyze-trends` → `auto-generate-brief` (Claude Opus for judgment)
**Output:** Structured brief with hook, key insight, supporting evidence (top signals), suggested angle, timing window
**Display:** BriefOutput component in trend detail view

### Handoff Flows

**Intelligence → Strategy:** `$ → research deeper`
1. Confirmation modal (PromoteModal reuse)
2. Pre-populates: trend name → topic, AI summary → context, top signals → reference
3. Creates Strategy project via `/api/projects/[id]/promote`
4. Trend card gets `→ strategy` badge linking to research project
5. Inserts `cross_department_refs` row (relationship: `promoted_to`)

**Intelligence → Creative:** `$ → build pitch`
1. Same modal pattern
2. Pre-populates: trend name → project name, brief → narrative seed, score + timing → context
3. Creates Creative project
4. Trend card gets `→ creative` badge

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/intelligence/trends/[id]/score` | Submit scoring results |
| GET | `/api/intelligence/trends/[id]/score` | Get scoring history |
| POST | `/api/intelligence/trends/[id]/brief` | Trigger brief generation |
| GET | `/api/intelligence/briefs` | List intelligence briefs |
| GET | `/api/intelligence/briefs/[id]` | Single brief detail |
| POST | `/api/intelligence/trends/[id]/link` | Link trend to a project |
| DELETE | `/api/intelligence/trends/[id]/link/[projectId]` | Unlink |
| GET | `/api/intelligence/trends/[id]/timeline` | Cluster lifecycle timeline |

### Deliverables

| File | Type |
|------|------|
| `apps/portal/src/app/intelligence/**` | New pages |
| `apps/portal/src/app/api/intelligence/trends/[id]/score/route.ts` | New |
| `apps/portal/src/app/api/intelligence/trends/[id]/brief/route.ts` | New |
| `apps/portal/src/app/api/intelligence/briefs/**` | New |
| `apps/portal/src/components/intelligence/**` | New components (all listed above) |

---

## Phase 5: Cross-Department Integration

**Risk:** Medium — touches multiple existing systems.
**Depends on:** Phases 1 + 4 (all departments must be functional)

### Goal
Wire the three departments together: provenance badges, journey trail, unified activity feed, universal search, attention queue, timing pulse, and the shared notification system.

### Provenance & Journey

**New component: `ProvenanceBadge.tsx`**
Small `font-mono` badge on project cards showing lineage:
- `from: intel ◇ "trend name"` — single hop
- `from: intel → strategy ◇` — multi-hop chain
- Clickable → navigates to source item

**New component: `JourneyTrail.tsx`**
TerminalChrome sidebar panel showing full cross-department path:
```
◇ intelligence → ◇ strategy → ● creative (this project)
```
Each node: department label, item name, key metadata, timestamp. Active node = `●`, others = `◇`. Uses PipelineFlow connector visual language.

**Integration points:**
- ProjectCard: add origin badge (when `cross_department_refs` exist for this project)
- ProjectDetailClient: add JourneyTrail in right sidebar (when provenance exists)
- ResearchCard: add origin badge
- TrendCard: add promotion badges

### Timing Pulse

**New component: `TimingPulse.tsx`**
Only shown on Creative projects that originated from Intelligence. Real-time indicator:
- "trend: still peaking ▲▲▲▲▲ — optimal window: 5-10 days"
- "trend: declining ▲▲░░░ — consider accelerating"
- Subscribes to `trend_clusters` via Realtime for live velocity updates

### Universal Search

**New component: `UniversalSearch.tsx`**
- **Trigger:** `Cmd+K` or search icon in nav
- **Visual:** Full-screen overlay, centered input with `$` prompt
- **Results:** Grouped by department (Intelligence, Strategy, Creative)
- **Search targets:** trend names, research titles, project names, company names, entity names
- **Keyboard navigable:** arrow keys + Enter
- **Recent items** shown when search is empty

### Activity Feed

**New component: `ActivityFeed.tsx`**
Unified cross-department event stream on the home screen.

**New data type:**
```typescript
interface ActivityEvent {
  id: string;
  department: Department;
  event_type: string;  // trend_detected, research_complete, build_deployed, etc.
  title: string;
  description: string;
  entity_id: string;
  entity_type: 'trend' | 'research' | 'project';
  metadata: Record<string, unknown>;
  created_at: string;
}
```

Each event is a clickable card → navigates to the item's detail view.

### Attention Queue

**New component: `AttentionQueue.tsx`**
Surfaces items requiring user action:

| Trigger | Department | Action |
|---------|------------|--------|
| Trend scored > 70, no brief generated | Intelligence | "Generate brief or dismiss" |
| Trend hit velocity 5 (peaking), no action | Intelligence | "Review trending topic" |
| Research complete, not exported/promoted | Strategy | "Export or promote to Creative" |
| Narrative ready for review | Creative | "Review and approve" |
| PitchApp ready for review | Creative | "Review and approve" |
| Trend declining, linked Creative project in build | Cross-dept | "Trend declining — consider accelerating" |

### Notifications Extension

**New notification types:**

| Type | Trigger | Recipients |
|------|---------|------------|
| `trend_velocity_alert` | Cluster hits 'peaking' | Intelligence users |
| `trend_scored` | Trend scored > 70 | Intelligence users |
| `research_complete` | Research finished | Project members |
| `handoff_created` | Trend/research promoted | Source + target project members |
| `timing_warning` | Linked trend declining | Creative project members |

**Modified:** `NotificationBell.tsx` — each notification carries `department` badge.

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/projects/[id]/references` | Cross-department reference chain |
| GET | `/api/departments/overview` | Dashboard stats for all 3 departments |
| GET | `/api/activity` | Unified activity feed (paginated, filterable by department) |
| GET | `/api/attention` | Attention queue items for current user |
| GET | `/api/search` | Universal search endpoint |

### Modified Components

| Component | Change |
|-----------|--------|
| `ProjectCard.tsx` | Add ProvenanceBadge when cross_department_refs exist |
| `ProjectDetailClient.tsx` | Add JourneyTrail and TimingPulse in right sidebar |
| `NotificationBell.tsx` | Department badges on notifications |
| `Nav.tsx` | Universal search trigger (`Cmd+K`), department tabs |

### Deliverables

| File | Type |
|------|------|
| `apps/portal/src/components/ProvenanceBadge.tsx` | New |
| `apps/portal/src/components/JourneyTrail.tsx` | New |
| `apps/portal/src/components/TimingPulse.tsx` | New |
| `apps/portal/src/components/UniversalSearch.tsx` | New |
| `apps/portal/src/components/ActivityFeed.tsx` | New |
| `apps/portal/src/components/AttentionQueue.tsx` | New |
| `apps/portal/src/app/api/departments/overview/route.ts` | New |
| `apps/portal/src/app/api/activity/route.ts` | New |
| `apps/portal/src/app/api/attention/route.ts` | New |
| `apps/portal/src/app/api/search/route.ts` | New |
| `apps/portal/src/components/ProjectCard.tsx` | Modified |
| `apps/portal/src/components/Nav.tsx` | Modified |
| `apps/portal/src/app/project/[id]/ProjectDetailClient.tsx` | Modified |

---

## Phase 6: Triptych Home Screen & Department Identity

**Risk:** Medium — significant UI build, but all pattern work is established.
**Depends on:** Phase 5 (all departments functional and connected)

### Goal
Ship the theatrical triptych home screen, per-department color palettes, entry animations, and responsive adaptations. This is the public face of the 3-department platform — it ships last because it only makes sense when all three departments have content.

### The Triptych: Two Modes

**Mode 1 — Portal (first visit / empty state):**
Three full-height panels (`~33vw` each), side by side, filling the viewport. No nav bar on initial load. Each panel is a portal into a department.

- **Hover interaction:** Hovered panel expands to ~50vw, others compress to ~25vw. CSS `transition: flex 0.6s var(--ease-out)`.
- **Panel content (resting):** Department code (`INT`/`STR`/`CRE`), display-font name, one-line description, active item count, `$ enter ▊` prompt.
- **Panel content (expanded):** Adds 2-3 lines of capability description, intensified ambient background.
- **Greeting strip above:** `good evening, aj.` (Cormorant Garamond, `text-3xl`, time-aware).
- **Recent activity strip below:** Horizontal scrolling pills `[INT] trend name — 2h ago · [CRE] deck — in build`.

**Mode 2 — Compact Dashboard (returning user with active projects):**
Compact triptych header strip (~80px) + unified activity stream + "needs attention" + "recently active" cards.

- **Triptych header:** Three mini-panels (clickable) showing department name, sparkline indicator, active count. Mild flex-expand on hover.
- **Activity stream:** Unified feed (ActivityFeed component from Phase 5), max 10 items.
- **"Needs attention":** AttentionQueue component from Phase 5.
- **"Recently active":** Quick-access links to last 5 touched items.

**Transition logic:** `hasActivity` boolean (user has > 0 items in any department) → compact mode. Zero items → portal mode.

### Ambient Panel Backgrounds

Each panel has a CSS/SVG generative background — no images, pure atmospheric:

| Panel | Background | Energy |
|-------|------------|--------|
| **Intelligence** | Dot matrix radar sweep — concentric circles with rotating scan line, data points pulsing | Cool, analytical |
| **Creative** | Bonfire flame particles — rising ember dots with warm glow center (adapted from existing flame loader) | Warm, theatrical |
| **Strategy** | Topographic contour lines — layered translucent lines shifting with parallax on mouse move | Measured, layered |

Opacity: ~8-12% at rest, ~20-30% on hover. `prefers-reduced-motion`: static, no animation.

### Department Color Palettes

Each department shifts the accent color when the user enters that studio. The base dark background (`#08080a`) stays, but `--color-accent` transitions:

```css
/* Intelligence — Shareability blue (cool, analytical) */
--studio-intel-accent:       #4D8EFF;
--studio-intel-accent-light: #7DAAFF;
--studio-intel-accent-dim:   rgba(77, 142, 255, 0.12);

/* Creative — original Launchpad amber (unchanged) */
--studio-creative-accent:       #c07840;
--studio-creative-accent-light: #e0a870;
--studio-creative-accent-dim:   rgba(192, 120, 64, 0.12);

/* Strategy — sage/olive (grounded, deliberate) */
--studio-strategy-accent:       #8B9A6B;
--studio-strategy-accent-light: #A8B88A;
--studio-strategy-accent-dim:   rgba(139, 154, 107, 0.12);
```

**Implementation:** `StudioLayout` wrapper component sets CSS custom properties. All existing components that reference `--color-accent` shift automatically (grid background, scrollbar, film grain tint, selection color).

**Transition:** 0.6s crossfade between palettes when entering/exiting a studio.

### Entry Animations

Each department has a unique entry animation replacing/supplementing the LaunchSequence:

| Department | Animation | Duration |
|------------|-----------|----------|
| **Intelligence** | **ScanSequence** — radar circle sweeps clockwise, data points appear at random positions as "signals found", circle pulses on completion | ~3s |
| **Creative** | **LaunchSequence** — existing rocket animation (unchanged) | Existing |
| **Strategy** | **BriefSequence** — document materializing: text appears character by character in a TerminalChrome wrapper, like the Bonfire terminal typing | ~3s |

### Studio Transitions

**Enter (door-open):** Selected panel expands to fill viewport (0.4s, ease-out), others compress + fade to 0. Panel content transforms into studio nav header. Studio content fades in beneath.

**Exit (back to triptych):** `← triptych` link or Launchpad logo. Studio compresses back into panel, other panels expand. Reverse of door-open.

### Triptych Entry Animation (first load)

Sequence (~2.5s total):
1. Black screen (0.3s) — Launchpad logo fades in center
2. Three vertical `1px` lines appear at 1/3 and 2/3 marks, growing from center outward (0.4s)
3. Panels fade in — left, center, right, staggered by 0.15s (0.6s)
4. Panel labels stagger in from bottom (0.4s)
5. Greeting appears (0.3s)
6. Recent activity strip slides up (0.3s)

Subsequent visits (session cookie): skip to step 3.

### Navigation Update

```
launchpad ── [intelligence] [strategy] [creative]    [🔍] [🔔] [admin] [▼]
              ^^^^^^^^^^^
              active dept
```

- `launchpad` logo → home (triptych)
- Department tabs with active highlight (`text-accent`, `border-b-2`)
- Activity indicator dots on tabs with unread items
- Breadcrumb on detail views: `launchpad ── intelligence ── trend name`

### Mobile Responsive

| Breakpoint | Triptych Portal | Triptych Compact | Department Nav |
|------------|----------------|------------------|----------------|
| Desktop (>1024px) | Three horizontal panels, flex-expand on hover | Horizontal header strip + grid | Tabs in top nav |
| Tablet (768-1023) | Three stacked panels (~33vh), tap to expand | Smaller header strip + single-column | Tabs (abbreviated: intel/strat/creat) |
| Mobile (<768) | Three stacked panels (~150px), tap navigates directly | Department selector as horizontal scroll tabs | Bottom tab bar: home/intel/strat/creat |

### Components

**New components:**

| Component | Purpose |
|-----------|---------|
| `TriptychHome.tsx` | Three-panel home screen (portal + compact modes) |
| `TriptychPanel.tsx` | Individual panel: ambient background, expand/compress, department identity |
| `StudioLayout.tsx` | Per-studio wrapper (palette switching, nav context) |
| `ScanSequence.tsx` | Intelligence entry animation (radar sweep) |
| `BriefSequence.tsx` | Strategy entry animation (typing document) |
| `RecentActivityStrip.tsx` | Horizontal scrolling recent items below triptych |
| `DepartmentTabs.tsx` | Nav department switcher |
| `CompactTriptych.tsx` | Returning user header strip with mini-panels |

### URL Structure (Final)

```
/                           → Triptych (home)
/intelligence               → Intelligence trend dashboard
/intelligence/trend/[id]    → Trend detail
/intelligence/settings      → Source config, scoring
/strategy                   → Strategy research dashboard
/strategy/new               → Research creation
/strategy/research/[id]     → Research detail
/creative                   → Creative mission control (existing dashboard)
/creative/new               → Creative project creation (existing /dashboard/new)
/creative/[id]              → Creative project detail (existing /project/[id])
/missions                   → Cross-department archive (all projects)
/admin                      → Admin dashboard (existing)
```

Existing URLs (`/dashboard`, `/project/[id]`, `/dashboard/new`) redirect to Creative equivalents for backward compatibility.

### Deliverables

| File | Type |
|------|------|
| `apps/portal/src/app/page.tsx` | Modified — triptych home |
| `apps/portal/src/components/TriptychHome.tsx` | New |
| `apps/portal/src/components/TriptychPanel.tsx` | New |
| `apps/portal/src/components/StudioLayout.tsx` | New |
| `apps/portal/src/components/ScanSequence.tsx` | New |
| `apps/portal/src/components/BriefSequence.tsx` | New |
| `apps/portal/src/components/RecentActivityStrip.tsx` | New |
| `apps/portal/src/components/DepartmentTabs.tsx` | New |
| `apps/portal/src/components/CompactTriptych.tsx` | New |
| `apps/portal/src/app/globals.css` | Modified — studio palettes, ambient backgrounds, triptych animations |
| `apps/portal/src/components/Nav.tsx` | Modified — department tabs, studio context |
| `apps/portal/src/middleware.ts` | Modified — new routes |
| `apps/portal/src/app/intelligence/layout.tsx` | New — StudioLayout wrapper |
| `apps/portal/src/app/strategy/layout.tsx` | New — StudioLayout wrapper |
| `apps/portal/src/app/creative/layout.tsx` | New — StudioLayout wrapper |

---

## Phase 7: Hardening & Expansion

**Risk:** Low individually, variable in aggregate.
**Depends on:** Phase 6 (full platform shipped)

### Goal
Production hardening, additional data sources, admin tooling, performance tuning.

### Work Items

**Intelligence expansion:**
- RSS adapter (`rss-parser` library, 50-100 curated publications, 4-6 hour cycle, SHA-256 dedup)
- X integration research/prototype (API costs, rate limits, data quality evaluation)
- White-space analysis feature (content gap identification on YouTube)
- Micro-influencer tracking (creators with 10K-500K subscribers showing rapid growth)
- Daily intelligence digest generation (`intel-brief-daily` job type)

**Performance:**
- Cursor-based pagination on all signal queries (not offset)
- Consider partitioning `signals` by `ingested_at` if volume exceeds 1M rows
- Cache cluster summaries (don't re-summarize unchanged clusters)
- LLM fallback to keyword-based matching if budget exhausted
- `departments/overview` endpoint: 5-minute cache (Next.js ISR or in-memory)

**Admin tooling:**
- Intelligence operations dashboard (quota monitoring, source health, cluster quality metrics)
- Department cost dashboard (daily/weekly/monthly by department)
- Cluster merge admin UI (approve/reject LLM-proposed merges)
- Trend archival controls (move dormant clusters to cold storage)

**Security hardening:**
- Rate limiting on Intelligence API endpoints
- Input validation on source configurations (prevent arbitrary URL fetching in RSS)
- Audit Intelligence API key rotation policy

---

## Dependency Graph

```
Phase 0: Schema Foundation
  │
  ├──→ Phase 1: Strategy Department
  │       │
  ├──→ Phase 2: Intelligence — Signal Ingestion (parallel with Phase 1)
  │       │
  │       └──→ Phase 3: Intelligence — Clustering & Velocity
  │               │
  │               └──→ Phase 4: Intelligence — Dashboard & Scoring UI
  │                       │
  └───────────────────────┤
                          │
                    Phase 5: Cross-Department Integration
                          │
                    Phase 6: Triptych Home & Department Identity
                          │
                    Phase 7: Hardening & Expansion
```

**Parallel opportunities:**
- Phase 1 (Strategy) and Phase 2 (Ingestion) can run simultaneously
- Within Phase 4, scoring UI and brief generation can be built in parallel
- Phase 7 items are independent of each other

---

## Full File Impact Summary

### New Files (by phase)

| Phase | Count | Key Files |
|-------|-------|-----------|
| 0 | ~10 | 6 migrations, 2 type files, RPC functions |
| 1 | ~15 | Strategy pages, API routes, components, pipeline changes |
| 2 | ~12 | Signal ingester, adapters, quota tracker, admin APIs |
| 3 | ~6 | Cluster engine, velocity calculator, trend APIs |
| 4 | ~18 | Intelligence pages, scoring flow, brief output, all intelligence components |
| 5 | ~12 | ProvenanceBadge, JourneyTrail, UniversalSearch, ActivityFeed, AttentionQueue, APIs |
| 6 | ~14 | Triptych home, panels, StudioLayout, entry animations, department tabs, layouts |
| 7 | ~5 | RSS adapter, digest generator, admin tools |

**Total estimated new files: ~92**

### Modified Files

| File | Phases Modified |
|------|----------------|
| `scripts/cron/pipeline-executor.mjs` | 1, 3 (mode-aware sequences, new handlers) |
| `scripts/cron/approval-watcher.mjs` | 1 (Strategy gates) |
| `scripts/cron/mission-scanner.mjs` | 1 (department-aware) |
| `scripts/cron/ecosystem.config.cjs` | 2, 3 (new PM2 entries) |
| `scripts/cron/lib/cost-tracker.mjs` | 2 (department caps) |
| `apps/portal/src/types/database.ts` | 0 (Department, PipelineMode, new statuses) |
| `apps/portal/src/components/Nav.tsx` | 1, 5, 6 (department prop, tabs, search) |
| `apps/portal/src/components/ProjectCard.tsx` | 5 (provenance badges) |
| `apps/portal/src/components/NotificationBell.tsx` | 5 (department badges) |
| `apps/portal/src/app/project/[id]/ProjectDetailClient.tsx` | 5 (JourneyTrail, TimingPulse) |
| `apps/portal/src/app/admin/automation/AutomationDashboardClient.tsx` | 2 (ingestion health) |
| `apps/portal/src/app/globals.css` | 6 (studio palettes, ambient backgrounds, animations) |
| `apps/portal/src/middleware.ts` | 6 (new routes) |

### Unchanged (Explicitly)

All existing Creative pipeline files, Scout core, analytics, collaboration, auth, email — untouched across all phases.

---

## Critical Review Notes

### Conflicts Reconciled

1. **Color coding:** Creative Vision proposed distinct accent colors per department; UX Flows argued against color coding. **Resolution:** Department palette shifts ARE implemented (the creative vision is correct — "different rooms, different light"), but the base grid/chrome stays neutral. The accent color shifts subtly per studio, not the entire chrome.

2. **Table naming:** Technical Architecture used `intelligence_*` prefix; Backend Architecture used flat names (`signals`, `trend_clusters`). **Resolution:** Flat names adopted — Intelligence data is platform-level, not project-scoped. The `intelligence_*` prefix adds noise without value.

3. **Pipeline mode values:** Technical Architecture used department names (`intelligence`/`strategy`/`creative`); Backend Architecture used behavior names (`full`/`research_only`/`creative_only`). **Resolution:** Department names adopted — cleaner mental model for a multi-department platform.

4. **Signal ownership:** Technical Architecture scoped signals to projects via `intelligence_sources.project_id`; Backend Architecture made signals global. **Resolution:** Global signals adopted — Intelligence is a platform capability, not per-project. Projects *link to* trends via `project_trend_links`, they don't *own* signals.

5. **Home screen modes:** Creative Vision designed a full theatrical triptych; UX Flows added a returning-user compact mode. **Resolution:** Both modes included (first-visit portal + returning-user dashboard), with `hasActivity` boolean controlling the transition.

### Risks to Monitor

| Risk | Phase | Mitigation |
|------|-------|------------|
| YouTube API quota (10K units/day) | 2 | Self-tracking in `api_quota_tracking`, hard stop at 9,500, graceful degradation |
| LLM clustering quality | 3 | Start with prompt patterns, tune over time. Keyword fallback if budget exhausted |
| Signal table growth (100K+ rows/month) | 2-7 | Proper indexes, cursor pagination, partitioning consideration at 1M rows |
| LLM API costs (clustering) | 3 | Haiku ($0.004/batch), per-department daily caps, batch signals (10-20 per call) |
| Triptych animation performance on mobile | 6 | Simplified backgrounds (static gradients), reduced particle count, `prefers-reduced-motion` |
| Cross-department data consistency | 5 | `cross_department_refs` junction table with explicit relationship types, no cascading deletes across departments |

### Cost Estimates (Daily Intelligence Operation)

| Operation | Model | Cost/Run | Runs/Day | Daily Cost |
|-----------|-------|----------|----------|------------|
| LLM Clustering (200 signals) | Haiku | ~$0.004 | ~20 | ~$0.08 |
| Entity extraction | Haiku | ~$0.003 | ~20 | ~$0.06 |
| Brief generation | Opus | ~$0.15 | ~2 | ~$0.30 |
| Trend analysis | Opus | ~$0.20 | ~1 | ~$0.20 |
| YouTube API | Free | $0 | 6 cycles | $0 |
| Reddit API | Free | $0 | 16 cycles | $0 |
| **Total** | | | | **~$0.64/day** |

Well within the proposed $50/day Intelligence cap.

---

*Formal phased roadmap synthesized by Code Reviewer / Technical Critic. Sources: Technical Architecture (Product Lead), Creative Vision (Creative Lead), UX Flows (UX Designer), Backend Architecture (Systems Engineer).*
