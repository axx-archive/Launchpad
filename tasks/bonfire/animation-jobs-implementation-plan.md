# Animation Jobs — Unified Implementation Plan

**Status:** Final Synthesis
**Date:** 2026-02-13
**Sources:** Taxonomy Design, Scout Routing Design, Agent Architecture (x2), Pipeline Design

---

## Executive Summary

When a Launchpad user tells Scout "make the headline glow like a neon sign" or "add parallax to the background," the current system submits a flat `change_type: "animation"` brief with a text description and hands it to a generic revise agent that has zero GSAP knowledge. The result is either hallucinated code or a confused "I can't do that."

This plan adds **animation intelligence** to three layers:

1. **Scout** — Knows what's technically possible. Proposes proven options instead of guessing. Writes structured animation briefs with routing metadata.
2. **Pipeline** — Detects animation briefs and routes them to a specialist agent instead of the generic revise handler.
3. **Animation Specialist** — A single Sonnet agent with a purpose-built prompt, GSAP safety rules, proven pattern library, and reference code access.

No database migrations. No new job types. No new Supabase tables. The entire system is a backward-compatible extension of the existing auto-revise flow.

**Estimated implementation:** ~4 focused sessions across 3 phases.

---

## 1. Architecture Decisions (Consensus)

All 4 specialist agents converged on these decisions:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Agent architecture** | Single agent with rich prompt | Mini-team adds coordination overhead, 2x cost, error propagation — bakes creative thinking into prompt reasoning steps instead |
| **Pipeline routing** | Route within `handleAutoRevise()` | No new job type, no schema migration, no changes to `createFollowUpJobs()` — just an internal `if (hasAnimationBriefs)` branch |
| **Model** | Sonnet (not Opus) | Animation is structured code generation + pattern matching — Sonnet's strength. ~5x cheaper than Opus. |
| **Context strategy** | Selective injection via tools | ~4k system prompt always present; pattern details loaded on-demand via `lookup_pattern` / `read_reference` tools. Saves ~4k tokens vs injecting full CONVENTIONS.md |
| **Brief enrichment** | `animation_spec` field on `EditChange` | JSONB column (`edit_brief_json`) accepts extension without migration. TypeScript interface added for type safety |
| **Safety net** | Post-write regex validation | Catches `gsap.from()` and CSS `scroll-behavior: smooth` mechanically — zero API cost |
| **Turn budget** | 12-15 turns (vs 10 for standard) | Animation needs pattern lookup + multi-file writes; typical run: 7-10 turns |
| **Phased rollout** | 3 phases, each independently valuable | Phase 1 (Scout prompt only) improves briefs immediately with zero pipeline risk |

### One Reconciliation

The scout-routing-designer proposed separate `auto-revise-animation` jobs, while the other 3 agents recommended internal routing within `handleAutoRevise`. **Decision: internal routing wins.** It's simpler, requires no migration, and the ordering concern (text changes before animation) is handled by processing standard briefs first within the same handler invocation.

---

## 2. Animation Taxonomy

6 top-level categories, 31 subcategories. Organized by *what is being animated*, not implementation technique.

| Category | Subcategories | Complexity Range |
|----------|--------------|-----------------|
| **Text Effects** | decode, typewriter, counter, split_reveal, gradient_shift, glow | Low–Medium |
| **Image & Media** | parallax, clip_reveal, zoom, filter_shift, video.hero, video.inline | Low–Medium |
| **Scroll Behaviors** | fade_in, stagger, slide, scale_in, pin, horizontal, progress_draw | Low–High |
| **Interaction** | tilt, flip, magnetic, cursor_glow, hover_scale, modal | Low–High |
| **Ambient** | particles, grid, grain, dot_matrix, gradient, loader | Low–High |
| **Section-Level** | terminal, flowchart, hero_reveal, light_switch, product_grid | Medium–High |

### Complexity Routing

| Complexity | Definition | Routing |
|-----------|-----------|---------|
| **Low** | CSS-only or single GSAP tween. Known templates. | Standard auto-revise (with animation context injected) |
| **Medium** | Multiple coordinated tweens, ScrollTrigger custom config, mobile fallbacks. | Animation specialist |
| **High** | Custom JS logic, GSAP ticker loops, complex state, new HTML structure. | Animation specialist (full reference access) |

Full taxonomy with signal words, example user requests, and reference implementations: `tasks/animation-brief-taxonomy.md`

---

## 3. Data Model Extension

### 3.1 New TypeScript Interface

Add to `apps/portal/src/types/database.ts`:

```typescript
interface AnimationSpec {
  animation_type: string;                    // "text.decode", "scroll.pin", etc.
  complexity: "low" | "medium" | "high";
  target: {
    selector: string;                        // CSS selector or semantic description
    element_type: string;                    // "headline", "background", "card", "section"
  };
  timing?: {
    trigger: string;                         // "on_scroll" | "on_load" | "on_hover" | "on_click" | "continuous"
    feel?: string;                           // "fast" | "slow" | "dramatic" | "subtle"
  };
  asset_requirements?: {
    type: "video" | "image" | "svg" | "none";
    status: "provided" | "needs_sourcing" | "not_needed";
  };
  pattern_reference?: {
    source_app: string;                      // "bonfire", "shareability", "onin"
    reference: string;                       // "decodeTitle() in js/app.js"
  };
  mobile_behavior?: "same" | "simplified" | "disabled" | "alternative";
  reduced_motion_behavior?: string;
}
```

### 3.2 Extended EditChange

```typescript
interface EditChange {
  section_id: string;
  change_type: string;
  description: string;
  priority?: string;
  asset_references?: AssetReference[];
  animation_spec?: AnimationSpec;            // NEW — present when change_type === "animation"
}
```

**Backward compatible.** Existing briefs without `animation_spec` continue to work. The JSONB column accepts the extension without migration.

---

## 4. Scout-Side Changes

### 4.1 New System Prompt Block: `<animation_capabilities>`

Added to `buildSystemPrompt()` in `src/lib/scout/context.ts` when project status is in `["review", "revision", "live"]`.

~60 lines covering:
- **Proven animation catalog** — what Scout can confidently offer (17 patterns organized by category)
- **Decision framework** — when to decide, propose options, or ask questions
- **Brief enrichment format** — structured metadata for animation briefs
- **Off-menu handling** — how to redirect creative requests to proven patterns

### 4.2 Scout's Decision Framework

```
Animation request detected
├─ Specific + known pattern → Confirm and submit immediately
├─ Specific + unknown pattern → Propose closest alternatives
├─ Vague feeling ("make it pop") → Propose 2-3 options for target section
├─ No target section → Ask which section, then propose
└─ Truly custom → Acknowledge, flag complexity, offer alternatives
```

**Key UX principle:** Scout is a creative director, not a waiter. "Here are three ways to make this pop" beats "what do you mean by pop?"

### 4.3 Updated Edit Brief Protocol

Small addition to existing `<edit_brief_protocol>`:
- Always use `change_type: "animation"` for motion/effects (not "design" or "layout")
- Include `animation_spec` with type, complexity, target, timing, pattern reference
- If request is vague, propose options before submitting
- Flag truly custom requests explicitly

### 4.4 Files Changed

| File | Change | Size |
|------|--------|------|
| `src/lib/scout/context.ts` | Add `<animation_capabilities>` block | ~60 lines |
| `src/lib/scout/context.ts` | Update `<edit_brief_protocol>` | ~10 lines |
| `src/types/database.ts` | Add `AnimationSpec` interface | ~25 lines |

Full Scout routing design: `tasks/bonfire/animation-detection-routing.md`

---

## 5. Pipeline Changes

### 5.1 Classification (in `handleAutoRevise`)

```javascript
// At the top of handleAutoRevise, after parsing briefs:
const ANIMATION_CHANGE_TYPES = new Set(["animation"]);

const hasAnimationBriefs = editBriefs.some(b =>
  ANIMATION_CHANGE_TYPES.has(b.change_type) || b.animation_spec
);

if (hasAnimationBriefs) {
  return handleAnimationRevise(job, project, appDir, taskDir, editBriefs);
}
// ... existing standard revise logic continues ...
```

When a batch is mixed (text + animation), the animation specialist handles ALL briefs. It's a superset — it can apply text changes too, with slight cost overhead.

### 5.2 `handleAnimationRevise` Function

Same agentic loop structure as `handleAutoRevise` (lines 1382-1468 of pipeline-executor.mjs):
- Uses animation specialist system prompt (~3.5k tokens)
- Uses expanded tool set (existing 4 + 2 new)
- Injects `AnimationSpec` metadata in the user message
- Injects relevant CONVENTIONS.md sections based on patterns referenced
- Runs post-write safety validation
- 12-15 turn budget (vs 10 for standard)
- Same cost tracking and budget caps

### 5.3 New Tool Handlers

**`lookup_pattern`** — Maps 17 pattern names to CONVENTIONS.md section ranges. Returns the full text of the relevant section (~200-400 tokens per lookup). Zero external API cost.

**`read_reference`** — Sandboxed read from reference builds (bonfire, shareability, onin). Path-traversal protected. Cap at 30k chars. Allows agent to see actual working code from production builds.

