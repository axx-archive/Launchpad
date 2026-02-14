# Launchpad 3-Department Platform — Technical Architecture

> **Product Lead (Technical) — Full Vision Roadmap Document**
> **Date:** 2026-02-14
> **Status:** Architecture Specification — Ready for Review

---

## 1. Executive Summary

Launchpad evolves from a single-pipeline PitchApp builder into a **three-department platform** — Intelligence, Strategy, and Creative — with a theatrical **triptych home screen** as the entry experience. Each department has its own pipeline chain, data model, and UI, but they're deeply interconnected: Intelligence findings feed Strategy research, Strategy research feeds Creative builds, and Creative builds reference Intelligence trends.

### The Three Departments

| Department | Core Function | Pipeline Entry | Primary Output |
|------------|--------------|----------------|----------------|
| **Intelligence** | Cultural trend analysis (Shareability rebuilt as AI) | Signal ingestion from YouTube/Reddit | Trend reports, white-space maps, micro-influencer briefs |
| **Strategy** | Deep company/market research | Research request | Market research briefs, competitive analysis |
| **Creative** | Narrative + design (PitchApp pipeline) | Project submission | PitchApp builds, one-pagers, email sequences |

### Key Architectural Decisions

1. **Single `projects` table extended with `department` column** — not three separate tables. Cross-department references use a junction table.
2. **`pipeline_mode` column on `projects`** — controls which pipeline chain fires in `createFollowUpJobs()`. Mode-aware sequence maps replace the single `PIPELINE_SEQUENCE`.
3. **Intelligence as a parallel engine** — its signal ingestion runs independently on a schedule (not triggered by project creation). Projects within Intelligence are "monitors" — persistent, long-running trend-tracking configurations.
4. **Strategy as a promotion path** — Intelligence findings or raw requests can be "promoted" to Strategy for deep research, and Strategy outputs can be promoted to Creative for builds.

---

## 2. Data Model

### 2.1 Extended `projects` Table

The existing `projects` table gets two new columns:

```sql
ALTER TABLE projects
  ADD COLUMN department TEXT NOT NULL DEFAULT 'creative'
    CHECK (department IN ('intelligence', 'strategy', 'creative')),
  ADD COLUMN pipeline_mode TEXT NOT NULL DEFAULT 'creative'
    CHECK (pipeline_mode IN ('intelligence', 'strategy', 'creative'));
```

**Why `department` AND `pipeline_mode`?** A project lives in one department (its home), but its `pipeline_mode` controls which job chain fires. When a Strategy project is promoted to Creative, the department stays `strategy` for UI grouping but `pipeline_mode` changes to `creative` to trigger the build chain. This also allows future hybrid modes.

Existing `ProjectType` enum gets expanded:

```typescript
export type ProjectType =
  | "investor_pitch" | "client_proposal" | "research_report" | "website" | "other"
  // Intelligence types
  | "trend_monitor" | "white_space_analysis" | "influencer_tracker"
  // Strategy types
  | "market_research" | "competitive_analysis" | "funding_landscape";

export type Department = "intelligence" | "strategy" | "creative";

export type PipelineMode = "intelligence" | "strategy" | "creative";
```

Existing `ProjectStatus` values remain for Creative. New status values for Intelligence and Strategy:

```typescript
export type ProjectStatus =
  // Creative (existing)
  | "requested" | "narrative_review" | "brand_collection"
  | "in_progress" | "review" | "revision" | "live" | "on_hold"
  // Strategy
  | "research_queued" | "researching" | "research_review" | "research_complete"
  // Intelligence
  | "monitoring" | "paused" | "analyzing";
```

### 2.2 New Tables

#### `intelligence_signals`
Raw signals ingested from platforms. High-volume table — could reach 10K+ rows/day at scale.

```sql
CREATE TABLE intelligence_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'reddit', 'x', 'rss')),
  external_id TEXT NOT NULL,              -- YouTube video ID, Reddit post ID, etc.
  source_config_id UUID REFERENCES intelligence_sources(id),

  -- Signal metadata
  title TEXT,
  description TEXT,
  author TEXT,
  author_id TEXT,                          -- Platform-specific creator ID
  author_subscribers BIGINT,               -- Subscriber/follower count at capture time
  url TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ DEFAULT NOW(),

  -- Engagement metrics (at capture time)
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  engagement_rate NUMERIC(8,4),            -- Computed: (likes+comments+shares)/views

  -- Content analysis (filled by LLM clustering)
  content_tags JSONB DEFAULT '[]',         -- LLM-extracted topic tags
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  format_type TEXT,                         -- "short_form", "long_form", "podcast", "reaction", etc.

  -- Clustering
  cluster_id UUID REFERENCES intelligence_clusters(id),
  cluster_confidence NUMERIC(4,3),          -- 0.000 to 1.000

  -- Deduplication
  content_hash TEXT,                        -- Hash for near-duplicate detection

  UNIQUE(platform, external_id)             -- One signal per platform item
);

CREATE INDEX idx_signals_platform_captured ON intelligence_signals(platform, captured_at DESC);
CREATE INDEX idx_signals_cluster ON intelligence_signals(cluster_id);
CREATE INDEX idx_signals_published ON intelligence_signals(published_at DESC);
```

#### `intelligence_sources`
Configuration for what to monitor — subreddits, YouTube channels, search queries, etc.

