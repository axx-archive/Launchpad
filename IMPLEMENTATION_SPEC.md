# Spark Platform — Unified Implementation Spec

> **Author:** Product Lead (Technical)
> **Date:** 2026-02-15
> **Status:** Rev 3 (FINAL) — all agent findings, creative rulings, and code review blockers addressed
> **Scope:** Upload limits, cross-department context, cross-project awareness, Intelligence APIs, Smart Memory

---

## Design Principles (Creative Lead Rulings)

These are non-negotiable brand standards that govern every feature in this spec:

1. **No enterprise-y UX.** No settings tables, preference panels, or admin dashboards that look like Jira. Every surface should feel like Spark — cinematic, alive, confident.
2. **Scout is the primary feedback surface.** Users teach Spark by talking to Scout, not by filling out forms. Implicit learning > explicit configuration.
3. **Cross-project awareness = peripheral vision, not a dashboard.** Users should sense related work at the edges of their current context (triptych panels, hover reveals, ambient indicators), not navigate to a "My Work" page.
4. **Admin visualizations should be alive.** System learnings rendered as a spatial constellation (nodes, connections, gravity), not a CRUD table. Data should feel organic.
5. **Upload UX should be terminal-native.** Drag-and-drop into the terminal aesthetic, not a file picker dialog.

---

## Executive Summary

The Spark Portal has mature infrastructure across its 3 departments (Creative, Strategy, Intelligence) — database tables, API routes, pipeline stages, and UI components are all well-built. However, five key gaps limit the platform's compounding intelligence:

1. **Upload limits are too conservative** — 25MB docs, 50MB brand assets when Anthropic can handle much more
2. **Cross-department context is lost on promotion** — metadata flows, but intellectual content doesn't
3. **No user-level learning** — every project starts from zero; no preference memory, no feedback loop
4. **Cross-project awareness is global, not personal** — TriptychHome shows all projects, not contextual peripheral vision of related work
5. **Signal ingestion has critical API risks** — Reddit pre-approval required since Nov 2025; HackerNews (free, high-value) not yet built

This spec defines the implementation plan in 3 priority tiers, with exact file paths, database migrations, and build order.

---

## Priority 1: Quick Wins (1-2 days each)

### 1.1 Upload Limit Bumps

**Problem:** Current limits (25MB per doc, 50MB total brand assets) are conservative. Supabase storage supports much larger files, and the signed URL upload pattern already bypasses Vercel body limits.

**Current constants:**

| File | Constant | Current Value |
|------|----------|---------------|
| `apps/portal/src/components/FileUpload.tsx:5` | `MAX_FILE_SIZE` | 25MB |
| `apps/portal/src/components/FileUpload.tsx:6` | `MAX_TOTAL_SIZE` | 25MB |
| `apps/portal/src/components/FileUpload.tsx:7` | `MAX_FILES` | 10 |
| `apps/portal/src/app/api/projects/[id]/documents/route.ts:6` | `MAX_TOTAL_SIZE` | 25MB |
| `apps/portal/src/app/api/projects/[id]/brand-assets/route.ts:5` | `MAX_FILE_SIZE` | 20MB |
| `apps/portal/src/app/api/projects/[id]/brand-assets/route.ts:6` | `MAX_TOTAL_SIZE` | 50MB |
| `apps/portal/src/app/api/projects/[id]/brand-assets/route.ts:7` | `MAX_ASSETS_PER_PROJECT` | 50 |

**Recommended new limits:**

| Category | Per-File | Per-Project Total | Max Count |
|----------|---------|-------------------|-----------|
| **Documents** | 50MB | 200MB | 20 |
| **Brand Assets** | 50MB | 500MB | 100 |

**Rationale:**
- Signed URL upload goes directly to Supabase storage — no Vercel body limit constraint
- Pitch decks can be 30-40MB; video brand assets even larger
- Supabase free tier has 1GB storage; paid tier has 100GB+ — 500MB per project is safe
- Max count increase (10→20 docs, 50→100 assets) reflects real client uploads (multiple deck versions, full brand packages)

**Files to change:**
1. `apps/portal/src/components/FileUpload.tsx` — update `MAX_FILE_SIZE`, `MAX_TOTAL_SIZE`, `MAX_FILES`
2. `apps/portal/src/app/api/projects/[id]/documents/route.ts` — update server-side validation
3. `apps/portal/src/app/api/projects/[id]/brand-assets/route.ts` — update server-side validation
4. Consider adding video MIME types to `ALLOWED_TYPES` in brand-assets: `video/mp4`, `video/quicktime`

**Dependencies:** None. Standalone change.

---

### 1.2 Context Forwarding on Cross-Department Promotion

**Problem:** When a Strategy project is promoted to Creative (via `/api/promote`), only structural metadata flows (company_name, project_name, notes). The actual research output, trend data, and quality scores are NOT forwarded. The pipeline executor doesn't look up `cross_department_refs` when building Claude prompts.

**Current promote flow (`apps/portal/src/app/api/promote/route.ts`):**
```
1. Create new project with company_name, project_name, notes → ✅
2. Copy project membership → ✅
3. Create cross_department_refs entry → ✅
4. Forward research content to new project → ❌ MISSING
5. Populate source_context on new project → ❌ MISSING
```

**Current pipeline flow (`scripts/cron/pipeline-executor.mjs`):**
```
handleAutoResearch (line 342):
  - Reads: mission.md, materials/ → ✅
  - Reads: cross_department_refs for upstream context → ❌ MISSING

handleAutoNarrative (line 413):
  - Reads: mission.md, materials/, research.md → ✅
  - Reads: upstream Strategy research or Intelligence trends → ❌ MISSING
```

**Fix — DB-first approach (no filesystem writes from serverless):**