**`validate_animation`** — Server-side regex checks against known GSAP anti-patterns:
- `gsap.from()` → FOUC risk
- CSS `scroll-behavior: smooth` → GSAP conflict
- Unregistered plugins
- Unscoped selectors on reused classes
- Cached dimensions at init (mobile rotation risk)
- Missing `prefers-reduced-motion` handling

### 5.4 Post-Write Safety Net

After the agentic loop completes but before returning:

```javascript
const finalJs = readFileSync(join(appDir, "js/app.js"), "utf-8");
const finalCss = readFileSync(join(appDir, "css/style.css"), "utf-8");
const violations = [];

if (/gsap\.from\s*\(/.test(finalJs)) {
  violations.push("gsap.from() detected — FOUC risk");
}
if (/scroll-behavior\s*:\s*smooth/.test(finalCss)) {
  violations.push("CSS scroll-behavior: smooth — GSAP conflict");
}

if (violations.length > 0) {
  await logAutomation("animation-safety-violations", { violations }, job.project_id);
}
```

### 5.5 Enhanced Auto-Review

When the preceding job was an animation revision, append an animation-specific checklist to the Code Reviewer persona in auto-review:
- All gotchas verified (from `revision_complete.gotchas_verified`)
- Mobile fallback for every desktop interaction
- `prefers-reduced-motion` handling present
- No orphaned CSS/JS (animation removed from HTML but styles/scripts remain)

### 5.6 Result Metadata Extension

`revision_complete` gains two new optional fields:
- `patterns_used: string[]` — which proven patterns were applied
- `gotchas_verified: string[]` — which safety checks passed

### 5.7 Files Changed

| File | Change | Size |
|------|--------|------|
| `scripts/cron/pipeline-executor.mjs` | Add classification + `handleAnimationRevise()` | ~200 lines |
| `scripts/cron/pipeline-executor.mjs` | Add `lookup_pattern`, `read_reference`, `validate_animation` handlers | ~75 lines |
| New: `scripts/cron/lib/animation-validator.mjs` | Extracted validation logic | ~60 lines |

Full agent architecture: `tasks/bonfire/materials/animation-specialist-agent-design.md`

---

## 6. Animation Specialist Agent

### 6.1 System Prompt (~3.5k tokens, always present)

Five mandatory reasoning steps:
1. **Interpret** — What does the user actually want? (translate feelings to techniques)
2. **Map** — Which proven pattern(s) match? (use `lookup_pattern`)
3. **Plan** — Which files change? (HTML, CSS, JS — plan before writing)
4. **Implement** — Write files using `write_file` (surgical changes, complete files)
5. **Verify** — Walk through gotcha checklist before `revision_complete`

Includes:
- GSAP safety rules (7 non-negotiable rules)
- ScrollTrigger reference table (8 animation types with start/end/scrub/once)
- Stagger & timing conventions
- Mobile interaction patterns (5 desktop → mobile translations)
- Terminal overflow fix
- Pattern index (17 proven patterns with brief descriptions)

### 6.2 Tool Set

| Tool | Source | Purpose |
|------|--------|---------|
| `read_file` | Existing | Read current app files |
| `write_file` | Existing | Write app files |
| `copy_brand_asset` | Existing | Copy assets |
| `revision_complete` | Extended | Signal completion + patterns used + gotchas verified |
| `lookup_pattern` | **New** | Load proven pattern details from CONVENTIONS.md |
| `read_reference` | **New** | Read production code from reference builds |
| `validate_animation` | **New** | Pre-write GSAP anti-pattern check |

### 6.3 Model & Budget

- **Model:** `claude-sonnet-4-5` with extended thinking (10k budget)
- **Max turns:** 12-15
- **Typical turns:** 7-10 (read existing → lookup pattern → read reference → write HTML → write CSS → write JS → verify → complete)
- **Estimated cost:** ~$0.50-0.80 per animation revision (vs ~$0.30-0.60 for standard revise)

---

## 7. Implementation Phases

### Phase 1: Teach Scout (Immediate Value, Zero Pipeline Risk)

**What:** Add the animation catalog and decision framework to Scout's system prompt.

**Changes:**
- `src/lib/scout/context.ts` — add `<animation_capabilities>` block
- `src/lib/scout/context.ts` — update `<edit_brief_protocol>` with animation guidance
- `src/types/database.ts` — add `AnimationSpec` interface

**Impact:** Scout immediately starts writing richer animation briefs with structured metadata, proposing proven options instead of accepting vague requests. The existing generic auto-revise agent handles them (just better described now).

**Risk:** None. No pipeline changes. If the auto-revise agent ignores the metadata, the brief still works as a plain text description.

**Effort:** ~1 session.

---