```sql
CREATE TABLE intelligence_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'reddit', 'x', 'rss')),
  source_type TEXT NOT NULL,                -- 'subreddit', 'channel', 'search_query', 'rss_feed'
  source_identifier TEXT NOT NULL,          -- 'r/marketing', 'UCxxxxxx', 'keyword phrase', 'https://...'

  -- Ingestion config
  fetch_frequency_minutes INT DEFAULT 60,   -- How often to poll this source
  max_items_per_fetch INT DEFAULT 25,
  filters JSONB DEFAULT '{}',               -- Platform-specific filters (min_views, date_range, etc.)

  -- State
  is_active BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT,
  total_signals_captured BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `intelligence_clusters`
LLM-powered trend clusters. Each cluster represents a distinct trend or topic.

```sql
CREATE TABLE intelligence_clusters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Cluster identity
  label TEXT NOT NULL,                      -- Human-readable trend name
  summary TEXT,                              -- LLM-generated cluster summary
  keywords JSONB DEFAULT '[]',              -- Representative keywords

  -- Lifecycle tracking
  lifecycle TEXT DEFAULT 'emerging'
    CHECK (lifecycle IN ('emerging', 'growing', 'peaking', 'cooling', 'evergreen', 'dormant')),
  lifecycle_updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Velocity scoring
  velocity_score NUMERIC(8,4) DEFAULT 0,    -- Engagement delta + frequency, z-score normalized
  velocity_trend TEXT DEFAULT 'flat'
    CHECK (velocity_trend IN ('accelerating', 'flat', 'decelerating')),
  signal_count INT DEFAULT 0,

  -- Brand fit (when associated with a project)
  brand_fit_score NUMERIC(4,2),             -- 0-10 LLM-scored brand relevance
  brand_fit_rationale TEXT,

  -- Parent cluster for hierarchical topics
  parent_cluster_id UUID REFERENCES intelligence_clusters(id),

  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_signal_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clusters_project_lifecycle ON intelligence_clusters(project_id, lifecycle);
CREATE INDEX idx_clusters_velocity ON intelligence_clusters(velocity_score DESC);
```

#### `intelligence_snapshots`
Point-in-time snapshots of cluster state for historical trend analysis.

```sql
CREATE TABLE intelligence_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_id UUID REFERENCES intelligence_clusters(id) ON DELETE CASCADE,

  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  signal_count INT,
  velocity_score NUMERIC(8,4),
  lifecycle TEXT,
  top_signals JSONB DEFAULT '[]',           -- IDs of top 5 signals at this point

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition-friendly index for time-series queries
CREATE INDEX idx_snapshots_cluster_time ON intelligence_snapshots(cluster_id, snapshot_at DESC);
```

#### `project_research`
Versioned research content for Strategy department projects.

```sql
CREATE TABLE project_research (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,                     -- Full markdown research brief
  sections JSONB,                            -- Parsed structured sections

  -- Scoring
  confidence JSONB,                          -- Same shape as narrative confidence
  source_count INT DEFAULT 0,                -- Number of cited sources

  -- Provenance
  source_job_id UUID,                        -- Pipeline job that generated this
  source_type TEXT DEFAULT 'auto'            -- 'auto' (pipeline), 'manual' (user), 'promoted' (from intelligence)
    CHECK (source_type IN ('auto', 'manual', 'promoted')),
  source_intelligence_ids JSONB DEFAULT '[]', -- Intelligence cluster/signal IDs that informed this

  -- Review
  status TEXT DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'superseded')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  revision_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `cross_department_refs`
Junction table linking entities across departments.

```sql
CREATE TABLE cross_department_refs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Source
  source_department TEXT NOT NULL CHECK (source_department IN ('intelligence', 'strategy', 'creative')),
  source_type TEXT NOT NULL,                  -- 'cluster', 'signal', 'research', 'narrative', 'project'
  source_id UUID NOT NULL,

  -- Target
  target_department TEXT NOT NULL CHECK (target_department IN ('intelligence', 'strategy', 'creative')),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,

  -- Relationship
  relationship TEXT NOT NULL,                 -- 'informed_by', 'promoted_to', 'references', 'inspired_by'
  metadata JSONB DEFAULT '{}',               -- Freeform context

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID                             -- User who created the link
);

CREATE INDEX idx_xref_source ON cross_department_refs(source_department, source_type, source_id);
CREATE INDEX idx_xref_target ON cross_department_refs(target_department, target_type, target_id);
```

### 2.3 Entity Relationship Summary

```
projects (department, pipeline_mode)
  ├── intelligence_sources (1:N) — what to monitor
  │     └── intelligence_signals (1:N) — raw captured data
  │           └── intelligence_clusters (N:1) — LLM-grouped trends
  │                 └── intelligence_snapshots (1:N) — historical state
  │
  ├── project_research (1:N) — Strategy versioned research
  │
  ├── project_narratives (1:N) — Creative versioned narratives
  │
  ├── pipeline_jobs (1:N) — per-department job chains
  │
  └── cross_department_refs (M:N) — links across departments
```

---

## 3. Pipeline Architecture

### 3.1 Mode-Aware Pipeline Chains

The existing `createFollowUpJobs()` function in `pipeline-executor.mjs` currently uses a single `PIPELINE_SEQUENCE` map. This becomes mode-aware:

```javascript
const PIPELINE_SEQUENCES = {
  creative: {
    "auto-pull": "auto-research",
    "auto-research": "auto-narrative",
    "auto-narrative": null,            // Approval gate
    "auto-build": "auto-build-html",
    "auto-copy": "auto-build-html",
    "auto-build-html": "auto-review",
    "auto-review": "auto-push",
    "auto-brief": "auto-revise",
    "auto-revise": "auto-push",
  },
  strategy: {
    "auto-pull": "auto-research",
    "auto-research": null,             // Research review gate — STOP for approval
    // No build steps — Strategy outputs research briefs, not PitchApps
  },
  intelligence: {
    "auto-ingest": "auto-cluster",
    "auto-cluster": "auto-score",
    "auto-score": "auto-snapshot",
    "auto-snapshot": null,             // Cycle complete — scheduler re-triggers
    // Separate chain for on-demand analysis:
    "auto-analyze-trends": "auto-generate-brief",
    "auto-generate-brief": null,       // Brief ready for human review
  },
};
```

**Key change in `createFollowUpJobs()`:**

```javascript
async function createFollowUpJobs(completedJob, result) {
  // Fetch project to determine pipeline_mode
  const projects = await dbGet("projects", `select=pipeline_mode,autonomy_level&id=eq.${completedJob.project_id}`);
  const mode = projects[0]?.pipeline_mode || "creative";

  const sequence = PIPELINE_SEQUENCES[mode];
  if (!sequence) return;

  const nextType = sequence[completedJob.job_type];
  if (!nextType) return;

  // ... existing approval logic, autonomy checks, etc.
}
```

### 3.2 Per-Department Pipeline Chains

#### Intelligence Pipeline (Continuous)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  auto-ingest │───▶│ auto-cluster │───▶│  auto-score  │───▶│auto-snapshot │
│              │    │              │    │              │    │              │
│ Pull signals │    │ LLM assigns  │    │ Velocity +   │    │ Save state   │
│ from YouTube │    │ to clusters  │    │ lifecycle    │    │ for history  │
│ + Reddit     │    │ or creates   │    │ heuristics   │    │              │
│              │    │ new ones     │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
      ▲                                                            │
      │                    Scheduler re-triggers                   │
      └────────────────────────────────────────────────────────────┘

On-demand analysis (triggered by user):
┌────────────────────┐    ┌──────────────────────┐
│ auto-analyze-trends│───▶│ auto-generate-brief  │
│                    │    │                      │
│ LLM deep-dive on  │    │ Trend report or      │
│ selected clusters  │    │ white-space map      │
└────────────────────┘    └──────────────────────┘
```

**Scheduling:** Intelligence ingestion is NOT triggered by project creation. A new cron script (`intelligence-ingester.mjs`) runs on its own PM2 schedule:

```javascript
// ecosystem.config.cjs addition
{
  name: "intelligence-ingester",
  script: "scripts/cron/intelligence-ingester.mjs",
  cron_restart: "*/30 * * * *",  // Every 30 minutes
}
```

The ingester:
1. Queries `intelligence_sources` for sources due for fetch (`last_fetched_at + fetch_frequency_minutes < NOW()`)
2. For each source, calls the appropriate platform API
3. Creates `intelligence_signals` rows with deduplication (`UNIQUE(platform, external_id)`)
4. Creates `auto-cluster` pipeline jobs for newly ingested batches

#### Strategy Pipeline (Request-Response)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  auto-pull   │───▶│auto-research │───▶│  [REVIEW GATE]   │
│              │    │              │    │                  │
│ Pull project │    │ Opus + web   │    │ research_review  │
│ data + docs  │    │ search       │    │ status on project│
│              │    │ (existing)   │    │                  │
└──────────────┘    └──────────────┘    └──────────────────┘
                                               │
                                    Promote to Creative ──────┐
                                               │              │
                                    ┌──────────▼──────────┐   │
                                    │ project.pipeline_mode│   │
                                    │  = 'creative'        │◀──┘
                                    │ triggers build chain │
                                    └─────────────────────┘
```

Strategy reuses the existing `auto-pull` → `auto-research` chain. The difference: when `pipeline_mode = 'strategy'`, `createFollowUpJobs()` stops after `auto-research` (no narrative, no build). The research output goes to `project_research` table instead of `tasks/{name}/research.md` only.

**Promotion endpoint:** `POST /api/projects/[id]/promote`

```typescript
// Promote Strategy → Creative
{
  target_department: "creative",
  // Copies research into the creative project's context,
  // changes pipeline_mode to "creative",
  // creates auto-narrative job
}

// Promote Intelligence → Strategy
{
  target_department: "strategy",
  cluster_ids: ["uuid1", "uuid2"],  // Which trend clusters to research deeper
  // Creates a new Strategy project pre-seeded with cluster data
}
```

#### Creative Pipeline (Existing — Unchanged)

```
auto-pull → auto-research → auto-narrative → [approval] → auto-build + auto-one-pager + auto-emails → auto-build-html → auto-review → auto-push
```

No changes needed. The Creative pipeline is already production-ready. The only addition: when a Creative project was promoted from Strategy, the `auto-research` step can be skipped (research already exists in `project_research`).

### 3.3 New Pipeline Job Types

```typescript
export type PipelineJobType =
  // Creative (existing)
  | "auto-pull" | "auto-narrative" | "auto-copy" | "auto-build"
  | "auto-build-html" | "auto-review" | "auto-push"
  | "auto-brief" | "auto-revise" | "health-check"
  // Intelligence (new)
  | "auto-ingest" | "auto-cluster" | "auto-score" | "auto-snapshot"
  | "auto-analyze-trends" | "auto-generate-brief"
  // Strategy (new — reuses auto-pull, auto-research)
  | "auto-research";  // Already exists in handlers, just not in type
```

