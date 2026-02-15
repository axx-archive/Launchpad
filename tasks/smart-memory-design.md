# Company Intelligence / Smart Memory System — Design Document

**Author:** Backend Developer
**Date:** 2026-02-15
**Status:** Draft — updated with creative direction rulings

---

## Overview

A two-tier learning system that makes Spark smarter over time:

- **Tier 1 — User Preferences:** Per-user adaptability learned from feedback. User A's preference for bigger text doesn't affect User B.
- **Tier 2 — System Learnings:** Collective intelligence across all builds. New section patterns discovered, effective narrative arcs, research methodology improvements — all compound over time.

---

## Current State (What Exists)

### user_profiles table
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Lightweight — just identity. No preferences or learning data.

### Pipeline Prompt Assembly
Prompts are constructed inline in `scripts/cron/pipeline-executor.mjs`:
- `NARRATIVE_SYSTEM_PROMPT` (line ~2923) — narrative strategist instructions
- `BUILD_AGENT_SYSTEM` (line ~1245) — PitchApp developer instructions with brand DNA injection
- `BUILD_SYSTEM_PROMPT` (line ~3419) — copywriter instructions
- `RESEARCH_SYSTEM_PROMPT` (line ~2757) — market research instructions
- `POLISH_SYSTEM` (line ~4159) — McKinsey-caliber editorial rewrite

**Existing context injection pattern:** Brand DNA (`project.brand_analysis`) is injected into `BUILD_AGENT_SYSTEM` as a `## Brand DNA` section. This is the template for preference injection.

### Scout System
Scout prompts are assembled in `src/lib/scout/context.ts` via `buildSystemPrompt()`. Context is layered:
1. Identity & personality
2. Project context (company, status, documents)
3. Audience coaching
4. Conversation summary
5. Status guidance
6. PitchApp manifest
7. Edit brief protocol

Scout already has `submit_edit_brief` tool — structured change requests with `change_type`, `section_id`, `priority`. **This is the natural feedback collection point.**

### Admin Routes
- `/admin` — all missions overview
- `/admin/automation` — pipeline status, costs, jobs
- `/admin/project/[id]` — per-project admin detail
- `/api/admin/automation` — GET pipeline stats
- `/api/admin/costs` — cost tracking
- `/api/admin/intelligence` — Intelligence panel

Admin follows a pattern: API route returns data, client component renders it. Admin-only via `isAdmin()` check.

---

## Tier 1 — User Preferences

### Data Model

**Option: Dedicated `user_preferences` table** (recommended over extending `user_profiles` JSONB, because preferences are queried separately and have their own lifecycle)

```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('creative', 'strategy', 'intelligence')),
  category TEXT NOT NULL,       -- e.g. 'typography', 'color', 'copy_style', 'layout', 'animation'
  preference_key TEXT NOT NULL,  -- e.g. 'font_size', 'accent_color', 'copy_tone'
  preference_value JSONB NOT NULL, -- flexible: string, number, array, object
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('inferred', 'scout_feedback', 'edit_brief', 'section_reaction')),
  source_ref JSONB,             -- { project_id, scout_message_id, edit_brief_id } for provenance
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, department, category, preference_key)
);

CREATE INDEX idx_user_prefs_user_dept ON user_preferences(user_id, department);
CREATE INDEX idx_user_prefs_category ON user_preferences(category);
```

**RLS:**
```sql
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users see their own preferences
CREATE POLICY "own_prefs_select" ON user_preferences
  FOR SELECT USING (user_id = auth.uid());

-- Users can update their own
CREATE POLICY "own_prefs_update" ON user_preferences
  FOR UPDATE USING (user_id = auth.uid());

-- Service role inserts (from pipeline/Scout) bypass RLS
-- Users can insert their own via explicit settings page
CREATE POLICY "own_prefs_insert" ON user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins see all (for admin panel)
CREATE POLICY "admin_prefs_select" ON user_preferences
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE email IN (/* admin emails */))
  );
```

### Preference Categories