> **BLOCKER NOTE (Code Review):** The original plan wrote `upstream-research.md` files to the local filesystem from `/api/promote`. This is impossible — promote runs in a Vercel serverless function with no persistent filesystem. The fix stores all upstream context in the database.

#### A. Store upstream context at promotion time

Two storage locations, used together:

1. **`cross_department_refs.metadata` JSONB** (already exists) — store the full upstream content at promotion time:

```javascript
// In /api/promote, after creating cross_department_ref:
await adminClient.from("cross_department_refs").update({
  metadata: {
    upstream_research: researchContent,     // full Strategy research text
    upstream_quality_scores: qualityScores, // research quality dimensions
    upstream_trend_context: trendSummary,   // Intelligence trend name, velocity, top signals
    forwarded_at: new Date().toISOString(),
    token_count: estimateTokens(researchContent), // for budget tracking
  }
}).eq("id", refId);
```

2. **`projects.source_context` JSONB** (new column) — denormalized snapshot on the target project for fast pipeline reads without JOIN:

```sql
-- Migration: 20260216_source_context.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_context JSONB;
COMMENT ON COLUMN projects.source_context IS
  'Denormalized upstream context captured at promotion time. Read by pipeline stages for prompt injection.';
```

```javascript
// In /api/promote, after creating new project:
await adminClient.from("projects").update({
  source_context: {
    source_department: sourceDepartment,
    source_project_id: sourceProjectId,
    research_summary: truncateToTokens(researchContent, 4000),
    trend_context: trendSummary,
    quality_scores: qualityScores,
    forwarded_at: new Date().toISOString(),
  }
}).eq("id", newProjectId);
```

#### B. Pipeline stages read upstream context from DB

Add to `handleAutoResearch` and `handleAutoNarrative` in `pipeline-executor.mjs`:

```javascript
// Load upstream context from project record (denormalized, no JOIN needed)
const { data: project } = await adminClient
  .from("projects")
  .select("source_context")
  .eq("id", projectId)
  .single();

const upstreamContext = project?.source_context;
```

Then inject into the prompt's `turn1Content` array:

```javascript
...(upstreamContext ? [{
  type: "text",
  text: `\n## Upstream Context (from ${upstreamContext.source_department} department)\nThis project was promoted from another department. Here is the prior research/analysis:\n\n${upstreamContext.research_summary || ""}\n\n${upstreamContext.trend_context || ""}`
}] : []),
```

#### C. Token budget enforcement

Per Systems Engineer analysis: upstream context adds ~6,000-11,000 tokens (<6% of context window overhead). Enforce a hard cap:

```javascript
const MAX_UPSTREAM_TOKENS = 4000;

function truncateToTokens(text, maxTokens) {
  // Rough estimate: 1 token ≈ 4 chars
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... truncated to fit token budget]";
}
```

The cap is applied at promotion time (stored truncated in `source_context`) so pipeline stages never need to worry about bloated prompts.

**Files to change:**
- `apps/portal/src/app/api/promote/route.ts` — populate `metadata` on cross_department_ref + `source_context` on new project
- `scripts/cron/pipeline-executor.mjs` — read `source_context` in `handleAutoResearch` and `handleAutoNarrative`
- `apps/portal/src/types/database.ts` — add `source_context` to `Project` interface

**New migration:** `20260216_source_context.sql` (ALTER TABLE projects ADD COLUMN source_context JSONB)

**Dependencies:** None — `cross_department_refs.metadata` column already exists.

---

### 1.3 Signals Table Schema Fix

**Problem:** The adapter interface returns `published_at` and `source_url` fields, but the `signals` table migration (`20260215_intelligence_core.sql`) does not include these columns. Also need to add `'hackernews'` to the source CHECK constraint for 1.4.

**Migration: `20260216_signals_schema_fix.sql`**

```sql
BEGIN;

ALTER TABLE signals ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Ensure enough timestamp precision for future velocity animations
-- (Creative Lead ruling: signal metadata must support velocity-driven ambient animations)
COMMENT ON COLUMN signals.published_at IS
  'Original publish time from source platform. Full TIMESTAMPTZ precision for velocity animation calculations.';

CREATE INDEX IF NOT EXISTS idx_signals_published_at ON signals(published_at DESC);

-- Expand source CHECK to include hackernews
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_check;
ALTER TABLE signals ADD CONSTRAINT signals_source_check
  CHECK (source IN ('reddit', 'youtube', 'x', 'rss', 'hackernews'));

-- === ROLLBACK ===
-- ALTER TABLE signals DROP COLUMN IF EXISTS published_at;
-- ALTER TABLE signals DROP COLUMN IF EXISTS source_url;
-- DROP INDEX IF EXISTS idx_signals_published_at;
-- ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_check;
-- ALTER TABLE signals ADD CONSTRAINT signals_source_check
--   CHECK (source IN ('reddit', 'youtube', 'x', 'rss'));