### 3.4 Cross-Department Handoffs

Cross-department data flows use the `cross_department_refs` table for provenance and the promotion API for workflow:

```
Intelligence ──── "promoted_to" ────▶ Strategy
    │                                      │
    │ cluster data informs                 │ research informs
    │ research context                     │ narrative context
    │                                      │
    └──── "references" ─────▶ Creative ◀───┘
                                │
                          "informed_by"
                          (provenance chain)
```

**Example flow:** A user in Intelligence sees a rising trend cluster about "AI-powered pitch decks." They promote it to Strategy, which creates a deep research project. The research confirms market opportunity. They promote to Creative, which builds a PitchApp for the company. The PitchApp references the original trend data and research — full provenance chain.

---

## 4. Intelligence Department Deep Dive

### 4.1 Design Philosophy

Intelligence is **Shareability rebuilt as AI**. Shareability's methodology:
1. **Deep Listening** → Signal ingestion from platforms
2. **Community Mapping** → Cluster analysis, micro-influencer tracking
3. **Content Architecture** → White-space analysis, format trends
4. **Activation** → Trend briefs, creative recommendations

Intelligence automates steps 1-3 and provides structured data for step 4.

### 4.2 Signal Ingestion

#### YouTube (via Data API v3)

```javascript
// youtube-ingester.mjs
const YOUTUBE_ENDPOINTS = {
  // Trending/popular videos in relevant categories
  mostPopular: {
    endpoint: "videos",
    params: { chart: "mostPopular", regionCode: "US", maxResults: 50 },
  },
  // Search by keyword (for niche trend tracking)
  search: {
    endpoint: "search",
    params: { type: "video", order: "date", maxResults: 25 },
  },
  // Channel-specific uploads (for micro-influencer tracking)
  channelVideos: {
    endpoint: "search",
    params: { type: "video", order: "date", maxResults: 10 },
  },
};

// Each source config maps to an endpoint type:
// source_type: "trending" → mostPopular
// source_type: "search_query" → search (source_identifier = keyword)
// source_type: "channel" → channelVideos (source_identifier = channelId)
```

**Rate limits:** YouTube Data API v3 has a 10,000 unit/day quota. Each search costs 100 units, each video list costs 1 unit. Budget: ~90 searches/day + unlimited video lists. The ingester must track quota usage.

**Data captured per signal:**
- `external_id`: video ID
- `title`, `description`, `author`, `author_id`, `author_subscribers`
- `views`, `likes`, `comments` (engagement at capture time)
- `thumbnail_url`, `url`
- `published_at`
- `format_type`: inferred from duration (short < 60s, medium 1-15min, long > 15min, live, premiere)

#### Reddit (via snoowrap or raw API)

```javascript
// reddit-ingester.mjs
const REDDIT_ENDPOINTS = {
  // /r/{subreddit}/rising — emerging content
  rising: { listing: "rising", limit: 25 },
  // /r/{subreddit}/hot — currently trending
  hot: { listing: "hot", limit: 25 },
  // /r/{subreddit}/search — keyword search within subreddit
  search: { listing: "search", limit: 25 },
};

// Source config:
// source_type: "subreddit" → rising + hot from that subreddit
// source_type: "search_query" → search across configured subreddits
```

**Rate limits:** Reddit API allows 60 requests/minute with OAuth. Each source fetch is 1-2 requests. Budget: easily handles 20-50 subreddits per cycle.

**Data captured per signal:**
- `external_id`: post ID (prefixed `t3_`)
- `title`, `description` (selftext excerpt), `author`
- `views` (not always available), `likes` (score), `comments` (num_comments)
- `url`, `thumbnail_url`
- `published_at`

#### X / RSS (Future)

X integration deferred to Phase 2 (API costs, rate limits, data quality concerns). RSS is straightforward — standard feed parsing with `feedparser` or similar.

### 4.3 LLM-Powered Clustering

The core intelligence of the system. Uses incremental clustering — new signals are compared against existing cluster summaries, not all previous signals (which would be O(n²)).

#### Algorithm

```
For each batch of new signals:
  1. Generate embeddings for signal title + description (optional — can use LLM directly)
  2. For each signal:
     a. Retrieve active cluster summaries (label + keywords + summary)
     b. Prompt LLM: "Given this signal and these existing clusters,
        does this belong to an existing cluster (return cluster_id + confidence),
        or is this a new trend (return new cluster label + keywords)?"
     c. If existing cluster: assign, update cluster summary incrementally
     d. If new cluster: create, set lifecycle = "emerging"
  3. Batch-update cluster signal_counts
```

#### Prompt Pattern (Cluster Assignment)

```
You are a cultural intelligence analyst. Your job is to assign incoming content signals
to trend clusters, or identify when a signal represents a new emerging trend.

## Existing Active Clusters
{{#each clusters}}
- **{{label}}** ({{signal_count}} signals, {{lifecycle}})
  Keywords: {{keywords}}
  Summary: {{summary}}
{{/each}}

## New Signal
Platform: {{platform}}
Title: {{title}}
Description: {{description}}
Engagement: {{views}} views, {{likes}} likes, {{comments}} comments
Author: {{author}} ({{author_subscribers}} subscribers)

## Task
1. Does this signal belong to an existing cluster? If yes, return the cluster_id and
   a confidence score (0.0-1.0).
2. If no existing cluster fits (confidence < 0.5), describe the new trend this
   signal represents.

Return JSON:
{
  "action": "assign" | "create",
  "cluster_id": "uuid" | null,
  "confidence": 0.0-1.0,
  "new_cluster": {
    "label": "...",
    "keywords": ["..."],
    "summary": "..."
  } | null,
  "tags": ["..."]  // Content tags for the signal itself
}
```