| Category | Keys | Example Values | Source |
|----------|------|----------------|--------|
| `typography` | `font_size_preference`, `heading_style` | `"larger"`, `"serif"` | inferred from edit briefs |
| `color` | `preferred_palette`, `accent_preference` | `"warm"`, `"#c8a44e"` | explicit or inferred |
| `copy_style` | `tone`, `length_preference`, `formality` | `"confident"`, `"concise"`, `"casual"` | inferred from Scout feedback |
| `layout` | `section_density`, `image_preference` | `"spacious"`, `"minimal_images"` | inferred from edit patterns |
| `animation` | `motion_preference`, `interaction_level` | `"subtle"`, `"high"` | inferred from edit briefs |
| `narrative` | `preferred_arc`, `proof_style` | `"evolution"`, `"data_heavy"` | inferred from approvals |
| `research` | `depth_preference`, `format` | `"comprehensive"`, `"executive_summary"` | inferred from Strategy feedback |

### Feedback Collection Points

#### 1. Scout Edit Briefs (primary — automatic)
When a user submits edit briefs via Scout, extract preference signals:

```
User: "Make the text bigger across all sections"
→ Scout submits edit brief with change_type: "design", description: "increase text size"
→ After brief submission, run preference extraction:
   category: "typography", key: "font_size_preference", value: "larger", source: "edit_brief"
```

**Implementation:** Add a `extractPreferences()` call after `submit_edit_brief` tool execution in `src/lib/scout/tools.ts`. This function:
1. Analyzes the edit brief changes
2. Maps change patterns to preference categories
3. Upserts into `user_preferences` with confidence based on repetition

#### 2. Scout Conversation Analysis (secondary — batch)
After a Scout conversation ends (or reaches 10+ messages), run a lightweight Claude Haiku call to extract implicit preferences:

```
System: "Analyze this conversation and extract user preferences about design, copy, and layout."
User: [conversation transcript]
→ Returns structured preferences with confidence scores
```

**Implementation:** New API route `POST /api/preferences/extract` called by pipeline after project completion.

#### ~~3. Explicit User Settings~~ — REMOVED (Phase 1)
**Decision:** Cut from Phase 1. Shipping a settings form alongside implicit learning risks users finding the form first and perceiving Smart Memory as "just a preferences panel." Let invisible learning build trust first. If users want to declare preferences directly, they tell Scout — extraction at 0.9 confidence. No form needed.

#### 4. Approval/Rejection Signals
When a user approves or rejects a narrative:
- **Approve** → Boost confidence of preferences that match the approved output
- **Reject + feedback** → Extract new preferences from rejection reason

### Confidence Scoring

Preferences have a `confidence` score (0.0 → 1.0):

| Signal | Starting Confidence | Boost per Repetition |
|--------|-------------------|---------------------|
| Direct Scout declaration ("I prefer larger text") | 0.9 | — (already high) |
| Direct edit brief ("make text bigger") | 0.7 | +0.1 per repeat |
| Inferred from conversation | 0.4 | +0.1 per repeat |
| Section reaction ("this hits" / "not quite") | 0.3 | +0.1 per repeat |
| Inferred from approval pattern | 0.3 | +0.05 per occurrence |

**Injection threshold:** Only preferences with confidence >= 0.5 get injected into prompts.

### Pipeline Injection

Preferences are injected as a `## User Preferences` block in system prompts. The injection point follows the existing Brand DNA pattern.

**New helper function** in `scripts/cron/lib/preferences.mjs`:

```javascript
/**
 * Build a preference context block for injection into pipeline prompts.
 * @param {string} userId - The project owner's user ID
 * @param {string} department - 'creative', 'strategy', or 'intelligence'
 * @param {string} stage - Pipeline stage (determines which categories to include)
 * @returns {string} Formatted preference block or empty string
 */
async function buildPreferenceBlock(userId, department, stage) {
  // Query user_preferences for this user + department where confidence >= 0.5
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

**Example injected block:**

```
## User Preferences (learned from previous projects)
These are known preferences for this client. Respect them unless they conflict with the content:
- Typography: prefers larger text sizes, serif display fonts
- Copy style: concise, confident tone. Avoids formal language.
- Layout: spacious sections, minimal image use
- Animation: prefers subtle motion, no heavy parallax
```

### Scout Injection

Preferences are also injected into Scout's system prompt via `buildSystemPrompt()` in `src/lib/scout/context.ts`. Add a new section between project context and status guidance:

```typescript
// 2c. User preferences
const prefsBlock = await buildUserPreferencesBlock(userId, project.department);
if (prefsBlock) {
  parts.push(`<user_preferences>
${prefsBlock}
</user_preferences>`);
}
```

This lets Scout reference user preferences when making suggestions ("I know you prefer concise copy, so...").

---

## Tier 2 — System Learnings

### Data Model

```sql
CREATE TABLE system_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL CHECK (department IN ('creative', 'strategy', 'intelligence', 'global')),
  category TEXT NOT NULL,       -- e.g. 'section_pattern', 'narrative_arc', 'research_method', 'signal_source'
  learning_key TEXT NOT NULL,   -- unique identifier within category
  title TEXT NOT NULL,          -- human-readable title
  content JSONB NOT NULL,       -- the learning itself (flexible structure)
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,  -- times it led to approval / positive outcome
  failure_count INTEGER NOT NULL DEFAULT 0,  -- times it led to rejection / negative outcome
  source_projects UUID[],      -- array of project IDs that contributed
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  decay_weight REAL NOT NULL DEFAULT 1.0 CHECK (decay_weight >= 0 AND decay_weight <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'admin_override')),
  admin_notes TEXT,            -- admin can annotate
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (department, category, learning_key)
);