### Phase 2: Animation Specialist Agent + Routing

**What:** Add the animation specialist agent to the pipeline with internal routing.

**Changes:**
- `scripts/cron/pipeline-executor.mjs` — add `handleAnimationRevise()`, classification logic, new tool handlers
- `scripts/cron/lib/animation-validator.mjs` — extracted validation logic

**Impact:** Animation briefs get routed to a specialist with GSAP knowledge, pattern library, and safety rules. Standard briefs continue through the existing handler unchanged.

**Risk:** Medium. New code path in the pipeline executor. Mitigated by: internal routing (no schema changes), same agentic loop structure, graceful degradation (misclassified briefs still work).

**Effort:** ~2 sessions.

---

### Phase 3: Reference Code Access

**What:** Enable the `read_reference` tool so the animation agent can pull actual production code from completed builds.

**Changes:**
- `read_reference` tool handler in pipeline-executor.mjs (already stubbed in Phase 2)
- Ensure apps/bonfire, apps/shareability, apps/onin are accessible from the pipeline execution context

**Impact:** Agent can see *how* patterns were actually implemented (not just descriptions), reducing hallucinated code.

**Risk:** Low. Read-only access, sandboxed to reference builds, path-traversal protected.

**Effort:** ~0.5 session (mostly testing).

---

## 8. End-to-End Flow (After All Phases)

```
User → Scout: "Make the headline do a neon glow effect"

Scout (with animation_capabilities):
  → Recognizes "neon glow" → maps to text.glow pattern
  → Confirms with user: "neon glow on the hero headline — pulsing text-shadow
    in your accent color. want me to submit?"
  → User: "Yes"
  → Calls submit_edit_brief with:
    {
      section_id: "hero",
      change_type: "animation",
      description: "Add neon glow effect to hero headline...",
      animation_spec: {
        animation_type: "text.glow",
        complexity: "low",
        target: { selector: ".hero-title-main", element_type: "headline" },
        timing: { trigger: "continuous", feel: "subtle" },
        pattern_reference: { source_app: "N/A", reference: "CSS text-shadow + keyframes" },
        mobile_behavior: "same",
        reduced_motion_behavior: "Static glow, no pulse animation"
      }
    }

Pipeline:
  → auto-brief pulls the brief
  → auto-revise detects animation_spec → routes to handleAnimationRevise
  → Animation specialist agent:
    1. Reads current HTML/CSS/JS
    2. lookup_pattern("text_glow") — (no complex pattern needed, uses inline knowledge)
    3. Writes CSS keyframes for glow pulse + text-shadow layers
    4. Writes JS for prefers-reduced-motion check
    5. validate_animation — passes
    6. revision_complete with patterns_used: ["text_glow"], gotchas_verified: [...]
  → auto-push deploys

User sees the neon glow on their next preview.
```

---

## 9. Open Questions (For Discussion)

1. **Mixed brief ordering** — When a user says "change the headline AND animate it," the text change needs to land first. Current plan: animation specialist handles both (it's a superset). Alternative: split into two sequential calls. **Recommendation: single specialist handles both** — simpler, avoids double-write conflicts.

2. **Animation preview for Scout** — Could Scout show a screenshot from a reference build when proposing animations? Adds latency + token cost. **Recommendation: Not for v1.** Text descriptions are sufficient. Consider for v2 with a `show_reference_screenshot` tool.

3. **Cost cap for animation revisions** — Complex animations (feed fragments, flowcharts) take more turns. Should animation revisions have a separate cost cap? **Recommendation: Same $100 per-build cap**, but animation revisions get 15 max turns (vs 10 for standard).

4. **Fallback for failed animation** — If the animation specialist's output breaks the PitchApp, should the pipeline auto-revert? **Recommendation: No auto-revert.** The auto-review step catches breaking changes, and the current manual review flow (client sees preview, gives feedback) serves as a natural gate.

---

## 10. Reference Documents

| Document | Location | Contents |
|----------|----------|----------|
| Animation Taxonomy | `tasks/animation-brief-taxonomy.md` | 6 categories, 31 subcategories, AnimationSpec interface, complexity rules |
| Scout Routing | `tasks/bonfire/animation-detection-routing.md` | Detection signals, decision framework, system prompt block, example conversations |
| Agent Architecture | `tasks/bonfire/materials/animation-specialist-agent-design.md` | System prompt, tool definitions, tool handler implementations, context strategy |
| Agent Architecture (alt) | `tasks/animation-specialist-agent.md` | Thinking frames approach, proven patterns reference, cost estimate |
| Conventions | `docs/CONVENTIONS.md` | Proven patterns library (sections 10.1-10.13), animation timing (sections 3-4) |