**Model:** Claude Sonnet for clustering (fast, structured output, lower cost). Opus for trend analysis and brief generation (needs judgment).

**Batching:** Process 10-20 signals per LLM call to reduce API costs. Send multiple signals in one prompt with instructions to classify each.

### 4.4 Velocity Scoring

Velocity measures how fast a trend is growing. Adapted from the FlyteVu Cultural Intelligence Plan:

```javascript
function computeVelocity(cluster, signals, previousSnapshot) {
  // 1. Engagement delta: total engagement now vs. previous snapshot
  const currentEngagement = signals.reduce((sum, s) => sum + s.views + s.likes * 10 + s.comments * 20, 0);
  const previousEngagement = previousSnapshot?.engagement_total || 0;
  const engagementDelta = currentEngagement - previousEngagement;

  // 2. Signal frequency: new signals per hour in this cluster
  const recentSignals = signals.filter(s =>
    new Date(s.captured_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  const signalFrequency = recentSignals.length / 24; // signals per hour

  // 3. Blend: weighted combination
  const rawVelocity = (engagementDelta * 0.6) + (signalFrequency * 0.4);

  // 4. Z-score normalize against all active clusters
  // (computed at the auto-score step across all clusters in the project)
  return rawVelocity;
}
```

Z-score normalization happens at the `auto-score` pipeline step, comparing each cluster's raw velocity against all clusters in the same project.

### 4.5 Lifecycle Heuristics

Based on velocity percentile thresholds:

| Lifecycle | Condition |
|-----------|-----------|
| **Emerging** | New cluster (< 48h old) with velocity > 0 |
| **Growing** | Velocity z-score > +1.0 and accelerating |
| **Peaking** | Velocity z-score > +2.0 but decelerating |
| **Cooling** | Velocity z-score between -0.5 and +0.5, was previously growing/peaking |
| **Evergreen** | Signal frequency > 0 sustained for > 30 days, stable velocity |
| **Dormant** | No new signals for > 7 days |

Lifecycle transitions are logged in `intelligence_snapshots` for trend history visualization.

### 4.6 White-Space Analysis

A key Intelligence output — identifying content gaps on YouTube for large talent formats.

**Process:**
1. User configures a white-space analysis project with target categories and audience parameters
2. System ingests signals from the specified categories/keywords
3. `auto-analyze-trends` job runs LLM analysis:
   - What content formats are saturated?
   - What topics have high search volume but low quality content?
   - What audience segments are underserved?
   - What adjacent categories show crossover potential?
4. Output: structured white-space map stored as a trend brief

**Prompt Pattern:**

```
Given the following trend data for [category] on YouTube:

## High-Velocity Clusters (saturated)
{{saturated_clusters}}

## Medium-Velocity Clusters (active)
{{active_clusters}}

## Low Signal Areas (potential white space)
{{sparse_areas}}

Identify:
1. **Content gaps** — high audience interest (search volume signals) with low creator activity
2. **Format opportunities** — what formats are working in adjacent categories but absent here?
3. **Audience crossover** — which audience segments from other categories could be attracted?
4. **Timing plays** — seasonal or event-driven opportunities in the next 90 days

Structure as a white-space analysis brief.
```

### 4.7 Micro-Influencer Tracking

Track emerging creators (not mega-influencers — creators with 10K-500K subscribers showing rapid growth).

**Data points per creator:**
- Subscriber growth rate (captured over time via channel snapshots)
- Engagement rate vs. category average
- Content consistency (posting frequency)
- Trend alignment (which clusters their content maps to)

**Implementation:** Part of `auto-ingest` for YouTube — when processing signals, flag creators where `author_subscribers` is in the micro-influencer range AND engagement rate is above category average. Store as a tag on the signal and optionally as a separate creator-tracking entry (future table).

---

## 5. API Design

### 5.1 Intelligence APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/intelligence/monitors` | List/create Intelligence monitor projects |
| GET/PATCH | `/api/intelligence/monitors/[id]` | Get/update monitor |
| GET/POST | `/api/intelligence/monitors/[id]/sources` | Manage signal sources |
| DELETE | `/api/intelligence/monitors/[id]/sources/[sourceId]` | Remove source |
| GET | `/api/intelligence/monitors/[id]/signals` | List signals (paginated, filterable) |
| GET | `/api/intelligence/monitors/[id]/clusters` | List trend clusters with velocity |
| GET | `/api/intelligence/monitors/[id]/clusters/[clusterId]` | Cluster detail + signals |
| POST | `/api/intelligence/monitors/[id]/analyze` | Trigger on-demand trend analysis |
| GET | `/api/intelligence/monitors/[id]/briefs` | List generated trend briefs |
| GET | `/api/intelligence/monitors/[id]/whitespace` | White-space analysis results |
| POST | `/api/intelligence/monitors/[id]/promote` | Promote findings to Strategy/Creative |
| GET | `/api/intelligence/monitors/[id]/timeline` | Cluster lifecycle timeline data |