CREATE INDEX idx_learnings_dept_cat ON system_learnings(department, category);
CREATE INDEX idx_learnings_status ON system_learnings(status) WHERE status = 'active';
CREATE INDEX idx_learnings_confidence ON system_learnings(confidence DESC);
```

**RLS:**
```sql
ALTER TABLE system_learnings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active learnings
CREATE POLICY "authenticated_read_learnings" ON system_learnings
  FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'active');

-- Only admin can modify (via service role or admin check)
-- Pipeline writes via service role (bypasses RLS)
```

### Learning Version History

```sql
CREATE TABLE learning_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES system_learnings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,       -- snapshot of content at this version
  confidence REAL NOT NULL,
  change_reason TEXT,           -- why this version was created
  changed_by TEXT,              -- 'pipeline', 'admin', 'decay'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (learning_id, version)
);
```

### Learning Categories by Department

#### Creative Department

| Category | Example Learning | Content Structure |
|----------|-----------------|-------------------|
| `section_pattern` | "Split Image+Text works best for differentiator sections" | `{ pattern: "split_image_text", best_for: ["differentiator", "comparison"], success_rate: 0.85 }` |
| `narrative_arc` | "Evolution Arc outperforms Problem-Solution for tech companies" | `{ arc_type: "evolution", effective_for: ["tech", "saas"], avg_confidence_score: 8.2 }` |
| `copy_pattern` | "One-line hero taglines convert better than multi-line" | `{ pattern: "single_line_hero", metric: "approval_rate", value: 0.92 }` |
| `animation_pattern` | "Character decode on hero titles increases engagement" | `{ animation: "character_decode", placement: "hero_title", engagement_lift: "+15%" }` |
| `build_technique` | "Scoping selectors prevents FOUC on multi-section builds" | `{ technique: "scoped_selectors", prevents: "fouc", reliability: "high" }` |

#### Strategy Department

| Category | Example Learning | Content Structure |
|----------|-----------------|-------------------|
| `research_method` | "2-turn research loop with web_search produces highest rigor" | `{ method: "2_turn_loop", avg_rigor_score: 8.5, tool: "web_search" }` |
| `polish_technique` | "McKinsey-caliber rewrite improves clarity by 2+ points" | `{ technique: "mckinsey_rewrite", dimension: "clarity", avg_improvement: 2.3 }` |
| `source_quality` | "Industry reports from Gartner/McKinsey get highest sourcing scores" | `{ sources: ["gartner", "mckinsey"], avg_sourcing_score: 9.1 }` |

#### Intelligence Department

| Category | Example Learning | Content Structure |
|----------|-----------------|-------------------|
| `signal_source` | "Reddit r/startups has highest signal-to-noise for emerging trends" | `{ source: "reddit", subreddit: "startups", signal_quality: 0.82 }` |
| `cluster_pattern` | "Clusters with 3+ sources are 2x more likely to reach 'peaking'" | `{ pattern: "multi_source_cluster", threshold: 3, peaking_likelihood: 0.67 }` |
| `velocity_insight` | "Velocity > 80th percentile with > 7d age indicates sustained trend" | `{ velocity_threshold: 80, age_days: 7, lifecycle: "sustained" }` |

### Learning Discovery Pipeline

Learnings are discovered through two mechanisms:

#### 1. Post-Completion Analysis (per project)
After a project reaches `live` status, trigger a learning extraction job:

```
Pipeline stage: auto-learn (new stage, runs after auto-push)
```

This stage:
1. Reads the project's full history: narrative (approved), edit briefs, review scores, confidence scores
2. Asks Claude to extract patterns:
   - What section types worked well?
   - What narrative arc was used and how did it score?
   - What copy patterns emerged?
   - What was revised (indicating initial approach was wrong)?
3. Upserts into `system_learnings`, incrementing `usage_count` and `success_count`

#### 2. Periodic Aggregation (weekly)
A new PM2 cron job `learning-aggregator.mjs`:
1. Reviews all projects completed in the past week
2. Cross-references patterns across projects
3. Identifies new learnings or validates existing ones
4. Runs decay logic on old learnings

### Decay Logic

Learnings lose weight over time if not validated:

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

- **Active use resets decay:** When a learning is used and the project succeeds → `last_validated_at = now()`, `decay_weight = 1.0`
- **Floor:** `decay_weight` never goes below 0.1 (learnings are never fully forgotten, just deprioritized)
- **Admin override:** Admin can set `status = 'admin_override'` to pin a learning at full weight

### Pipeline Injection (System Learnings)

New helper in `scripts/cron/lib/learnings.mjs`:

```javascript
/**
 * Build a system learnings context block for pipeline prompt injection.
 * @param {string} department - Department
 * @param {string} stage - Pipeline stage
 * @param {object} projectContext - { company_type, target_audience, etc. }
 * @returns {string} Formatted learnings block
 */