COMMIT;
```

**Dependencies:** None. Standalone schema fix.

---

### 1.4 HackerNews Adapter

**Problem:** HackerNews is a high-value signal source for tech/startup trends — zero cost, no auth, trivial to build. Recommended by Data Architect as Phase 1 priority.

**Implementation:**

New file: `scripts/cron/lib/adapters/hackernews-adapter.mjs`

```javascript
// HN API: https://hacker-news.firebaseio.com/v0/
// Endpoints: /topstories.json, /newstories.json, /beststories.json, /item/{id}.json
// No auth, no rate limits (be respectful), zero cost
```

**Budget strategy:**
- Fetch top 50 stories per cycle (50 item fetches = negligible)
- 60-minute cycle interval
- ~1,200 signals/day at peak

**Files to change:**
1. New: `scripts/cron/lib/adapters/hackernews-adapter.mjs` — follows adapter interface from `adapter-interface.md`
2. `scripts/cron/signal-ingester.mjs` — add `'hackernews'` to `SOURCE_SCHEDULES` (60min interval), add to `getSourceConfig()`

**Dependencies:** 1.3 (signals schema fix adds the `'hackernews'` CHECK constraint)

---

## Priority 2: Medium Effort (3-5 days each)

### 2.1 Cross-Project Awareness (Peripheral Vision)

**Problem:** TriptychHome and department dashboards show global project data, not user-specific views. A user should sense "my work across departments" through peripheral context — not navigate to a separate dashboard.

**Design rulings:**
- Cross-project awareness = peripheral vision, not a dashboard. **No "My Work" sidebar. No "My Work" page.**
- **Mission Context Rail: REPLACED** by triptych-based peripheral vision. The triptych's 3 panels map 1:1 to departments — user-specific work surfaces on those panels naturally, not in a separate rail widget.
- New surfaces: **deepened triptych hover reveals**, **Cmd+K wormhole**, **CrossDeptStrip** on department pages.

**Implementation plan:**

#### A. Deepened triptych hover reveals with provenance

Modify TriptychHome so each panel shows **the user's projects** in that department on hover — project names, statuses, and promoted-from lineage (from `cross_department_refs`). When hovering a project that was promoted from another department, show a faint ghost-line connecting to the source panel. This is peripheral vision — you notice connections without navigating.

User-scoped query (added to `apps/portal/src/app/page.tsx`):

```typescript
// Fetch user's projects across all departments
const { data: userProjects } = await adminClient
  .from("project_members")
  .select("project_id, role, projects(id, project_name, company_name, department, status, updated_at)")
  .eq("user_id", user.id)
  .order("projects(updated_at)", { ascending: false })
  .limit(10);
```

Pass as `myProjects` prop to TriptychHome, grouped by department.

#### B. Cmd+K wormhole

Enhance UniversalSearch with three new capabilities:
- **Recents section:** Show user's recently touched projects at the top (before search results)
- **Connection indicators:** When a search result has cross-department refs, show a subtle provenance chip (e.g., "← strategy" or "← intel: trend name")
- **Transition flash:** When navigating to a result, a brief department-color flash at the edge of the viewport indicates which world you're entering

Modify `/api/search` to boost results where the user is a member:
```sql
ORDER BY
  CASE WHEN pm.user_id = :userId THEN 0 ELSE 1 END,
  ts_rank(...) DESC
```

#### C. CrossDeptStrip on department pages

New component: `CrossDeptStrip.tsx` — a thin ambient strip at the top of each department page showing related activity in the other two departments. Not a navigation bar — a **peripheral awareness** strip.

Example on `/strategy`: "Creative: 2 builds from your research • Intelligence: 3 trends linked to your projects"

Renders as a single line with department-colored dots, fades out after 5 seconds or on scroll.

**Files to change:**
- `apps/portal/src/app/page.tsx` — add user-scoped queries
- `apps/portal/src/components/TriptychHome.tsx` — add `myProjects` prop, render user's work on panel hover, add cross-department ghost-lines
- `apps/portal/src/components/UniversalSearch.tsx` — add recents, connection indicators, transition flash
- `apps/portal/src/app/api/search/route.ts` — add user relevance boost
- New: `apps/portal/src/components/CrossDeptStrip.tsx` — ambient department awareness strip

**Database changes:** None — uses existing `project_members` + `cross_department_refs` tables.

---

### 2.2 Intelligence Signal API Configuration & Risk Mitigation

**Problem:** Adapters for Reddit, YouTube, and RSS exist but need credentials + risk mitigation.

**Critical finding from Data Architect audit:**

| Source | Status | Risk | Action |
|--------|--------|------|--------|
| YouTube | Ready — needs API key | LOW | Set up Google Cloud API key |
| Reddit | **Pre-approval required since Nov 2025** | **HIGH** | Submit pre-approval NOW; snoowrap is 5yr unmaintained |
| RSS | Ready — no auth needed | LOW | Expand feed list to 50+ |
| X/Twitter | NOT built | HIGH COST ($200/mo min) | **Skip Phase 1** — evaluate Phase 2 |
| HackerNews | NOT built | NONE | **Build in Phase 1** (see 1.4) |

**Reddit mitigation plan (immediate):**
1. **Verify** existing `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` still work
2. **Submit** pre-approval application via Reddit Developer Support form
3. **Replace snoowrap** with direct `fetch` + OAuth2 token management (snoowrap last published 5 years ago, uses deprecated password-grant flow)
4. **Add NSFW filtering** (`over_18` field check)
5. **Prepare fallback:** If Reddit access denied, increase RSS feed coverage for tech/startup content

**Environment variables needed:**

```env
# YouTube (ready to configure)
YOUTUBE_API_KEY=              # Google Cloud Console → YouTube Data API v3

# Reddit (verify existing credentials still work)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USERNAME=
REDDIT_PASSWORD=