**Realtime:** Intelligence clusters update frequently. Use Supabase Realtime on `intelligence_clusters` table for live velocity updates in the UI.

### 5.2 Strategy APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/strategy/projects` | List/create Strategy research projects |
| GET/PATCH | `/api/strategy/projects/[id]` | Get/update research project |
| GET | `/api/strategy/projects/[id]/research` | Get research versions |
| POST | `/api/strategy/projects/[id]/research/review` | Approve/reject research |
| POST | `/api/strategy/projects/[id]/promote` | Promote to Creative pipeline |
| GET | `/api/strategy/projects/[id]/sources` | Intelligence sources that informed this |

**Note:** Strategy reuses many existing patterns — `auto-pull`, `auto-research`, and the pipeline job system all work as-is. The primary new code is the research storage/review flow and the promotion endpoint.

### 5.3 Cross-Department APIs

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/projects/[id]/promote` | Promote project between departments |
| GET | `/api/projects/[id]/references` | Cross-department reference chain |
| GET | `/api/departments/overview` | Dashboard stats for all 3 departments |

### 5.4 Existing APIs (No Changes)

All existing Creative pipeline APIs remain untouched:
- `/api/projects/*` — existing CRUD
- `/api/scout` — Scout chat
- `/api/analytics/*` — PitchApp analytics
- `/api/notifications` — notifications
- `/api/auth/*` — auth flow

---

## 6. Infrastructure

### 6.1 Cron / PM2 Scripts

New scripts added to `scripts/cron/`:

| Script | Schedule | Purpose |
|--------|----------|---------|
| `intelligence-ingester.mjs` | Every 30 min | Fetch signals from configured sources |
| `intelligence-scorer.mjs` | Every 2 hours | Batch velocity scoring + lifecycle updates |
| `intelligence-snapshotter.mjs` | Every 6 hours | Create historical snapshots |

**Pipeline executor** (`pipeline-executor.mjs`) gets new job handlers but no structural changes:

```javascript
const JOB_HANDLERS = {
  // Existing Creative handlers...
  "auto-pull": handleAutoPull,
  "auto-research": handleAutoResearch,
  "auto-narrative": handleAutoNarrative,
  // ...

  // New Intelligence handlers
  "auto-ingest": handleAutoIngest,
  "auto-cluster": handleAutoCluster,
  "auto-score": handleAutoScore,
  "auto-snapshot": handleAutoSnapshot,
  "auto-analyze-trends": handleAutoAnalyzeTrends,
  "auto-generate-brief": handleAutoGenerateBrief,
};
```

### 6.2 External API Keys

New environment variables for `apps/portal/.env.local`:

```bash
# Intelligence — YouTube
YOUTUBE_API_KEY=...                    # YouTube Data API v3 key
YOUTUBE_DAILY_QUOTA=10000             # Track and respect quota

# Intelligence — Reddit
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USER_AGENT="launchpad-intel/1.0"

# Existing
ANTHROPIC_API_KEY=...                  # Shared across all departments
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 6.3 Cost Tracking

Intelligence introduces ongoing API costs (YouTube quota, Reddit API, LLM clustering). Extend the existing `cost-tracker.mjs`:

```javascript
// New cost categories
const COST_CATEGORIES = {
  // Existing
  "auto-research": { model: "opus", weight: 1.0 },
  "auto-narrative": { model: "opus", weight: 1.0 },
  // New Intelligence costs
  "auto-cluster": { model: "sonnet", weight: 0.3 },   // Cheaper model
  "auto-score": { model: "sonnet", weight: 0.1 },      // Lightweight
  "auto-analyze-trends": { model: "opus", weight: 1.0 },
  "auto-generate-brief": { model: "opus", weight: 0.8 },
};
```

Monthly cost budgets per department:
- **Intelligence:** Capped at $X/month for LLM clustering + analysis (configurable per project)
- **Strategy:** Per-project cost cap (existing $100/build extended to research)
- **Creative:** Existing per-build cost cap ($100)

---

## 7. Home Screen: The Triptych

### 7.1 Concept

The current dashboard (`DashboardClient.tsx`) is a flat project list with filters. The new home screen is a **triptych** — three theatrical entry points, one per department. Think of it as walking into a building with three studios.

### 7.2 Data Requirements

The triptych needs summary stats for each department:

```typescript
interface DepartmentOverview {
  intelligence: {
    activeMonitors: number;
    totalSignalsCaptured: number;     // Last 24h
    risingClusters: number;           // lifecycle = 'emerging' or 'growing'
    topTrend: { label: string; velocity: number } | null;
  };
  strategy: {
    activeProjects: number;
    researchInProgress: number;
    completedThisMonth: number;
  };
  creative: {
    activeProjects: number;           // Existing data
    inBuild: number;                  // status = 'in_progress'
    liveApps: number;                 // status = 'live'
    totalViews: number;               // From analytics_events (last 30 days)
  };
}
```

**API endpoint:** `GET /api/departments/overview` — aggregates across all three departments. Cached with 5-minute TTL (Supabase edge function or Next.js ISR).

### 7.3 Navigation Model

```
/dashboard                    → Triptych home (the three studios)
/dashboard/intelligence       → Intelligence monitor list + trend dashboard
/dashboard/intelligence/[id]  → Individual monitor detail (clusters, signals, briefs)
/dashboard/strategy           → Strategy project list
/dashboard/strategy/[id]      → Research project detail (research content, scoring)
/dashboard/creative           → Creative project list (current mission control)
/dashboard/creative/[id]      → Project detail (existing /project/[id] — aliased)
```

The existing `/project/[id]` route is preserved for backward compatibility and deep links.

### 7.4 Component Architecture

```
DashboardClient.tsx (new triptych)
├── DepartmentCard.tsx (x3 — Intelligence, Strategy, Creative)
│   ├── Stats summary (live numbers)
│   ├── Recent activity preview
│   └── Entry CTA
│
└── DepartmentRouter.tsx (handles /dashboard/[dept] routing)
    ├── IntelligenceDashboard.tsx
    │   ├── MonitorList.tsx
    │   ├── TrendMap.tsx (cluster visualization)
    │   ├── VelocityChart.tsx
    │   └── SignalFeed.tsx
    │
    ├── StrategyDashboard.tsx
    │   ├── ResearchProjectList.tsx
    │   ├── ResearchPreview.tsx
    │   └── PromotionFlow.tsx
    │
    └── CreativeDashboard.tsx (existing DashboardClient internals)
        ├── ProjectCard.tsx (existing)
        ├── FilterTabs (existing)
        └── WelcomeBlock (existing)
```

---

## 8. Migration Strategy

### 8.1 Phased Migration (Zero Downtime)

#### Phase 0: Schema Migration (Non-Breaking)

Add new columns and tables. No existing behavior changes.

```sql
-- Migration: 20260215_departments.sql

-- 1. Add department + pipeline_mode to projects (with defaults = current behavior)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'creative',
  ADD COLUMN IF NOT EXISTS pipeline_mode TEXT NOT NULL DEFAULT 'creative';

-- 2. Add check constraints
ALTER TABLE projects
  ADD CONSTRAINT chk_department CHECK (department IN ('intelligence', 'strategy', 'creative')),
  ADD CONSTRAINT chk_pipeline_mode CHECK (pipeline_mode IN ('intelligence', 'strategy', 'creative'));

-- 3. Create Intelligence tables
-- (full SQL for intelligence_signals, intelligence_sources, intelligence_clusters, intelligence_snapshots)

-- 4. Create project_research table for Strategy

-- 5. Create cross_department_refs junction table

-- 6. Extend pipeline_jobs to allow new job types
-- (no constraint to change — job_type is TEXT, not ENUM)

-- 7. RLS policies for new tables
-- (membership-based, matching existing pattern)
```

**Key:** All existing projects default to `department = 'creative'`, `pipeline_mode = 'creative'`. Zero behavior change.

#### Phase 1: Strategy Pipeline (Low Risk)

1. Update `pipeline-executor.mjs` with mode-aware `createFollowUpJobs()`
2. Add `project_research` storage to `auto-research` handler
3. Add Strategy project creation form (separate from Creative)
4. Add research review flow
5. Update approval-watcher with Strategy approval gates

**Risk:** Low — Strategy reuses existing auto-pull + auto-research. The only new code is storage and review.

#### Phase 2: Intelligence Ingestion (Medium Risk)

1. Deploy `intelligence-ingester.mjs` to PM2
2. Add Intelligence monitor creation UI
3. Add source configuration UI (subreddit picker, YouTube channel/keyword entry)
4. Implement `auto-ingest` handler
5. Signal feed UI (paginated, filterable)

**Risk:** Medium — new external API dependencies (YouTube, Reddit). Needs quota management, error handling for API changes.

#### Phase 3: Intelligence Clustering (Higher Complexity)

1. Implement `auto-cluster` handler with LLM-powered clustering
2. Cluster visualization UI (trend map)
3. Velocity scoring (`auto-score`)
4. Lifecycle heuristics
5. Historical snapshots

**Risk:** Higher — LLM clustering quality needs iteration. Start with simple keyword-based matching, upgrade to full LLM clustering.

#### Phase 4: Cross-Department Flow

1. Promotion endpoints (Intelligence → Strategy → Creative)
2. Cross-department reference UI
3. Trend analysis and brief generation
4. White-space analysis

#### Phase 5: Triptych Home Screen

1. Department overview API
2. New `DashboardClient.tsx` with triptych layout
3. Department routing
4. Animation and theatrical entry experience

**Why last?** The triptych is the public face, but it only makes sense when all three departments have content. Building it last means it launches with real data.

### 8.2 Backward Compatibility

- All existing URLs (`/project/[id]`, `/dashboard`, `/dashboard/new`) continue working
- Existing projects are unaffected (they're all `department = 'creative'`)
- The current Mission Control becomes the Creative department view
- Existing pipeline chains run identically — `pipeline_mode = 'creative'` fires the same sequence
- API routes are additive (new routes alongside existing ones)

---

## 9. Technical Considerations

### 9.1 Scaling Concerns

**Intelligence signals table:** Could grow to 100K+ rows within months. Needs:
- Proper indexes (already specified in schema)
- Pagination on all signal queries (cursor-based, not offset)
- Consider partitioning by `captured_at` if volume exceeds 1M rows
- Periodic cleanup of dormant cluster signals (archive to cold storage)

**LLM API costs:** Intelligence clustering uses LLM calls on every ingestion cycle. Mitigations:
- Batch signals (10-20 per LLM call)
- Use Sonnet (not Opus) for clustering
- Cache cluster summaries (don't re-summarize unchanged clusters)
- Per-project monthly cost caps
- Fallback to keyword-based matching if LLM budget exhausted

**YouTube API quota:** 10,000 units/day is tight. Mitigations:
- Cache video metadata (don't re-fetch known videos)
- Prioritize search queries (100 units each) over video lists (1 unit each)
- Track quota usage in `automation_log`
- Graceful degradation: skip YouTube fetch if >80% quota used

### 9.2 Security

- Intelligence API keys (YouTube, Reddit) stored in `.env.local`, never exposed to client
- New tables follow existing RLS patterns (membership-based access)
- Signal data is platform-public content (no PII concerns)
- Rate limiting on Intelligence API endpoints (prevent abuse of ingestion triggers)
- Input validation on source configurations (prevent arbitrary URL fetching in RSS)

### 9.3 Realtime

Extend existing `useRealtimeSubscription` pattern:
- `intelligence_clusters` — velocity updates, new clusters
- `intelligence_signals` — new signal feed
- `project_research` — research status changes
- Existing subscriptions unchanged

---

## 10. File Impact Summary

### New Files

| File | Purpose |
|------|---------|
| `scripts/cron/intelligence-ingester.mjs` | Signal ingestion from YouTube/Reddit |
| `scripts/cron/intelligence-scorer.mjs` | Velocity scoring + lifecycle |
| `scripts/cron/intelligence-snapshotter.mjs` | Historical snapshots |
| `scripts/cron/lib/youtube.mjs` | YouTube Data API v3 helper |
| `scripts/cron/lib/reddit.mjs` | Reddit API helper |
| `apps/portal/supabase/migrations/20260215_departments.sql` | Schema migration |
| `apps/portal/src/app/api/intelligence/**` | Intelligence API routes |
| `apps/portal/src/app/api/strategy/**` | Strategy API routes |
| `apps/portal/src/app/api/departments/overview/route.ts` | Department overview |
| `apps/portal/src/app/api/projects/[id]/promote/route.ts` | Promotion endpoint |
| `apps/portal/src/app/dashboard/intelligence/**` | Intelligence UI pages |
| `apps/portal/src/app/dashboard/strategy/**` | Strategy UI pages |
| `apps/portal/src/components/intelligence/**` | Intelligence components |
| `apps/portal/src/components/strategy/**` | Strategy components |
| `apps/portal/src/components/DepartmentCard.tsx` | Triptych card |
| `apps/portal/src/types/intelligence.ts` | Intelligence types |
| `apps/portal/src/types/strategy.ts` | Strategy types |

### Modified Files

| File | Change |
|------|--------|
| `scripts/cron/pipeline-executor.mjs` | Add new job handlers + mode-aware `createFollowUpJobs()` |
| `scripts/cron/approval-watcher.mjs` | Add Strategy/Intelligence approval gates |
| `scripts/cron/mission-scanner.mjs` | Department-aware project scanning |
| `scripts/cron/ecosystem.config.cjs` | New PM2 entries for Intelligence crons |
| `apps/portal/src/types/database.ts` | Extended types (`Department`, `PipelineMode`, new statuses) |
| `apps/portal/src/app/dashboard/DashboardClient.tsx` | Replaced with triptych (or new component alongside) |
| `apps/portal/src/app/dashboard/new/NewProjectClient.tsx` | Department selector on project creation |
| `apps/portal/src/components/Nav.tsx` | Department navigation |

### Unchanged

All existing Creative pipeline files, Scout, analytics, collaboration, auth — untouched.

---

## Appendix A: Intelligence Ingester Pseudocode

```javascript
// intelligence-ingester.mjs (simplified)

async function run() {
  // 1. Find sources due for fetch
  const dueSource = await dbGet("intelligence_sources",
    `select=*&is_active=eq.true&last_fetched_at=lt.${cutoffTime}&order=last_fetched_at.asc&limit=1`
  );

  if (!dueSource) return;

  // 2. Fetch signals from platform
  const fetcher = PLATFORM_FETCHERS[dueSource.platform];
  const rawSignals = await fetcher.fetch(dueSource);

  // 3. Transform and deduplicate
  const signals = rawSignals.map(transformToSignal);
  const newSignals = await deduplicateAndInsert(signals);

  // 4. Update source state
  await dbPatch("intelligence_sources", `id=eq.${dueSource.id}`, {
    last_fetched_at: new Date().toISOString(),
    total_signals_captured: dueSource.total_signals_captured + newSignals.length,
  });

  // 5. Queue clustering job for new signals
  if (newSignals.length > 0) {
    await dbPost("pipeline_jobs", {
      project_id: dueSource.project_id,
      job_type: "auto-cluster",
      status: "queued",
      payload: { signal_ids: newSignals.map(s => s.id), source_id: dueSource.id },
    });
  }
}
```

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Signal** | A single content item from a platform (a YouTube video, a Reddit post) |
| **Cluster** | A group of related signals representing a trend or topic |
| **Velocity** | How fast a cluster's engagement is growing (z-score normalized) |
| **Lifecycle** | A cluster's maturity stage (emerging → growing → peaking → cooling → evergreen/dormant) |
| **Monitor** | An Intelligence project — a persistent configuration for what to track |
| **Promotion** | Moving data/context from one department to another |
| **White Space** | Content gaps where audience demand exceeds creator supply |
| **Triptych** | The three-panel home screen entry experience |

---

*Architecture specification by Product Lead (Technical). Ready for critical review (Task #5).*