async function buildLearningsBlock(department, stage, projectContext) {
  // Query system_learnings for relevant department + categories
  // Filter by: status = 'active', confidence >= 0.5, decay_weight >= 0.3
  // Sort by: (confidence * decay_weight * success_rate) DESC
  // Limit to top 10 most relevant
  // Format as structured context
}
```

**Example injected block:**

```
## System Intelligence (patterns from previous successful builds)
These patterns have been validated across multiple projects:

- Section patterns: Split Image+Text consistently works best for differentiator sections (85% approval rate, 12 projects)
- Narrative: Evolution Arc outperforms Problem-Solution for tech companies (avg confidence 8.2/10)
- Copy: Single-line hero taglines have 92% approval rate vs 71% for multi-line
- Animation: Character decode on hero titles increases section engagement by ~15%

Apply these patterns where appropriate. They're guidelines, not rules — override when the content demands it.
```

---

## API Routes

### User Preferences

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/preferences` | Get current user's preferences (all departments) |
| GET | `/api/preferences?department=creative` | Get preferences for a specific department |
| PUT | `/api/preferences` | Upsert explicit preferences |
| DELETE | `/api/preferences/[id]` | Delete a specific preference |
| POST | `/api/preferences/extract` | Trigger preference extraction from project history (service role) |

### System Learnings (admin)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/learnings` | List all learnings (filterable by department, category, status) |
| GET | `/api/admin/learnings/[id]` | Single learning detail with version history |
| PATCH | `/api/admin/learnings/[id]` | Update learning (admin override, archive, annotate) |
| DELETE | `/api/admin/learnings/[id]` | Soft-delete (archive) a learning |
| GET | `/api/admin/learnings/stats` | Aggregate stats: total learnings, by department, by confidence tier |
| POST | `/api/admin/learnings/decay` | Manually trigger decay cycle |

### Internal (service role only)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/internal/learnings/discover` | Called by pipeline after project completion |
| POST | `/api/internal/preferences/infer` | Called by pipeline to infer preferences from project |

---

## Admin UI

### Learnings Admin Page (`/admin/learnings`)

**Header:** "system intelligence" — total learnings, by department breakdown

**Filters:** Department (Creative/Strategy/Intelligence), Category, Status (active/archived/override), Confidence range

**Table view:**
| Title | Department | Category | Confidence | Usage | Success Rate | Decay | Status | Actions |
|-------|-----------|----------|------------|-------|-------------|-------|--------|---------|

**Actions per learning:**
- View detail + version history
- Archive (soft-delete)
- Pin (admin override — prevents decay)
- Edit notes
- Adjust confidence manually

**Stats panel:**
- Total active learnings by department
- Learnings discovered this week/month
- Average confidence by department
- Most-used learnings (top 5)

### User Preferences Admin View (`/admin/preferences`)

**Search by user email/name**

**Table view:**
| User | Department | Category | Key | Value | Confidence | Source | Last Updated |