# HackerNews — no env vars needed (public API)
```

**Cost projection:**

| Phase | Sources | Monthly Cost |
|-------|---------|-------------|
| Phase 1 | YouTube + Reddit + RSS + HackerNews | $0 |
| Phase 2 | + X/Twitter Basic | $200/mo |
| Phase 3 | + Crunchbase Pro, Google Trends | $699+/mo |

**Additional Phase 1 recommendations:**
- Apply for Google Trends API alpha access now (free, queue is long)
- Expand RSS feed list: add AI/ML (The Gradient, Import AI), gaming (Kotaku), finance (Bloomberg Tech)

**Files to change:**
- `apps/portal/.env.local` — add YouTube API key
- `scripts/cron/lib/adapters/reddit-adapter.mjs` — replace snoowrap with direct fetch, add NSFW filter
- `scripts/cron/signal-ingester.mjs` — verify PM2 config for all sources
- `scripts/cron/ecosystem.config.cjs` — ensure signal-ingester is configured

**Database changes:** None — intelligence tables already exist (except 1.3 schema fix).

---

## Priority 3: Major Feature — Smart Memory System

### Overview

Smart Memory gives Spark the ability to learn and improve over time at two levels:
- **Tier 1 — User Preferences:** Per-user, per-department adaptability learned from feedback. User A's preference for bigger text doesn't affect User B. Scoped by department.
- **Tier 2 — System Learnings:** Platform-wide intelligence across all builds. Section patterns, narrative arcs, research methods — all compound over time, versioned, with decay.

**Key design rulings:**
- **No explicit settings page in Phase 1.** Users teach Spark through Scout conversations and edit briefs. If someone wants to declare a preference explicitly, they tell Scout — extracted at 0.9 confidence.
- **Project owner's preferences win.** A PitchApp is the owner's story. Collaborators don't inject their preferences into someone else's project.
- **Scout proactively probes for preferences after milestones** (narrative approval, PitchApp approval) — "Now that we've shipped, anything you'd want done differently next time?"
- **Admin visualization = spatial constellation**, not a CRUD table. Learnings rendered as nodes with connections, gravity, and glow — department-colored, confidence-sized.

### 3.1 Database Schema

**Migration: `20260216_smart_memory.sql`**

Uses per-row key/value preference model (per-department, per-category) from the Backend Dev's design. This allows per-preference confidence scoring and source tracking — advantages that a single JSONB column can't provide. The trade-off vs a monolithic JSONB `preferences` column (codebase precedent: `pipeline_jobs.progress`, `project_research.quality_scores`) is more rows but finer-grained querying and updates without read-modify-write cycles.

```sql
BEGIN;

-- ============================================================
-- 1. user_preferences — per-user, per-department, per-category
-- ============================================================

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('creative', 'strategy', 'intelligence')),
  category TEXT NOT NULL,          -- 'typography', 'color', 'copy_style', 'layout', 'animation', 'narrative', 'research'
  preference_key TEXT NOT NULL,    -- 'font_size', 'accent_color', 'tone', 'preferred_arc'
  preference_value JSONB NOT NULL, -- flexible: string, number, array, object
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('inferred', 'scout_feedback', 'edit_brief', 'section_reaction', 'approval_pattern')),
  source_ref JSONB,                -- { project_id, scout_message_id, edit_brief_id } for provenance

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, department, category, preference_key)
);

COMMENT ON TABLE user_preferences IS
  'Per-user, per-department learned preferences. Key/value model allows unlimited dimensions without schema changes. Injected into pipeline prompts when confidence >= 0.5.';

-- NOTE: The UNIQUE constraint on (user_id, department, category, preference_key) creates an implicit index.
-- This additional prefix index covers the common query pattern: "all prefs for user X in department Y"
CREATE INDEX idx_user_prefs_user_dept ON user_preferences(user_id, department);

-- ============================================================
-- 2. system_learnings — platform-wide knowledge base
-- ============================================================

CREATE TABLE system_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL
    CHECK (department IN ('creative', 'strategy', 'intelligence', 'global')),
  category TEXT NOT NULL,          -- 'section_pattern', 'narrative_arc', 'research_method', 'copy_pattern', 'animation_pattern', 'build_technique', 'signal_source', 'cluster_pattern'
  learning_key TEXT NOT NULL,      -- unique identifier within category
  title TEXT NOT NULL,             -- human-readable title
  content JSONB NOT NULL,          -- the learning itself (flexible structure)
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  source_projects UUID[],         -- array of project IDs that contributed
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  decay_weight REAL NOT NULL DEFAULT 1.0 CHECK (decay_weight >= 0 AND decay_weight <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'admin_override')),
  admin_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (department, category, learning_key)
);

COMMENT ON TABLE system_learnings IS
  'Platform-wide learnings. Department-scoped or global. Versioned with auto-versioning trigger. Decays if not validated.';

CREATE INDEX idx_learnings_dept_cat ON system_learnings(department, category);
CREATE INDEX idx_learnings_status ON system_learnings(status) WHERE status = 'active';
CREATE INDEX idx_learnings_confidence ON system_learnings(confidence DESC);

-- ============================================================
-- 3. learning_versions — version history for system learnings
-- ============================================================

CREATE TABLE learning_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES system_learnings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,           -- snapshot of content at this version
  confidence REAL NOT NULL,
  change_reason TEXT,               -- why this version was created
  changed_by TEXT,                  -- 'pipeline', 'admin', 'decay'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (learning_id, version)
);

-- ============================================================
-- 4. feedback_signals — raw feedback events (input to learning)
-- ============================================================

CREATE TABLE feedback_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  signal_type TEXT NOT NULL
    CHECK (signal_type IN (
      'edit_brief',           -- structured edit request
      'narrative_revision',   -- narrative rejected/revision requested
      'narrative_approval',   -- narrative approved (positive signal)
      'pitchapp_approval',    -- pitchapp approved (positive signal)
      'scout_feedback',       -- explicit feedback in Scout chat
      'scout_probe_response', -- response to post-milestone preference probing
      'revision_count',       -- number of revision cycles (lower = better)
      'section_change',       -- section type changed during review
      'animation_request',    -- animation pattern requested
      'style_correction'      -- copy/design correction
    )),

  content JSONB NOT NULL,          -- varies by signal_type
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE feedback_signals IS
  'Raw feedback events from user actions. Processed into user_preferences and system_learnings by extraction pipeline. The processed flag is set transactionally with the INSERT into target tables to ensure idempotency.';

-- ============================================================
-- 5. Indexes
-- ============================================================

CREATE INDEX idx_fs_user ON feedback_signals(user_id, signal_type);
CREATE INDEX idx_fs_project ON feedback_signals(project_id);
CREATE INDEX idx_fs_unprocessed ON feedback_signals(processed) WHERE processed = false;

