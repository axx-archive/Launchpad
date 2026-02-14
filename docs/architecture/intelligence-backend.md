# Intelligence Department — Backend Architecture

> Systems Engineer deliverable for the 3-department Launchpad platform expansion.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Database Schema — Intelligence Department](#2-database-schema--intelligence-department)
3. [Signal Ingestion Architecture](#3-signal-ingestion-architecture)
4. [LLM Clustering Pipeline](#4-llm-clustering-pipeline)
5. [Velocity & Lifecycle Engine](#5-velocity--lifecycle-engine)
6. [Cross-Department Data Model](#6-cross-department-data-model)
7. [Strategy Department Extensions](#7-strategy-department-extensions)
8. [API Endpoints](#8-api-endpoints)
9. [Job Scheduling — PM2 Integration](#9-job-scheduling--pm2-integration)
10. [Cost Tracking & Circuit Breakers](#10-cost-tracking--circuit-breakers)
11. [Migration Plan](#11-migration-plan)

---

## 1. Executive Summary

The Intelligence department is the biggest backend build in the 3-department expansion. It introduces:

- **Real-time signal ingestion** from Reddit, YouTube (launch), RSS, X (fast-follow)
- **LLM-powered trend clustering** — incremental, cost-efficient
- **Velocity scoring + lifecycle management** for trend clusters
- **Cross-department data flow** — Intelligence trends feed Strategy research and Creative builds

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job scheduling | **PM2 cron scripts** (new workers alongside existing) | Proven pattern, zero new infra, cost-tracker/circuit-breaker reuse |
| Signal storage | **Supabase PostgreSQL** | Same DB as portal, RLS, Realtime subscriptions for UI |
| LLM clustering | **Haiku/GPT-4o-mini via Anthropic/OpenAI SDK** | Cost-sensitive, incremental O(new_signals) |
| Velocity calc | **PostgreSQL function + daily cron** | SQL-native z-scores, no external compute |
| API rate limiting | **In-process tracking tables** | Reddit 100/min, YouTube 10K units/day — self-enforced |

---

## 2. Database Schema — Intelligence Department

### 2.1 `trend_clusters`

The core entity — a cultural trend identified by LLM clustering.

```sql
CREATE TABLE trend_clusters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                    -- LLM-generated label
  summary         TEXT NOT NULL,                    -- LLM-generated 2-3 sentence description
  category        TEXT NOT NULL DEFAULT 'general',  -- music, entertainment, tech, sports, fashion, etc.
  tags            TEXT[] DEFAULT '{}',              -- searchable tags
  lifecycle       TEXT NOT NULL DEFAULT 'emerging', -- emerging | peaking | cooling | evergreen | dormant
  velocity_score  REAL DEFAULT 0,                  -- current velocity (updated daily)
  velocity_percentile REAL DEFAULT 0,              -- percentile rank (0-100)
  signal_count    INTEGER DEFAULT 0,               -- denormalized count
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_signal_at  TIMESTAMPTZ,
  merged_into_id  UUID REFERENCES trend_clusters(id), -- for cluster merges
  is_active       BOOLEAN DEFAULT true,
  metadata        JSONB DEFAULT '{}',              -- LLM reasoning, merge history, etc.
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_clusters_lifecycle ON trend_clusters(lifecycle) WHERE is_active = true;
CREATE INDEX idx_clusters_velocity ON trend_clusters(velocity_percentile DESC) WHERE is_active = true;
CREATE INDEX idx_clusters_category ON trend_clusters(category) WHERE is_active = true;
CREATE INDEX idx_clusters_last_signal ON trend_clusters(last_signal_at DESC);
CREATE INDEX idx_clusters_tags ON trend_clusters USING GIN(tags);
```

### 2.2 `signals`

Individual data points from external sources.

```sql
CREATE TABLE signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,                    -- reddit | youtube | rss | x
  source_id       TEXT NOT NULL,                    -- platform-native ID (t3_xxxxx for Reddit, video ID for YouTube)
  source_url      TEXT,                             -- direct link
  title           TEXT NOT NULL,
  content_snippet TEXT,                             -- first ~500 chars
  author          TEXT,
  subreddit       TEXT,                             -- Reddit-specific
  channel_id      TEXT,                             -- YouTube-specific
  published_at    TIMESTAMPTZ,                      -- original publish time on platform

  -- Engagement metrics (platform-specific, nullable)
  upvotes         INTEGER,
  comments        INTEGER,
  views           BIGINT,
  likes           INTEGER,

  -- Velocity tracking (deltas between pulls)
  engagement_delta JSONB DEFAULT '{}',             -- { upvotes_delta, views_delta, etc. }
  pull_count      INTEGER DEFAULT 1,               -- how many times we've seen this signal

  -- Clustering
  is_clustered    BOOLEAN DEFAULT false,
  clustered_at    TIMESTAMPTZ,

  -- Dedup
  content_hash    TEXT,                             -- SHA-256 for RSS cross-pub dedup

  metadata        JSONB DEFAULT '{}',
  ingested_at     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one signal per source per platform ID (idempotent upserts)
CREATE UNIQUE INDEX idx_signals_source_unique ON signals(source, source_id);

-- Indexes
CREATE INDEX idx_signals_unclustered ON signals(ingested_at DESC) WHERE is_clustered = false;
CREATE INDEX idx_signals_source ON signals(source, ingested_at DESC);
CREATE INDEX idx_signals_content_hash ON signals(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX idx_signals_published ON signals(published_at DESC);
```

### 2.3 `signal_cluster_assignments`

Junction table — signals can belong to multiple clusters.

```sql
CREATE TABLE signal_cluster_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  cluster_id      UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  confidence      REAL NOT NULL DEFAULT 0.8,        -- LLM confidence 0-1
  is_primary      BOOLEAN DEFAULT true,             -- primary cluster assignment
  assigned_by     TEXT DEFAULT 'llm',               -- llm | manual | merge
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_sca_unique ON signal_cluster_assignments(signal_id, cluster_id);
CREATE INDEX idx_sca_cluster ON signal_cluster_assignments(cluster_id);
CREATE INDEX idx_sca_signal ON signal_cluster_assignments(signal_id);
```

### 2.4 `entities`

Named entities extracted from signals (people, brands, products, events).

```sql
CREATE TABLE entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  entity_type     TEXT NOT NULL,                    -- person | brand | product | event | place
  normalized_name TEXT NOT NULL,                    -- lowercase, deduplicated
  metadata        JSONB DEFAULT '{}',               -- extra context
  signal_count    INTEGER DEFAULT 0,                -- denormalized
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_entities_normalized ON entities(normalized_name, entity_type);
CREATE INDEX idx_entities_type ON entities(entity_type);
```

### 2.5 `entity_signal_links`

```sql
CREATE TABLE entity_signal_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  mention_context TEXT,                             -- snippet where entity appears
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_esl_unique ON entity_signal_links(entity_id, signal_id);
```

### 2.6 `velocity_scores`

Daily scoring snapshots for historical tracking.

```sql
CREATE TABLE velocity_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id      UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  score_date      DATE NOT NULL,
  engagement_z    REAL NOT NULL,                    -- z-score of engagement deltas
  signal_freq_z   REAL NOT NULL,                    -- z-score of signal frequency
  velocity        REAL NOT NULL,                    -- 0.7*eng_z + 0.3*sig_z
  percentile      REAL NOT NULL,                    -- percentile rank that day
  signal_count    INTEGER NOT NULL,                 -- signals received that day
  lifecycle       TEXT NOT NULL,                    -- lifecycle assignment on that date
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_vs_cluster_date ON velocity_scores(cluster_id, score_date);
CREATE INDEX idx_vs_date ON velocity_scores(score_date DESC);
```

### 2.7 `intelligence_briefs`

Generated intelligence reports (daily digests, trend reports).

```sql
CREATE TABLE intelligence_briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_type      TEXT NOT NULL,                    -- daily_digest | trend_deep_dive | alert
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,                    -- markdown
  cluster_ids     UUID[] DEFAULT '{}',              -- related clusters
  metadata        JSONB DEFAULT '{}',
  generated_by    TEXT DEFAULT 'system',            -- system | user_request
  source_job_id   UUID,                             -- pipeline job that generated this
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ib_type ON intelligence_briefs(brief_type, created_at DESC);
```

### 2.8 `api_quota_tracking`

Self-tracking for external API rate limits.

```sql
CREATE TABLE api_quota_tracking (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_source      TEXT NOT NULL,                    -- youtube | reddit | rss | openai | anthropic
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  units_used      INTEGER DEFAULT 0,
  units_limit     INTEGER NOT NULL,                 -- e.g., 10000 for YouTube daily
  last_request_at TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_aqt_source_period ON api_quota_tracking(api_source, period_start);
```

### 2.9 RLS Policies

Intelligence data uses a new access pattern since it's not per-project — it's platform-wide.

```sql
-- New RLS helper: check if user has intelligence access
-- Phase 1: any @shareability.com user can read intelligence data
-- Phase 2: role-based (intelligence_analyst, intelligence_admin)
CREATE OR REPLACE FUNCTION has_intelligence_access()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    -- Phase 1: email domain check
    -- Phase 2: AND role IN ('admin', 'intelligence_analyst', 'intelligence_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- All intelligence tables: read access for authenticated users with intelligence access
ALTER TABLE trend_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intelligence_read" ON trend_clusters FOR SELECT USING (has_intelligence_access());
CREATE POLICY "intelligence_write" ON trend_clusters FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Repeat pattern for: signals, signal_cluster_assignments, entities,
-- entity_signal_links, velocity_scores, intelligence_briefs
-- (Service role key bypasses RLS for cron workers — same as existing pattern)
```

---

## 3. Signal Ingestion Architecture

### 3.1 Overview

Each source gets its own adapter module following a common interface. Adapters are invoked by a shared `signal-ingester` PM2 cron worker.

```
scripts/cron/
├── signal-ingester.mjs          # Main worker — calls adapters on schedule
├── lib/
│   ├── adapters/
│   │   ├── reddit-adapter.mjs   # snoowrap + OAuth2
│   │   ├── youtube-adapter.mjs  # googleapis + API key
│   │   ├── rss-adapter.mjs      # rss-parser (Phase 2)
│   │   └── adapter-interface.md # Shared contract docs
│   ├── quota-tracker.mjs        # API quota enforcement
│   ├── signal-dedup.mjs         # Cross-source dedup logic
│   ├── supabase.mjs             # (existing — shared)
│   └── cost-tracker.mjs         # (existing — extended for Intelligence)
```

### 3.2 Adapter Interface

Every adapter exports the same shape:

```javascript
// Each adapter must export:
export async function fetchSignals(config) {
  // Returns: { signals: Signal[], quota_used: number, errors: string[] }
}

export function getSchedule() {
  // Returns: { interval_minutes: number, source: string }
}

// Signal shape (before DB insert):
// {
//   source: 'reddit' | 'youtube' | 'rss',
//   source_id: string,       // platform-native unique ID
//   source_url: string,
//   title: string,
//   content_snippet: string,
//   author: string,
//   published_at: ISO string,
//   upvotes?: number,
//   comments?: number,
//   views?: number,
//   likes?: number,
//   subreddit?: string,
//   channel_id?: string,
//   content_hash?: string,   // for RSS dedup
//   metadata: {}
// }
```

### 3.3 Reddit Adapter

```
Library: snoowrap
Auth: OAuth2 script app (client_id, client_secret, username, password in env)
Rate limit: 100 requests/minute (self-enforced)

Strategy:
- Maintain list of 20-50 subreddits in config (culturally relevant)
- Every 1-2 hours: pull /rising (25 posts) + /hot (25 posts) per subreddit
- On re-pull of existing signal (matched by source_id = t3_xxxxx):
  - Calculate engagement_delta: { upvotes_delta, comments_delta }
  - Increment pull_count
  - Idempotent upsert keyed on (source='reddit', source_id)

Batching: Process 5 subreddits per cycle, rotate through full list
Env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
```

**Subreddit config** (stored as JSON, editable via admin API):

```json
{
  "subreddits": [
    "popculture", "music", "entertainment", "hiphopheads", "movies",
    "television", "gaming", "technology", "sports", "nba",
    "nfl", "soccer", "mma", "boxing", "tennis",
    "fashion", "streetwear", "sneakers", "food", "travel",
    "viral", "tiktokcringe", "publicfreakout", "nextfuckinglevel", "interestingasfuck",
    "worldnews", "news", "science", "space", "futurology"
  ],
  "posts_per_subreddit": 25,
  "sort_types": ["rising", "hot"]
}
```

### 3.4 YouTube Adapter

```
Library: googleapis (youtube v3)
Auth: API key (YOUTUBE_API_KEY env var)
Rate limit: 10,000 units/day (self-tracked in api_quota_tracking table)

Strategy:
- videos.list(chart='mostPopular', regionCode='US', maxResults=50) = 1 unit
  → Run every 2 hours, 12 calls/day = 12 units

- search.list(q=keyword, order='viewCount', publishedAfter=24h) = 100 units
  → 10 keyword searches/cycle, 6 cycles/day = 6,000 units

- videos.list(id=comma_separated, part='statistics') = 1 unit
  → Velocity checks on tracked videos = ~500 units/day

Total estimated: ~6,500 units/day (leaves 3,500 buffer)

Keywords (configurable): trending, viral, breaking, cultural moment,
  reaction, drama, controversy, [dynamic from active cluster names]

Velocity tracking:
- On re-fetch of existing video: compute view_delta = current_views - stored_views
- Store in engagement_delta JSONB
```

### 3.5 Idempotent Upsert Pattern

All adapters use the same upsert logic:

```sql
INSERT INTO signals (source, source_id, title, content_snippet, ...)
VALUES ($1, $2, $3, $4, ...)
ON CONFLICT (source, source_id)
DO UPDATE SET
  upvotes = EXCLUDED.upvotes,
  comments = EXCLUDED.comments,
  views = EXCLUDED.views,
  likes = EXCLUDED.likes,
  engagement_delta = jsonb_build_object(
    'upvotes_delta', EXCLUDED.upvotes - signals.upvotes,
    'views_delta', EXCLUDED.views - signals.views,
    'comments_delta', EXCLUDED.comments - signals.comments
  ),
  pull_count = signals.pull_count + 1,
  metadata = signals.metadata || EXCLUDED.metadata;
```

This is implemented via a Supabase RPC function for atomicity:

```sql
CREATE OR REPLACE FUNCTION upsert_signal(p_signal JSONB)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO signals (source, source_id, title, content_snippet, author,
    subreddit, channel_id, source_url, published_at, upvotes, comments,
    views, likes, content_hash, metadata)
  VALUES (
    p_signal->>'source', p_signal->>'source_id', p_signal->>'title',
    p_signal->>'content_snippet', p_signal->>'author',
    p_signal->>'subreddit', p_signal->>'channel_id', p_signal->>'source_url',
    (p_signal->>'published_at')::timestamptz,
    (p_signal->>'upvotes')::integer, (p_signal->>'comments')::integer,
    (p_signal->>'views')::bigint, (p_signal->>'likes')::integer,
    p_signal->>'content_hash', COALESCE(p_signal->'metadata', '{}'::jsonb)
  )
  ON CONFLICT (source, source_id)
  DO UPDATE SET
    upvotes = COALESCE(EXCLUDED.upvotes, signals.upvotes),
    comments = COALESCE(EXCLUDED.comments, signals.comments),
    views = COALESCE(EXCLUDED.views, signals.views),
    likes = COALESCE(EXCLUDED.likes, signals.likes),
    engagement_delta = jsonb_build_object(
      'upvotes_delta', COALESCE(EXCLUDED.upvotes, 0) - COALESCE(signals.upvotes, 0),
      'views_delta', COALESCE(EXCLUDED.views, 0) - COALESCE(signals.views, 0),
      'comments_delta', COALESCE(EXCLUDED.comments, 0) - COALESCE(signals.comments, 0)
    ),
    pull_count = signals.pull_count + 1
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
```

### 3.6 Quota Tracker

New module `lib/quota-tracker.mjs` — wraps `api_quota_tracking` table:

```javascript
// Core API:
export async function checkQuota(source)        // → { allowed: boolean, remaining: number }
export async function consumeQuota(source, units) // → void (logs usage)
export async function getQuotaStatus()          // → all sources summary

// YouTube-specific:
// - Daily period: midnight UTC to midnight UTC
// - Hard stop at 9,500 units (500 buffer for manual queries)
// - Logged per-call so we know exactly what consumed budget

// Reddit-specific:
// - Rolling 60-second window
// - Max 90 requests (10% buffer from 100 limit)
```

---

## 4. LLM Clustering Pipeline

### 4.1 Architecture

Clustering runs as a pipeline job type (`intel-cluster`) on the existing `pipeline_jobs` table, executed by a new handler in the signal-ingester worker.

```
Signal ingestion completes
  → Check: ≥20 unclustered signals? (configurable threshold)
    → Yes: Queue intel-cluster job
    → No: Wait for next ingestion cycle
```

### 4.2 Incremental Clustering Algorithm

```
INPUT:
  - existing_clusters: SELECT id, name, summary, category, signal_count
                       FROM trend_clusters WHERE is_active = true
    (~2K tokens for 50 clusters — just names + summaries)
  - new_signals: SELECT id, title, content_snippet, source, metadata
                 FROM signals WHERE is_clustered = false
                 ORDER BY ingested_at ASC LIMIT 200

LLM PROMPT:
  "Given these existing trend clusters and new signals, assign each signal
   to the best-matching cluster(s) or propose new clusters.

   Output JSON:
   {
     assignments: [
       { signal_id, cluster_id, confidence, is_primary },
       { signal_id, cluster_id: 'NEW', new_cluster: { name, summary, category, tags }, confidence, is_primary }
     ]
   }"

POST-PROCESSING:
  1. Create any new clusters proposed by LLM
  2. Insert signal_cluster_assignments
  3. Mark signals as is_clustered = true
  4. Update denormalized signal_count on trend_clusters
  5. Update last_signal_at on assigned clusters
```

### 4.3 Model Selection

| Model | Cost (per 1M tokens) | Use Case |
|-------|---------------------|----------|
| Claude Haiku 4.5 | $0.10 in / $0.50 out | Primary clustering model |
| GPT-4o-mini | $0.15 in / $0.60 out | Fallback if Anthropic is down |

**Cost estimate:** 200 signals × ~100 tokens each = 20K tokens input + 2K cluster context = 22K input. Output ~5K tokens. Per batch: ~$0.004. Even at 20 batches/day = $0.08/day.

### 4.4 Cluster Maintenance

Periodic maintenance jobs (daily, as part of velocity calculation):

- **Merge detection:** If two clusters have >60% signal overlap, LLM proposes merge → `merged_into_id`
- **Stale cleanup:** Clusters with 0 signals in 30 days and `dormant` lifecycle → `is_active = false`
- **Name refinement:** Clusters with >50 new signals since last rename → LLM refreshes name/summary

### 4.5 Pipeline Job Types

New job types added to `pipeline_jobs`:

```
intel-ingest-reddit     → Reddit signal pull
intel-ingest-youtube    → YouTube signal pull
intel-ingest-rss        → RSS signal pull (Phase 2)
intel-cluster           → LLM clustering batch
intel-velocity          → Daily velocity recalculation
intel-brief-daily       → Daily intelligence digest generation
```

These follow the existing `pipeline_jobs` pattern: `queued → running → completed/failed`, with `automation_log` entries and cost tracking.

---

## 5. Velocity & Lifecycle Engine

### 5.1 Daily Velocity Calculation

Runs once daily via PM2 cron. Implemented as a PostgreSQL function for performance (avoids round-tripping data to Node.js).

```sql
CREATE OR REPLACE FUNCTION calculate_daily_velocity(p_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_eng_mean REAL;
  v_eng_stddev REAL;
  v_sig_mean REAL;
  v_sig_stddev REAL;
BEGIN
  -- Step 1: Calculate raw engagement scores per cluster (last 24h)
  CREATE TEMP TABLE _cluster_raw ON COMMIT DROP AS
  SELECT
    tc.id AS cluster_id,
    -- Engagement: sum of all engagement deltas for signals in this cluster
    COALESCE(SUM(
      COALESCE((s.engagement_delta->>'upvotes_delta')::real, 0) +
      COALESCE((s.engagement_delta->>'views_delta')::real, 0) / 1000 +  -- normalize views
      COALESCE((s.engagement_delta->>'comments_delta')::real, 0) * 2    -- comments weighted 2x
    ), 0) AS raw_engagement,
    -- Signal frequency: count of new signals assigned in last 24h
    COUNT(DISTINCT sca.signal_id) AS signal_freq
  FROM trend_clusters tc
  LEFT JOIN signal_cluster_assignments sca ON sca.cluster_id = tc.id
  LEFT JOIN signals s ON s.id = sca.signal_id
    AND s.ingested_at >= (p_date - INTERVAL '1 day')
  WHERE tc.is_active = true
  GROUP BY tc.id;

  -- Step 2: Calculate z-scores
  SELECT AVG(raw_engagement), NULLIF(STDDEV(raw_engagement), 0)
  INTO v_eng_mean, v_eng_stddev FROM _cluster_raw;

  SELECT AVG(signal_freq), NULLIF(STDDEV(signal_freq), 0)
  INTO v_sig_mean, v_sig_stddev FROM _cluster_raw;

  -- Step 3: Insert velocity scores + update cluster lifecycle
  INSERT INTO velocity_scores (cluster_id, score_date, engagement_z, signal_freq_z, velocity, percentile, signal_count, lifecycle)
  SELECT
    cr.cluster_id,
    p_date,
    COALESCE((cr.raw_engagement - v_eng_mean) / v_eng_stddev, 0) AS eng_z,
    COALESCE((cr.signal_freq - v_sig_mean) / v_sig_stddev, 0) AS sig_z,
    -- velocity = 0.7*eng_z + 0.3*sig_z
    0.7 * COALESCE((cr.raw_engagement - v_eng_mean) / v_eng_stddev, 0) +
    0.3 * COALESCE((cr.signal_freq - v_sig_mean) / v_sig_stddev, 0) AS velocity,
    -- percentile calculated via window function below
    0 AS percentile, -- placeholder, updated next
    cr.signal_freq,
    'emerging' AS lifecycle -- placeholder, updated next
  FROM _cluster_raw cr
  ON CONFLICT (cluster_id, score_date) DO UPDATE SET
    engagement_z = EXCLUDED.engagement_z,
    signal_freq_z = EXCLUDED.signal_freq_z,
    velocity = EXCLUDED.velocity,
    signal_count = EXCLUDED.signal_count;

  -- Step 4: Update percentiles
  UPDATE velocity_scores vs SET
    percentile = sub.pctile
  FROM (
    SELECT id, PERCENT_RANK() OVER (ORDER BY velocity) * 100 AS pctile
    FROM velocity_scores WHERE score_date = p_date
  ) sub
  WHERE vs.id = sub.id AND vs.score_date = p_date;

  -- Step 5: Assign lifecycle based on percentile thresholds
  UPDATE velocity_scores vs SET lifecycle = CASE
    -- Peaking: ≥90th percentile
    WHEN vs.percentile >= 90 THEN 'peaking'
    -- Emerging: <72h old AND ≥70th percentile
    WHEN tc.first_seen_at >= (now() - INTERVAL '72 hours') AND vs.percentile >= 70 THEN 'emerging'
    -- Cooling: was ≥70th percentile yesterday, now ≤40th
    WHEN prev.percentile >= 70 AND vs.percentile <= 40 THEN 'cooling'
    -- Evergreen: ≥14 days old AND ≥1 signal/day average
    WHEN tc.first_seen_at <= (now() - INTERVAL '14 days')
      AND tc.signal_count::real / GREATEST(EXTRACT(EPOCH FROM now() - tc.first_seen_at) / 86400, 1) >= 1
    THEN 'evergreen'
    -- Dormant: no signals in 7 days
    WHEN tc.last_signal_at < (now() - INTERVAL '7 days') THEN 'dormant'
    -- Default: keep previous lifecycle
    ELSE COALESCE(tc.lifecycle, 'emerging')
  END
  FROM trend_clusters tc
  LEFT JOIN velocity_scores prev ON prev.cluster_id = tc.id AND prev.score_date = p_date - 1
  WHERE vs.cluster_id = tc.id AND vs.score_date = p_date;

  -- Step 6: Propagate to trend_clusters table
  UPDATE trend_clusters tc SET
    velocity_score = vs.velocity,
    velocity_percentile = vs.percentile,
    lifecycle = vs.lifecycle,
    updated_at = now()
  FROM velocity_scores vs
  WHERE vs.cluster_id = tc.id AND vs.score_date = p_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

### 5.2 Lifecycle Rules Summary

| Lifecycle | Criteria | Trigger |
|-----------|----------|---------|
| **Emerging** | <72h old AND ≥70th percentile velocity | First detected with momentum |
| **Peaking** | ≥90th percentile velocity | Maximum cultural relevance |
| **Cooling** | Was ≥70th, now ≤40th percentile | Declining relevance |
| **Evergreen** | ≥14 days old AND ≥1 signal/day average | Sustained cultural presence |
| **Dormant** | No new signals for 7 days | Faded from conversation |

---

## 6. Cross-Department Data Model

### 6.1 Project-Intelligence Links

Projects can reference Intelligence trends. This enables: "Build a PitchApp for a client riding [trend X]."

```sql
CREATE TABLE project_trend_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cluster_id      UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  link_type       TEXT NOT NULL DEFAULT 'reference',  -- reference | inspiration | tracking
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_ptl_unique ON project_trend_links(project_id, cluster_id);
CREATE INDEX idx_ptl_project ON project_trend_links(project_id);
CREATE INDEX idx_ptl_cluster ON project_trend_links(cluster_id);
```

### 6.2 Strategy Department Extensions

```sql
-- pipeline_mode on projects: research_only | creative_only | full
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pipeline_mode TEXT DEFAULT 'full';

-- Versioned research storage
CREATE TABLE project_research (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  content         TEXT NOT NULL,                     -- markdown
  research_type   TEXT DEFAULT 'market',             -- market | competitive | trend | custom
  source_job_id   UUID,
  -- Cross-department reference
  trend_cluster_ids UUID[] DEFAULT '{}',             -- Intelligence trends used as input
  status          TEXT DEFAULT 'draft',              -- draft | approved | superseded
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pr_project ON project_research(project_id, version DESC);
```

### 6.3 Cross-Department Pipeline Handoffs

```
Intelligence → Strategy:
  - Trend clusters feed into project_research auto-research step
  - project_research.trend_cluster_ids links back to source trends
  - Strategy "trend context" prompt includes top trends from Intelligence

Strategy → Creative:
  - project_research feeds into narrative extraction (existing flow)
  - Brand analysis + research → auto-build (existing)
  - New: research.md includes Intelligence trend context when project has trend links

Intelligence → Creative (direct):
  - Trend velocity data can be injected into PitchApp copy
  - "This cultural moment is at [velocity] — here's why it matters for your brand"
```

### 6.4 Notification System Extension

Existing `notifications` table works unchanged. New notification types:

```
Type                    | When                                    | Recipients
----------------------- | --------------------------------------- | ----------
trend_alert             | Cluster hits 'peaking' lifecycle        | All intelligence users
trend_cooling           | Cluster drops to 'cooling'              | Users tracking that trend
daily_digest_ready      | Daily intelligence brief generated      | All intelligence users
research_trend_match    | Project research matches active trend   | Project members
```

### 6.5 Cost Tracking Per Department

Extend existing `automation_log` with department tagging:

```sql
ALTER TABLE automation_log ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'creative';
-- Values: creative | intelligence | strategy

-- Cost queries by department:
-- SELECT department, SUM((details->>'cost_cents')::integer)
-- FROM automation_log WHERE event = 'cost-incurred'
-- AND created_at >= CURRENT_DATE GROUP BY department;
```

The existing `cost-tracker.mjs` `getDailyCostCents()` function gets a department-filtered variant:

```javascript
export async function getDailyCostByDepartment() {
  // Returns: { creative: number, intelligence: number, strategy: number }
}
```

Circuit breaker checks can optionally enforce per-department caps.

---

## 7. Strategy Department Extensions

### 7.1 `pipeline_mode` Column

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pipeline_mode TEXT DEFAULT 'full'
  CHECK (pipeline_mode IN ('full', 'research_only', 'creative_only'));
```

**Pipeline mode affects `createFollowUpJobs`:**

| Mode | Pipeline Stops After |
|------|---------------------|
| `full` | Full pipeline (unchanged) |
| `research_only` | `auto-research` → done (no narrative/build) |
| `creative_only` | Skips `auto-research`, starts at `auto-narrative` |

### 7.2 Mode-Aware Follow-Up Logic

Modify `createFollowUpJobs` in `pipeline-executor.mjs`:

```javascript
// In createFollowUpJobs, before looking up PIPELINE_SEQUENCE:
const project = await dbGet("projects", `select=pipeline_mode&id=eq.${completedJob.project_id}`);
const mode = project[0]?.pipeline_mode || "full";

// If research_only mode and research just completed, stop
if (mode === "research_only" && completedJob.job_type === "auto-research") {
  await logAutomation("pipeline-mode-stop", { mode, stopped_after: "auto-research" }, completedJob.project_id);
  return; // No follow-up
}

// If creative_only mode and pull just completed, skip to narrative
if (mode === "creative_only" && completedJob.job_type === "auto-pull") {
  // Override: next job is auto-narrative, not auto-research
  nextType = "auto-narrative";
}
```

---

## 8. API Endpoints

### 8.1 Intelligence Department APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/intelligence/trends` | List active trends (filterable by lifecycle, category) |
| GET | `/api/intelligence/trends/[id]` | Trend detail with signals, velocity history |
| GET | `/api/intelligence/trends/[id]/signals` | Paginated signals for a trend |
| GET | `/api/intelligence/signals` | Recent signals feed (filterable by source) |
| GET | `/api/intelligence/velocity` | Velocity leaderboard (top movers) |
| GET | `/api/intelligence/briefs` | Intelligence briefs (daily digests) |
| GET | `/api/intelligence/briefs/[id]` | Single brief detail |
| POST | `/api/intelligence/trends/[id]/link` | Link a trend to a project |
| DELETE | `/api/intelligence/trends/[id]/link/[projectId]` | Unlink trend from project |
| GET | `/api/intelligence/entities` | Entity list with signal counts |
| GET | `/api/intelligence/status` | Ingestion health — last run times, quota status, error rates |

### 8.2 Strategy Department APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/projects/[id]/research` | Get versioned research for project |
| POST | `/api/projects/[id]/research` | Create/update research (manual) |
| PATCH | `/api/projects/[id]` | Update pipeline_mode field |

### 8.3 Admin/Operations APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/intelligence/config` | View source configs (subreddits, keywords) |
| PATCH | `/api/admin/intelligence/config` | Update source configs |
| GET | `/api/admin/intelligence/quotas` | API quota dashboard |
| POST | `/api/admin/intelligence/ingest` | Manual trigger: run ingestion now |
| GET | `/api/admin/costs/by-department` | Cost breakdown by department |

---

## 9. Job Scheduling — PM2 Integration

### 9.1 Decision: PM2 Cron (Not Inngest)

**Why PM2 over Inngest:**

| Factor | PM2 (Chosen) | Inngest |
|--------|-------------|---------|
| Existing pattern | Already running 4 PM2 workers | Would be a new dependency |
| Infra complexity | Zero — same server, same process model | Needs Inngest Cloud or self-host |
| Cost tracking | Reuses `cost-tracker.mjs` and `automation_log` | Would need adapter layer |
| Circuit breaker | Reuses `checkCircuitBreaker()` | Would need reimplementation |
| Observability | PM2 logs + `automation_log` table + portal dashboard | Inngest dashboard (separate) |
| Retry/failure | Existing retry + escalation pattern | Built-in (nicer, but means two retry systems) |
| Local dev | `node scripts/cron/signal-ingester.mjs` | Needs Inngest dev server |

**The tradeoff:** Inngest has better fan-out and step functions, but it introduces a new dependency and splits observability. PM2 + Supabase is proven here, and the Intelligence workload (periodic polling) fits the cron model well. Inngest would make more sense if we had complex event-driven graphs, but our pipeline is linear: ingest → cluster → score.

**Revisit trigger:** If we need sub-minute scheduling or complex branching (e.g., "when Reddit detects a spike, immediately run YouTube search for that topic"), Inngest becomes worth the migration cost.

### 9.2 New PM2 Workers

```javascript
// ecosystem.config.cjs additions:

{
  name: "signal-ingester",
  script: "signal-ingester.mjs",
  cwd: __dirname,
  autorestart: true,          // Long-running like pipeline-executor
  watch: false,
  max_memory_restart: "512M",
  kill_timeout: 60000,        // 1 min grace (API calls are fast)
  env: {
    NODE_ENV: "production",
    AUTOMATION_ENABLED: "true",
    REDDIT_CLIENT_ID: "",     // Set via PM2 env or .env.local
    REDDIT_CLIENT_SECRET: "",
    REDDIT_USERNAME: "",
    REDDIT_PASSWORD: "",
    YOUTUBE_API_KEY: "",
  },
},
{
  name: "velocity-calculator",
  script: "velocity-calculator.mjs",
  cwd: __dirname,
  cron_restart: "0 6 * * *",  // Daily at 6 AM UTC
  autorestart: false,
  watch: false,
  env: {
    NODE_ENV: "production",
    AUTOMATION_ENABLED: "true",
  },
},
```

### 9.3 Signal Ingester — Internal Schedule

The `signal-ingester.mjs` worker runs continuously (like `pipeline-executor.mjs`) with an internal scheduler:

```javascript
// Internal schedule (minutes between runs per source)
const SOURCE_SCHEDULES = {
  reddit:  { interval_minutes: 90,  enabled: true },
  youtube: { interval_minutes: 120, enabled: true },
  rss:     { interval_minutes: 360, enabled: false },  // Phase 2
};

// Main loop
while (true) {
  for (const [source, config] of Object.entries(SOURCE_SCHEDULES)) {
    if (!config.enabled) continue;
    if (!isDue(source, config.interval_minutes)) continue;

    // Check quota
    const quota = await checkQuota(source);
    if (!quota.allowed) { log(`${source}: quota exhausted`); continue; }

    // Run adapter
    const adapter = adapters[source];
    const result = await adapter.fetchSignals(getSourceConfig(source));

    // Upsert signals
    for (const signal of result.signals) {
      await dbRpc('upsert_signal', { p_signal: signal });
    }

    // Log quota consumption
    await consumeQuota(source, result.quota_used);

    // Check if clustering threshold reached
    const unclustered = await getUnclusteredCount();
    if (unclustered >= CLUSTER_THRESHOLD) {
      await queueClusteringJob();
    }

    markLastRun(source);
  }

  await sleep(60_000); // Check schedules every minute
}
```

### 9.4 How It Fits With Existing Workers

```
PM2 Process Map (after Intelligence):
───────────────────────────────────────────────────
mission-scanner       */15 * * * *   Creative pipeline scanner
approval-watcher      */5 * * * *    Creative approval gates
pipeline-executor     autorestart    Creative pipeline execution
health-monitor        */6h           URL health checks
signal-ingester       autorestart    Intelligence signal collection + clustering
velocity-calculator   daily 6AM      Intelligence velocity scoring
───────────────────────────────────────────────────
```

The signal-ingester is **isolated** from the pipeline-executor:
- Separate process, separate memory
- Uses the same `supabase.mjs` and `cost-tracker.mjs` libs
- Writes to different tables (signals, trend_clusters vs. pipeline_jobs, projects)
- Circuit breaker can be shared (same daily cost cap applies across departments)

---

## 10. Cost Tracking & Circuit Breakers

### 10.1 Extended Cost Tracker

```javascript
// cost-tracker.mjs additions:

// Department-aware cost caps
const DEPARTMENT_CAPS = {
  creative:     parseInt(process.env.CREATIVE_DAILY_CAP_CENTS || "40000", 10),   // $400
  intelligence: parseInt(process.env.INTELLIGENCE_DAILY_CAP_CENTS || "5000", 10), // $50
  strategy:     parseInt(process.env.STRATEGY_DAILY_CAP_CENTS || "5000", 10),     // $50
};

export async function checkDepartmentBudget(department) {
  const dailyCost = await getDailyCostByDepartment();
  const used = dailyCost[department] || 0;
  const cap = DEPARTMENT_CAPS[department] || 0;
  return { allowed: used < cap, used, cap, remaining: cap - used };
}
```

### 10.2 Intelligence-Specific Costs

| Operation | Model | Estimated Cost/Run |
|-----------|-------|-------------------|
| LLM Clustering (200 signals) | Haiku | ~$0.004 |
| Daily digest generation | Haiku | ~$0.008 |
| Entity extraction (batch) | Haiku | ~$0.003 |
| Reddit API | Free | $0 |
| YouTube API | Free (10K units) | $0 |
| RSS parsing | N/A | $0 |

**Daily Intelligence cost estimate: ~$0.10-0.50/day** (dominated by LLM clustering frequency). Well within the $50 department cap.

### 10.3 Circuit Breaker Extensions

The existing `checkCircuitBreaker()` gains awareness of Intelligence jobs:

```javascript
// In getRunningBuildCount(): add Intelligence job types
const INTELLIGENCE_JOB_TYPES = [
  'intel-ingest-reddit', 'intel-ingest-youtube', 'intel-ingest-rss',
  'intel-cluster', 'intel-velocity', 'intel-brief-daily'
];

// Intelligence jobs are lighter weight — separate concurrency limit
const MAX_CONCURRENT_INTEL = 2;  // Parallel ingestion is fine
```

---

## 11. Migration Plan

### Phase 1: Foundation (Week 1-2)

1. Run SQL migration: Intelligence tables + indexes + RLS
2. Run SQL migration: `pipeline_mode` on projects, `project_research` table
3. Run SQL migration: `department` column on `automation_log`
4. Create `upsert_signal` and `calculate_daily_velocity` RPC functions
5. Deploy `quota-tracker.mjs` lib
6. Deploy Reddit adapter + YouTube adapter
7. Deploy `signal-ingester.mjs` PM2 worker
8. Test: signals flowing into DB, dedup working

### Phase 2: Clustering (Week 2-3)

1. Deploy clustering handler in signal-ingester
2. Configure Haiku/GPT-4o-mini API keys
3. Test: signals → clusters, multi-assignment working
4. Deploy `velocity-calculator.mjs` PM2 worker
5. Test: daily velocity scores + lifecycle transitions

### Phase 3: API + UI (Week 3-4)

1. Deploy Intelligence API endpoints
2. Build Intelligence department UI (separate task)
3. Deploy cross-department linking (project_trend_links)
4. Wire Strategy extensions (pipeline_mode, project_research)
5. Update `createFollowUpJobs` for mode-aware pipelines

### Phase 4: Intelligence Briefs + Refinement (Week 4-5)

1. Deploy daily digest generation
2. Deploy entity extraction pipeline
3. RSS adapter (Phase 2 source)
4. Admin dashboard for Intelligence ops (quota monitoring, source config)
5. Trend notifications wired to existing notification system

### Migration File Naming

Following the existing convention (`20260214_*.sql`):

```
20260214_intelligence_core.sql        — trend_clusters, signals, signal_cluster_assignments
20260214_intelligence_entities.sql    — entities, entity_signal_links
20260214_intelligence_velocity.sql    — velocity_scores, calculate_daily_velocity function
20260214_intelligence_briefs.sql      — intelligence_briefs, api_quota_tracking
20260214_intelligence_rls.sql         — has_intelligence_access(), all RLS policies
20260214_cross_department.sql         — project_trend_links, project_research, pipeline_mode, department on automation_log
20260214_signal_upsert.sql            — upsert_signal() RPC function
```

---

## Appendix: File Tree (New Files)

```
scripts/cron/
├── signal-ingester.mjs              # NEW — main Intelligence worker
├── velocity-calculator.mjs          # NEW — daily velocity cron
├── lib/
│   ├── adapters/
│   │   ├── reddit-adapter.mjs       # NEW
│   │   ├── youtube-adapter.mjs      # NEW
│   │   └── rss-adapter.mjs          # NEW (Phase 2)
│   ├── quota-tracker.mjs            # NEW — API rate limiting
│   ├── signal-dedup.mjs             # NEW — cross-source dedup
│   ├── cluster-engine.mjs           # NEW — LLM clustering logic
│   ├── supabase.mjs                 # EXISTING (unchanged)
│   └── cost-tracker.mjs             # EXISTING (extended with department caps)

apps/portal/
├── supabase/migrations/
│   ├── 20260214_intelligence_core.sql
│   ├── 20260214_intelligence_entities.sql
│   ├── 20260214_intelligence_velocity.sql
│   ├── 20260214_intelligence_briefs.sql
│   ├── 20260214_intelligence_rls.sql
│   ├── 20260214_cross_department.sql
│   └── 20260214_signal_upsert.sql
├── src/
│   ├── app/api/intelligence/         # NEW — all Intelligence API routes
│   │   ├── trends/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       ├── signals/route.ts
│   │   │       └── link/route.ts
│   │   ├── signals/route.ts
│   │   ├── velocity/route.ts
│   │   ├── briefs/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── entities/route.ts
│   │   └── status/route.ts
│   └── types/database.ts            # EXISTING (extended with Intelligence types)
```