Admin can:
- View all users' preferences
- Delete individual preferences
- Export preferences for a user

---

## Feedback Collection via Scout (Detailed Flow)

### Edit Brief → Preference Extraction

```
1. User tells Scout: "I want the text bigger and the tone more casual"
2. Scout uses submit_edit_brief tool:
   changes: [
     { section_id: "global", change_type: "design", description: "increase text size" },
     { section_id: "global", change_type: "copy", description: "make tone more casual" }
   ]
3. After tool execution, in tools.ts handleToolCall("submit_edit_brief"):
   → Call extractPreferencesFromBrief(userId, changes)
   → This upserts:
     - (user_id, creative, typography, font_size_preference) = "larger", confidence: 0.7
     - (user_id, creative, copy_style, tone) = "casual", confidence: 0.7
4. Next time this user starts a project, pipeline reads preferences
   → Injects: "User prefers larger text sizes, casual copy tone"
```

### Narrative Approval → Preference Signal

```
1. User approves narrative (clicking approve button)
2. POST /api/projects/[id]/narrative/review with action: "approve"
3. After approval, trigger:
   → Read the narrative's structure (arc type, section types)
   → Upsert preference: (user_id, creative, narrative, preferred_arc) = "evolution"
   → Confidence: 0.3 (low — single data point)
4. After 3 approvals of evolution-arc narratives:
   → Confidence: 0.3 + 0.05 + 0.05 = 0.4 (still below injection threshold)
5. After 5 approvals:
   → Confidence: 0.5 (now injected into prompts)
```

---

## Migration Plan

### Migration: `20260215_smart_memory.sql`

```sql
BEGIN;

-- Tier 1: User Preferences
CREATE TABLE user_preferences ( ... );  -- as defined above
-- Indexes, RLS

-- Tier 2: System Learnings
CREATE TABLE system_learnings ( ... );  -- as defined above
CREATE TABLE learning_versions ( ... );
-- Indexes, RLS

-- Trigger: auto-version on learning update
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

COMMIT;
```

---

## Implementation Order

1. **Migration** — Create tables, indexes, RLS, triggers
2. **Preference extraction from edit briefs** — Modify `submit_edit_brief` tool handler in `src/lib/scout/tools.ts`. Must respect owner-only rule: only extract preferences when `sender_id` matches project owner.
3. **`buildPreferenceBlock()` helper** — New file `scripts/cron/lib/preferences.mjs`. Queries owner's preferences only.
4. **Inject preferences into pipeline prompts** — Modify existing prompt assembly in `pipeline-executor.mjs`
5. **Inject preferences into Scout** — Modify `buildSystemPrompt()` in `src/lib/scout/context.ts`
6. **User preferences API routes** — `/api/preferences` (read-only for users, no settings form in Phase 1)
7. **System learnings tables + API** — `/api/admin/learnings`
8. **`auto-learn` pipeline stage** — New stage after `auto-push`
9. **`learning-aggregator.mjs`** — Weekly PM2 cron
10. **Admin UI** — `/admin/learnings` and `/admin/preferences` pages

---

## Resolved Decisions

1. **Preference conflicts between project collaborators:** **Project owner's preferences win.** A PitchApp is the owner's story — editors are collaborators on the owner's narrative, not co-authors of the visual system. Only the owner's own Scout interactions update the owner's preference profile.

   **Edge case — editor edit brief contradicts owner preference:** The edit brief wins for that specific project (it's an explicit request for this build), but it does NOT update the owner's preference profile. Implementation: `buildPreferenceBlock()` checks `source_ref.user_id` matches project owner before injecting; edit briefs from editors are treated as project-scoped overrides, not preference signals.

2. **Explicit settings page:** **Cut from Phase 1.** Let implicit learning build trust. Users can tell Scout directly if they want to declare preferences (extracted at 0.9 confidence via `scout_feedback` source).

3. **Preference portability:** Preferences only apply when the user is the project owner. Collaborators don't inject their preferences into someone else's project.

## Open Questions

1. **Cold start for new users:** Should new users inherit any system-level defaults? Recommendation: No — start blank, let preferences build naturally. System learnings already provide baseline intelligence.

2. **Learning seeding:** Should we seed initial learnings from the existing PitchApp builds (ONIN, Shareability, Bonfire)? Recommendation: Yes — manual seed with learnings from completed builds to bootstrap the system.