-- ============================================================
-- 6. Auto-versioning trigger for system_learnings
-- ============================================================

CREATE OR REPLACE FUNCTION version_learning()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.confidence IS DISTINCT FROM NEW.confidence THEN
    INSERT INTO learning_versions (learning_id, version, content, confidence, change_reason, changed_by)
    VALUES (OLD.id, OLD.version, OLD.content, OLD.confidence, 'auto-versioned on update', 'system');
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_version_learning
  BEFORE UPDATE ON system_learnings
  FOR EACH ROW
  EXECUTE FUNCTION version_learning();

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_prefs_select" ON user_preferences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_prefs_update" ON user_preferences
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_prefs_insert" ON user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

ALTER TABLE system_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_learnings" ON system_learnings
  FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'active');

ALTER TABLE learning_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_versions" ON learning_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);

ALTER TABLE feedback_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_signals" ON feedback_signals
  FOR ALL USING (user_id = auth.uid());

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if migration needs reverting)
-- ============================================================
-- DROP TRIGGER IF EXISTS trigger_version_learning ON system_learnings;
-- DROP FUNCTION IF EXISTS version_learning();
-- DROP TABLE IF EXISTS feedback_signals;
-- DROP TABLE IF EXISTS learning_versions;
-- DROP TABLE IF EXISTS system_learnings;
-- DROP TABLE IF EXISTS user_preferences;
```

### 3.2 Preference Categories & Confidence Scoring

**Preference categories (per-department):**

| Category | Keys | Example Values | Primary Source |
|----------|------|----------------|----------------|
| `typography` | `font_size_preference`, `heading_style` | `"larger"`, `"serif"` | edit briefs |
| `color` | `preferred_palette`, `accent_preference` | `"warm"`, `"#c8a44e"` | explicit / inferred |
| `copy_style` | `tone`, `length_preference`, `formality` | `"confident"`, `"concise"`, `"casual"` | Scout feedback |
| `layout` | `section_density`, `image_preference` | `"spacious"`, `"minimal_images"` | edit patterns |
| `animation` | `motion_preference`, `interaction_level` | `"subtle"`, `"high"` | edit briefs |
| `narrative` | `preferred_arc`, `proof_style` | `"evolution"`, `"data_heavy"` | approval patterns |
| `research` | `depth_preference`, `format` | `"comprehensive"`, `"executive_summary"` | Strategy feedback |

**Confidence scoring:**

| Signal Type | Starting Confidence | Boost per Repetition |
|-------------|-------------------|---------------------|
| Direct Scout declaration ("I prefer larger text") | 0.9 | — (already high) |
| Scout probe response (post-milestone) | 0.85 | — |
| Direct edit brief ("make text bigger") | 0.7 | +0.1 per repeat |
| Inferred from conversation | 0.4 | +0.1 per repeat |
| Section reaction ("this hits" / "not quite") | 0.3 | +0.1 per repeat |
| Inferred from approval pattern | 0.3 | +0.05 per occurrence |

**Injection threshold:** Only preferences with confidence >= 0.5 get injected into prompts.

### 3.3 Feedback Collection Points

**Where feedback signals are captured:**

| Signal Type | Source File | Trigger Event |
|------------|------------|---------------|
| `edit_brief` | `src/lib/scout/tools.ts` → `submit_edit_brief` handler | Scout submits an edit brief |
| `narrative_revision` | `src/app/api/projects/[id]/narrative/review/route.ts` | Narrative rejected with revision notes |
| `narrative_approval` | Same as above | Narrative approved |
| `pitchapp_approval` | `src/app/api/projects/[id]/approve/route.ts` | PitchApp approved for deploy |
| `scout_feedback` | `src/app/api/scout/route.ts` | Explicit feedback in Scout chat |
| `scout_probe_response` | `src/app/api/scout/route.ts` | Response to post-milestone probing |
| `section_change` | `src/lib/scout/tools.ts` | Edit brief that changes a section type |
| `animation_request` | `src/lib/scout/tools.ts` | Edit brief with `change_type: "animation"` |
| `style_correction` | `src/lib/scout/tools.ts` | Edit brief correcting copy/design |

**Implementation approach:**
- Add `extractPreferencesFromBrief(userId, changes)` call after `submit_edit_brief` tool execution in `src/lib/scout/tools.ts`
- **Owner-only rule:** Only extract preferences when `sender_id` matches project owner. Editor edit briefs are project-scoped overrides, not preference signals.
- Insert `feedback_signals` using admin client (service role) to bypass RLS
- Keep inserts non-blocking (catch and log on failure — never block the user action)

### 3.4 Scout Proactive Preference Probing

**New behavior:** After key milestones, Scout proactively asks users about their preferences. This is invisible learning disguised as natural conversation.

**Trigger points:**
- After narrative approval: "Nice — the narrative's locked. Anything you'd want different in tone or structure next time?"
- After PitchApp approval: "This one's shipping. Anything you'd change about the visual style or animations for future builds?"
- After 3rd project with same user: "I'm starting to learn your style. Want me to always lean toward [inferred preference]?"

**Implementation:**
- Add probe triggers in `buildSystemPrompt()` in `src/lib/scout/context.ts`
- When project status changes to `narrative_approved` or `approved`, inject a probe instruction into Scout's next turn
- Scout responses to probes are captured as `scout_probe_response` feedback signals at 0.85 confidence

**Files to change:**
- `apps/portal/src/lib/scout/context.ts` — add milestone-aware probe instructions
- `apps/portal/src/app/api/scout/route.ts` — capture probe responses as feedback signals

### 3.5 Pipeline Injection Points

**Where learned preferences get injected into Claude prompts:**

#### A. Pipeline preference injection

New helper: `scripts/cron/lib/preferences.mjs`

```javascript
/**
 * Build a preference context block for injection into pipeline prompts.
 * Only queries preferences for the project owner (not collaborators).
 * @param {string} userId - The project owner's user ID
 * @param {string} department - 'creative', 'strategy', or 'intelligence'
 * @param {string} stage - Pipeline stage (determines which categories to include)
 * @returns {string} Formatted preference block or empty string
 */
async function buildPreferenceBlock(userId, department, stage) {
  // Query user_preferences for this user + department where confidence >= 0.5
  // Filter categories based on stage (see injection map below)
  // Format as structured text block
  // Return empty string if no preferences found
}
```

**Injection map — which preferences matter at which stage:**

| Stage | Categories Injected |
|-------|-------------------|
| `auto-narrative` | `copy_style`, `narrative` |
| `auto-build` (copy) | `copy_style`, `typography`, `layout` |
| `auto-build-html` | `typography`, `color`, `layout`, `animation` |
| `auto-research` | `research` |
| `auto-polish` | `copy_style`, `research` |
| `auto-review` | All (reviewers check adherence) |

**Token cap enforcement (all injection points):**

```javascript
const MAX_PREFERENCE_TOKENS = 500;  // preferences are short
const MAX_LEARNINGS_TOKENS = 1000;  // top 10 learnings
const MAX_UPSTREAM_TOKENS = 4000;   // upstream context from promotion

function enforceTokenCap(text, maxTokens) {
  const maxChars = maxTokens * 4; // rough estimate: 1 token ≈ 4 chars
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[... truncated to fit token budget]";
}
```

All three injection types (preferences, learnings, upstream context) are capped independently. Total additional context budget: ~5,500 tokens max across all injections.

#### B. Scout system prompt injection

Add to `buildSystemPrompt()` in `src/lib/scout/context.ts`:

```typescript
// User preferences (between project context and status guidance)
const prefsBlock = await buildUserPreferencesBlock(userId, project.department);
if (prefsBlock) {
  parts.push(`<user_preferences>
${enforceTokenCap(prefsBlock, 500)}
</user_preferences>`);
}
```

#### C. System learnings injection

New helper: `scripts/cron/lib/learnings.mjs`

```javascript
/**
 * Build a system learnings context block for pipeline prompt injection.
 * @param {string} department
 * @param {string} stage
 * @param {object} projectContext - { company_type, target_audience, etc. }
 * @returns {string} Formatted learnings block (top 10 most relevant)
 */
async function buildLearningsBlock(department, stage, projectContext) {
  // Query system_learnings: status = 'active', confidence >= 0.5, decay_weight >= 0.3
  // Sort by: (confidence * decay_weight * (success_count / GREATEST(usage_count, 1))) DESC
  // Limit to top 10
  // enforceTokenCap(result, 1000)
}
```

### 3.6 Learning Extraction Pipeline

Two mechanisms for discovering learnings:

#### A. Post-completion analysis (per project)

New pipeline stage: `auto-learn` (runs after `auto-push`)

After a project reaches `live` status:
1. Read project history: narrative, edit briefs, review scores, confidence scores
2. Ask Claude to extract patterns (section types, narrative arc, copy patterns, revision patterns)
3. Upsert into `system_learnings`, incrementing `usage_count` and `success_count`
4. Create version via auto-versioning trigger

#### B. Periodic aggregation (weekly)

New PM2 cron: `scripts/cron/learning-aggregator.mjs`

1. Reviews all projects completed in the past week
2. Cross-references patterns across projects
3. Identifies new learnings or validates existing ones
4. Runs decay logic on stale learnings

#### C. Idempotent processing (Code Review requirement)

The learning extractor MUST be idempotent — a crash between processing and marking should not produce duplicate learnings on retry. Use transactional process-and-mark:

```javascript
async function processSignalBatch(signals) {
  for (const signal of signals) {
    // Single transaction: extract + upsert + mark processed
    const { error } = await adminClient.rpc('process_feedback_signal', {
      p_signal_id: signal.id,
      p_user_id: signal.user_id,
      // ... extracted preference data
    });

    if (error) {
      console.error(`Failed to process signal ${signal.id}:`, error);
      // Don't mark as processed — will retry on next run
      continue;
    }
  }
}
```

Alternatively, if RPC is too complex, use a simple SELECT ... FOR UPDATE SKIP LOCKED pattern:

```sql
-- In the extractor worker:
BEGIN;
  SELECT * FROM feedback_signals
  WHERE processed = false
  ORDER BY created_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED;

  -- Process each signal, upsert preferences/learnings...

  UPDATE feedback_signals SET processed = true, processed_at = now()
  WHERE id IN (...processed_ids...);
COMMIT;
```

This ensures no signal is processed twice even if multiple extractor instances run concurrently.

### 3.7 Decay & Compounding Logic

Preferences and learnings decay over time if not reinforced:

**User preferences:**
- Confidence decreases by 5% per month if no new data points
- Signal strength = `log2(data_points + 1) / 10` (diminishing returns)

**System learnings:**
- `decay_weight *= 0.95` weekly for learnings not validated in 30 days
- Floor: `decay_weight` never goes below 0.1 (learnings are deprioritized, never forgotten)
- Active use resets decay: `last_validated_at = now()`, `decay_weight = 1.0`
- Admin can pin learnings via `status = 'admin_override'`

```sql
-- Run weekly by learning-aggregator cron
UPDATE system_learnings
SET
  decay_weight = GREATEST(0.1, decay_weight * 0.95),
  updated_at = now()
WHERE
  status = 'active'
  AND last_validated_at < now() - INTERVAL '30 days';
```

### 3.8 Admin Visualization: Spatial Constellation

**Route: `/admin/learnings`**

**Design ruling:** No CRUD table. System learnings rendered as a spatial constellation.

**Constellation visualization:**
- Each learning is a **node** — sized by confidence, colored by department
  - Creative: amber (#d4863c)
  - Strategy: sage (#8B9A6B)
  - Intelligence: blue (#4D8EFF)
  - Global: white
- **Connections** between learnings that share `source_projects` — thicker lines = more shared evidence
- **Gravity:** High-confidence, high-usage learnings drift toward center; decaying learnings drift to edges
- **Glow:** Active learnings pulse subtly; `admin_override` learnings have a steady bright ring
- **Hover:** Node expands to show title, confidence, usage count, last validated date
- **Click:** Opens detail panel (version history, source projects, admin notes, archive/pin actions)
- **Filters:** Department toggle (show/hide), confidence threshold slider, category chips

**Stats (ambient, not tabular):**
- Total active learnings count (large number, top-left)
- Learnings discovered this week (subtle counter)
- Department breakdown as colored bars in the constellation legend

**Components:**
- `apps/portal/src/components/admin/LearningConstellation.tsx` — main canvas (d3-force for gravity simulation)
- `apps/portal/src/components/admin/LearningNode.tsx` — individual node render
- `apps/portal/src/components/admin/LearningDetail.tsx` — detail panel on click
- `apps/portal/src/app/admin/learnings/page.tsx` — route page

---

## Build Order & Dependencies

```
Phase 1 (can run in parallel):
├── 1.1 Upload limit bumps (standalone, 1 hour)
├── 1.2 Context forwarding via DB — promote + pipeline (3-4 hours)
│   └── Migration: 20260216_source_context.sql (ALTER TABLE projects ADD source_context JSONB)
├── 1.3 Signals schema fix — published_at, source_url, hackernews CHECK (30 min)
└── 1.4 HackerNews adapter (2 hours, depends on 1.3)

Phase 2 (after Phase 1):
├── 2.1 Cross-project peripheral vision (3-4 days)
│   ├── Deepened triptych hover reveals with provenance
│   ├── Cmd+K wormhole (recents, connection indicators, transition flash)
│   └── CrossDeptStrip on department pages
└── 2.2 Intelligence API config & Reddit risk mitigation (2-3 days)
    ├── Reddit credential verification + pre-approval application
    ├── Replace snoowrap with direct fetch
    ├── YouTube API key setup
    ├── RSS feed list expansion
    └── PM2 config verification

Phase 3 (after Phase 2, sequential):
├── 3.1 Database migration (smart_memory tables + triggers) — run first
├── 3.2 Preference categories + confidence scoring
├── 3.3 Feedback collection points (add signal capture at 9 touchpoints)
├── 3.4 Scout proactive preference probing
├── 3.5 Pipeline injection points (preferences + system learnings + token caps)
├── 3.6 Learning extraction pipeline (auto-learn stage + aggregator cron, idempotent)
├── 3.7 Decay logic (add to learning aggregator)
└── 3.8 Admin constellation visualization
```

**Critical path:** Phase 1 → Phase 2 → Phase 3 (sequential by design)

Phase 1 items 1.1–1.3 can all run in parallel. 1.4 depends on 1.3.
Phase 2 items can run in parallel.
Phase 3 must be sequential: migration → collection → extraction → injection → visualization.

---

## Database Migration Summary

| Migration | Tables/Changes | Dependencies |
|-----------|---------------|-------------|
| `20260216_source_context.sql` | ALTER TABLE projects ADD source_context JSONB | None |
| `20260216_signals_schema_fix.sql` | Add `published_at`, `source_url` to signals; expand CHECK for `'hackernews'` | None |
| `20260216_smart_memory.sql` | `user_preferences`, `system_learnings`, `learning_versions`, `feedback_signals`, auto-version trigger | `20260214_collaboration.sql` |

All migrations include rollback SQL (commented at bottom of each file).

---

## API Routes (New)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/preferences` | Current user's preferences (all departments) |
| GET | `/api/preferences?department=creative` | Preferences for specific department |
| DELETE | `/api/preferences/[id]` | Delete a specific preference |
| POST | `/api/preferences/extract` | Trigger preference extraction (service role) |
| GET | `/api/user/my-projects` | User's projects across all departments (for TriptychHome) |
| GET | `/api/admin/learnings` | All learnings (filterable) |
| GET | `/api/admin/learnings/[id]` | Single learning + version history |
| PATCH | `/api/admin/learnings/[id]` | Admin override, archive, annotate |
| GET | `/api/admin/learnings/stats` | Aggregate stats |
| POST | `/api/admin/learnings/decay` | Manually trigger decay cycle |
| POST | `/api/internal/learnings/discover` | Pipeline: post-completion learning extraction |
| POST | `/api/internal/preferences/infer` | Pipeline: infer preferences from project |

**Removed from Phase 1:**
- ~~`PUT /api/preferences`~~ — No explicit settings form. Users teach Spark through Scout.
- ~~`/settings/preferences`~~ — Killed. Implicit learning must prove itself first.

---

## Resolved Decisions

| # | Decision | Ruling | Rationale |
|---|----------|--------|-----------|
| 1 | Preference model: flat columns vs key/value | **Key/value (JSONB)** per-department, per-category | Unlimited dimensions without schema changes; per-preference confidence scoring; department scoping prevents cross-contamination |
| 2 | Explicit settings form | **Cut from Phase 1** | Let implicit learning build trust. Users tell Scout directly if needed (0.9 confidence). |
| 3 | Mission Context Rail vs triptych peripheral vision | **Triptych peripheral vision wins** | The 3-panel triptych already maps to departments. A separate rail widget is an extra navigation target — against the "peripheral vision, not dashboard" principle. |
| 4 | Cross-project awareness UI | **No "My Work" page.** Deepened triptych hovers + Cmd+K wormhole + CrossDeptStrip | Peripheral vision, not new surfaces (frontend-dev ruling) |
| 5 | Admin learnings visualization | **Spatial constellation** | Alive, not tabular. Nodes, connections, gravity, glow — department-colored, confidence-sized. |
| 6 | Project owner vs collaborator preferences | **Owner wins** | PitchApp is the owner's story. Only owner's Scout interactions update preference profile. Editor edit briefs are project-scoped overrides, not preference signals. |
| 7 | Context forwarding mechanism | **DB-only (no filesystem)** | Promote runs in Vercel serverless — no persistent filesystem. Use `cross_department_refs.metadata` JSONB + `projects.source_context` JSONB. |
| 8 | Upstream token budget | **4000-token hard cap, applied at promotion time** | Systems Engineer measured 6K-11K tokens raw (<6% overhead). Cap to 4000 to be safe. Stored truncated. |
| 9 | Reddit adapter risk | **Replace snoowrap, submit pre-approval** | snoowrap 5yr unmaintained; Reddit killed self-service API keys Nov 2025 |
| 10 | X/Twitter in Phase 1 | **Skip** | $200/mo minimum, 10K tweets/mo cap, restrictive TOS. Evaluate in Phase 2. |
| 11 | Learning versioning | **Auto-version trigger** on system_learnings | Every content/confidence change creates a version snapshot automatically |
| 12 | Cold start for new users | **Start blank** | System learnings provide baseline intelligence. No inherited defaults needed. |
| 13 | Learning seeding | **Seed from existing builds** | Manually extract learnings from ONIN, Shareability, Bonfire to bootstrap system |
| 14 | Learning extractor idempotency | **Transactional process+mark** | SELECT FOR UPDATE SKIP LOCKED pattern ensures no double-processing on crash/retry |
| 15 | feedback_signals.user_id FK | **ON DELETE CASCADE** | Prevents FK violations when users are deleted |

---

## Code Review Items Addressed

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| 1 | **BLOCKER:** Filesystem writes from serverless | **Fixed** | Section 1.2 rewritten to use `cross_department_refs.metadata` + `projects.source_context` JSONB. No filesystem writes. |
| 2 | **BLOCKER:** `feedback_signals.user_id` missing ON DELETE CASCADE | **Fixed** | Added to schema in 3.1 |
| 3 | Switch to JSONB preferences | **Addressed** | Using per-row key/value with JSONB values (backend dev design). Trade-off documented in 3.1 — chosen for per-preference confidence scoring over monolithic JSONB column. |
| 4 | Remove MyWorkSidebar | **Done** | Replaced by triptych hovers + Cmd+K wormhole + CrossDeptStrip (section 2.1) |
| 5 | Redundant idx_up_user index | **N/A** | Rev 2 already uses `idx_user_prefs_user_dept(user_id, department)` — not redundant vs UNIQUE on `(user_id, dept, category, key)` since it's a useful prefix index |
| 6 | Missing index on feedback_signals.project_id | **Fixed** | Added `idx_fs_project` in 3.1 |
| 7 | Token cap enforcement | **Fixed** | Added `enforceTokenCap()` function in 3.5 with per-type budgets (500/1000/4000 tokens) |
| 8 | Learning extractor idempotency | **Fixed** | Section 3.6C specifies transactional process+mark with SELECT FOR UPDATE SKIP LOCKED |
| 9 | Rollback SQL in migration | **Fixed** | Rollback SQL added as comments at bottom of each migration in 1.3 and 3.1 |
| 10 | Polymorphic FK on project_learnings.source_id | **N/A** | `project_learnings` table was removed in Rev 2. System learnings use `source_projects UUID[]` array instead — no polymorphic FK needed. |
| 11 | Constellation viz for admin | **Done** | Section 3.8 specifies full constellation design |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Reddit API access revoked | HIGH | Submit pre-approval now; prepare RSS-heavy fallback; replace snoowrap with direct fetch |
| snoowrap deprecated OAuth flow | HIGH | Replace with direct fetch + token management before Reddit phases out password grant |
| Smart Memory hallucinating preferences | Medium | Require confidence >= 0.5 for injection; owner-only extraction; admin override |
| Upload size increase causes storage costs | Low | Monitor Supabase storage usage; add per-project soft cap warning |
| Context forwarding bloats prompts | Medium | Hard cap at 4000 tokens applied at promotion time; stored truncated in source_context |
| Spatial constellation performance | Medium | Use d3-force; limit to top 200 nodes; lazy-load detail; canvas rendering |
| Learning extractor crash mid-batch | Low | Transactional process+mark pattern (3.6C) ensures idempotent retry |
| Learning extractor CPU cost | Low | 30-min interval; batch processing; limit to 100 signals per run |

---

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Upload limits | Files rejected for size | < 5% of upload attempts |
| Context forwarding | Narrative confidence on promoted projects | +15% vs. non-promoted |
| Cross-project awareness | User locates related project | < 3 seconds (Cmd+K or hover) |
| Smart Memory | Revision cycles per project | -20% after 5+ projects per user |
| Signal ingestion | Signals ingested per day | > 500 (YouTube + Reddit + RSS + HN) |
| Scout probing | Preference data points per user (after 3 projects) | > 10 |
| Learning constellation | Active system learnings | > 50 within 3 months |

---

## Open Questions

1. **Learning extraction model:** Should we use Claude Haiku to extract learnings from edit briefs (more accurate, adds cost), or use heuristic pattern matching (free, less nuanced)?
2. **Constellation tech choice:** d3-force (pragmatic, <200 nodes) vs WebGL (scales better)? Recommend d3-force for Phase 1.
3. **Learning seeding scope:** Which existing builds to seed from? ONIN (investor deck), Shareability (studio page), Bonfire (product page) cover 3 different PitchApp types — good coverage.
4. **Reddit fallback timeline:** If pre-approval takes >2 weeks, should we deprioritize Reddit and lean harder on HN + expanded RSS?
