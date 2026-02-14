# Animation Specialist Agent — Architecture Design

## Decision: Single Agent with Rich Prompt

**Recommendation: Single agent, NOT a mini-team.**

### Why Not a Mini-Team

A "creative director + developer" two-agent model sounds elegant but fails in this context:

| Concern | Impact |
|---------|--------|
| **Coordination overhead** | Passing context between agents in a headless PM2 cron job is fragile — no shared state, no real-time messaging |
| **Double API cost** | Two agents means 2x the input context (both need the current HTML/CSS/JS), 2x the system prompts |
| **Error propagation** | If the creative director designs something the developer can't implement, there's no feedback loop without human intervention |
| **Latency** | Sequential agent calls (interpret → implement) double execution time on a 2-minute poll cycle |
| **Diminishing returns** | The "creative" part is a reasoning step, not a separate skill — a well-prompted single agent does both |

### What the Single Agent Gets Instead

The creative interpretation is baked into the system prompt as a **mandatory reasoning phase** before any code changes. The agent must:

1. **Interpret** the brief (what does the user actually want?)
2. **Map** to proven patterns or compose new ones
3. **Plan** the multi-file changes (HTML + CSS + JS)
4. **Implement** with GSAP safety rules enforced
5. **Verify** against the gotcha checklist

This is the same "creative director thinking" but without the coordination tax.

---

## System Prompt

```
You are a PitchApp animation specialist. You implement animation and visual effect changes for scroll-driven PitchApps built with GSAP 3.12+, ScrollTrigger, and ScrollToPlugin.

## Your Process

For every animation brief, follow this sequence:

### Step 1: Interpret Intent
Read the brief carefully. Users often describe feelings, not techniques:
- "Make it feel alive" → ambient motion, subtle parallax, micro-interactions
- "Neon sign effect" → CSS text-shadow with colored layers, flicker keyframe, glow spread
- "Make the headline pop" → character decode animation, scale-up entrance, accent color flash
- "I want a typing effect" → terminal typing pattern (character-by-character, cursor blink)
- "More dynamic" → add stagger to existing fades, increase parallax range, add hover interactions
- "Smooth transitions" → review ScrollTrigger timing, add scrubbed animations, soften easing curves

If the brief is ambiguous, implement the most visually impactful interpretation that stays within proven patterns.

### Step 2: Map to Patterns
Check if a proven pattern exists using lookup_pattern. Proven patterns are battle-tested across 4+ production PitchApps. Always prefer adapting a proven pattern over inventing from scratch.

Available proven patterns:
- character_decode — Scramble-to-reveal text animation (hero titles, headlines)
- feed_fragments — Floating content shapes with lens effect (hero backgrounds)
- equation_cards — 3D flip cards showing approach methodology
- signal_path — SVG draw animation for process flowcharts
- case_study_flip — 3D flip cards with stats/images
- client_wall_magnetic — Text names with cursor repulsion effect
- contact_overlay — Modal with backdrop blur
- terminal_typing — Character-by-character typing with cursor
- product_grid_tilt — Card tilt on mousemove with perspective
- abstract_grid_hero — CSS grid lines with cursor-following glow
- video_hero — mp4 background with overlay layers
- light_section — Dark-to-light palette switching mid-page
- flame_loader — CSS-only fire animation
- parallax_bg — Background image shift on scroll (scrubbed)
- counter_animation — Animated number counting with prefix/suffix
- clip_path_reveal — Image reveal with expanding clip-path
- stagger_fade — Sequential fade-in of grouped elements

If no proven pattern matches, you may compose from CSS + GSAP primitives, but flag it as a custom implementation.

### Step 3: Plan Changes
Animation changes almost always touch multiple files. Plan what changes in each:
- **HTML** (index.html): New elements, class changes, data attributes, structural additions
- **CSS** (css/style.css): New keyframes, initial states for gsap.to(), hover/active states, responsive overrides
- **JS** (js/app.js): New GSAP timelines, ScrollTrigger instances, event listeners, initialization calls

Think through the change set before writing any files.

### Step 4: Implement
Apply changes using write_file. When modifying existing files, read the current version first with read_file to understand the full context.

### Step 5: Verify
Before calling revision_complete, mentally walk through these checks:
- No gsap.from() anywhere (FOUC risk)
- No CSS scroll-behavior: smooth (GSAP conflict)
- All GSAP plugins registered
- Selectors are scoped to their section
- Mobile has a fallback for every desktop interaction
- prefers-reduced-motion respected

## GSAP Safety Rules (MANDATORY)

These rules are non-negotiable. Violating them causes real, user-visible bugs.

| Rule | Why | Correct Pattern |
|------|-----|-----------------|
| **NEVER use gsap.from()** | Causes FOUC — elements flash at full opacity then snap to hidden state | Set initial state in CSS (`opacity: 0; transform: scale(0.94)`), use `gsap.to()` to animate TO visible |
| **NEVER use CSS scroll-behavior: smooth** | Conflicts with GSAP ScrollToPlugin, causes double-scroll jank | Remove from `html` selector; GSAP handles all smooth scrolling |
| **ALWAYS register ALL plugins** | Unregistered plugins silently fail — no errors, just broken behavior | `gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)` at init, before any animations |
| **ALWAYS scope selectors** | `.hero-grid-bg` hits all sections if the class is reused | `.section-hero .hero-grid-bg` — always scope to the parent section |
| **NEVER cache dimensions at init** | Mobile orientation changes invalidate `offsetWidth/Height` | Read `element.offsetWidth/Height` fresh inside animation callbacks |
| **ALWAYS add prefers-reduced-motion** | Accessibility requirement — some users get motion sickness | Check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at init; `gsap.set()` elements to final state and return early |
| **ALWAYS use progressive enhancement** | Content must be visible if JS fails | `body:not(.js-loaded) .anim-fade { opacity: 1; transform: none; }` |

## Mobile Interaction Patterns

Every desktop interaction MUST have a mobile equivalent:

| Desktop Pattern | Mobile Equivalent |
|-----------------|-------------------|
| Cursor-following glow | Ambient drift loop + tap-to-move (touchstart with passive: true) |
| Hover card tilt | Tap to activate, second tap to dismiss |
| Hover card flip | Tap toggles .flipped class |
| Mouse magnetic repulsion | Scroll-linked wobble via ScrollTrigger.onUpdate |
| Cursor lens effect | Tap-to-brighten within radius, then fade back |

Touch detection: `window.matchMedia('(pointer: coarse)').matches` — more reliable than user-agent sniffing.

## ScrollTrigger Reference

| Animation Type | Start | End | Scrub | Once |
|----------------|-------|-----|-------|------|
| Fade-in (.anim-fade) | top 88% | N/A | No | Yes |
| Gallery card scale | top 85% | N/A | No | Yes |
| List item slide | top 78% | N/A | No | Yes |
| Counter animation | top 82% | N/A | No | Yes |
| Background parallax | top bottom | bottom top | 1.5 | No |
| Content lift | top bottom | top 40% | 1.5 | No |
| Clip-path reveal | top 75% | N/A | No | Yes |
| Terminal typing | top 80% | N/A | No | Yes |

## Stagger & Timing

- Within section: `idx * 0.12s` per element
- Gallery cards: `i * 0.15s`
- List items: `i * 0.12s`
- Summary blocks: `i * 0.1s`
- Easing: `power2.out` (most fades), `power3.out` (hero), `power3.inOut` (clip-path, smooth scroll)
- Duration: 0.7s–1.4s for reveals, 2.2s for counters

## Terminal Overflow Fix

If adding terminal/typing animations:
- Terminal body: `max-height: 320px; overflow-y: auto`
- Mobile (≤480px): `white-space: pre-wrap` (not `nowrap`)
- Auto-scroll: `container.scrollTop = container.scrollHeight` inside each typeChar() call

## What NOT to Do

- Don't restructure HTML that isn't related to the animation brief
- Don't "improve" existing animations that work fine
- Don't add libraries beyond GSAP + ScrollTrigger + ScrollToPlugin
- Don't use CSS animations where GSAP ScrollTrigger gives better control
- Don't add intersection observers — use ScrollTrigger for everything scroll-related
- Don't use requestAnimationFrame directly when GSAP.ticker is available
```

---

## Tool Definitions

### Existing Tools (unchanged)

These carry over from the current `handleAutoRevise`:

```javascript
const reviseTools = [
  {
    name: "read_file",
    description: "Read a file from the app directory.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path within app directory (e.g., 'index.html', 'css/style.css', 'js/app.js')" }
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a file to the app directory. Always write the COMPLETE file content — no partial updates or diffs.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path within app directory" },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "copy_brand_asset",
    description: "Copy a brand asset from brand-assets/ into the app images/ directory.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Path relative to brand-assets/ (e.g., 'logo/logo-dark.png')" },
        dest: { type: "string", description: "Destination filename in images/ (e.g., 'logo.png')" },
      },
      required: ["source", "dest"],
    },
  },
  {
    name: "revision_complete",
    description: "Signal that all animation changes have been applied. Include both what was changed and what gotchas were checked.",
    input_schema: {
      type: "object",
      properties: {
        changes_applied: { type: "array", items: { type: "string" }, description: "List of changes made" },
        briefs_addressed: { type: "array", items: { type: "string" }, description: "Brief IDs/descriptions addressed" },
        patterns_used: { type: "array", items: { type: "string" }, description: "Names of proven patterns used (e.g., 'character_decode', 'terminal_typing')" },
        gotchas_verified: { type: "array", items: { type: "string" }, description: "Gotchas explicitly checked (e.g., 'no gsap.from()', 'selectors scoped', 'mobile fallback added')" },
      },
      required: ["changes_applied", "gotchas_verified"],
    },
  },
];
```

### New Tools

```javascript
const animationTools = [
  {
    name: "lookup_pattern",
    description: "Look up a proven animation pattern from the PitchApp catalog. Returns the full HTML, CSS, and JS implementation details for the pattern.",
    input_schema: {
      type: "object",
      properties: {
        pattern_name: {
          type: "string",
          enum: [
            "character_decode", "feed_fragments", "equation_cards",
            "signal_path", "case_study_flip", "client_wall_magnetic",
            "contact_overlay", "terminal_typing", "product_grid_tilt",
            "abstract_grid_hero", "video_hero", "light_section",
            "flame_loader", "parallax_bg", "counter_animation",
            "clip_path_reveal", "stagger_fade"
          ],
          description: "Name of the proven pattern to look up"
        },
      },
      required: ["pattern_name"],
    },
  },
  {
    name: "read_reference",
    description: "Read a file from a reference PitchApp build. Use this to see how a pattern was implemented in production.",
    input_schema: {
      type: "object",
      properties: {
        build: {
          type: "string",
          enum: ["bonfire", "shareability", "onin"],
          description: "Which reference build to read from"
        },
        file: {
          type: "string",
          description: "File path relative to the build (e.g., 'js/app.js', 'css/style.css', 'index.html')"
        },
      },
      required: ["build", "file"],
    },
  },
];
```

---

## Tool Handler Implementations

### lookup_pattern

Maps pattern names to CONVENTIONS.md section ranges. Returns the full text of that section.

```javascript
// Pattern name → CONVENTIONS.md section mapping
const PATTERN_SECTIONS = {
  character_decode:      { start: "### 10.7 Character Decode", end: "### 10.8" },
  feed_fragments:        { start: "### 10.8 Feed Fragments", end: "### 10.9" },
  equation_cards:        { start: "### 10.9 Equation/Formula", end: "### 10.10" },
  signal_path:           { start: "### 10.10 Signal Path", end: "### 10.11" },
  case_study_flip:       { start: "### 10.11 Case Study", end: "### 10.12" },
  client_wall_magnetic:  { start: "### 10.12 Client Logo", end: "### 10.13" },
  contact_overlay:       { start: "### 10.13 Contact Overlay", end: "---\n\n## 11" },
  terminal_typing:       { start: "### 10.2 Terminal Typing", end: "### 10.3" },
  product_grid_tilt:     { start: "### 10.1 Product Grid", end: "### 10.2" },
  abstract_grid_hero:    { start: "### 11.2 Abstract Grid", end: "### 11.3" },
  video_hero:            { start: "### 10.6 Video Hero", end: "### 10.7" },
  light_section:         { start: "### 10.5 Light Section", end: "### 10.6" },
  flame_loader:          { start: "### 10.3 Flame Loader", end: "### 10.4" },
  // Standard section animations — return the animation conventions section
  parallax_bg:           { start: "### 3.5 Parallax", end: "---\n\n## 4" },
  counter_animation:     { section: 3, subsections: ["3.1", "3.4"] },
  clip_path_reveal:      { start: "### 1.10 Split", end: "### 1.11" },
  stagger_fade:          { start: "### 3.2 Stagger", end: "### 3.3" },
};

function handleLookupPattern(patternName) {
  const conventions = readFileSync(conventionsPath, "utf-8");
  const mapping = PATTERN_SECTIONS[patternName];
  if (!mapping) return { error: `Unknown pattern: ${patternName}` };

  const startIdx = conventions.indexOf(mapping.start);
  const endIdx = conventions.indexOf(mapping.end);
  if (startIdx === -1) return { error: `Pattern section not found in CONVENTIONS.md` };

  const section = conventions.slice(startIdx, endIdx > startIdx ? endIdx : startIdx + 3000);
  return { pattern: patternName, content: section.trim() };
}
```

### read_reference

Sandboxed read from reference builds only (bonfire, shareability, onin).

```javascript
const REFERENCE_BUILDS = ["bonfire", "shareability", "onin"];

function handleReadReference(build, file) {
  if (!REFERENCE_BUILDS.includes(build)) {
    return { error: `Unknown build: ${build}. Available: ${REFERENCE_BUILDS.join(", ")}` };
  }
  const absPath = join(ROOT, "apps", build, file);
  if (!absPath.startsWith(join(ROOT, "apps", build) + "/")) {
    return { error: "Access denied: path traversal" };
  }
  if (!existsSync(absPath)) {
    return { error: `File not found: apps/${build}/${file}` };
  }
  // Cap at 30k chars to stay within context budget
  const content = readFileSync(absPath, "utf-8").slice(0, 30000);
  return { build, file, content };
}
```

---

## Context Injection Strategy

The system prompt above is ~3,500 tokens. That's the **always-present** context containing:
- Safety rules (GSAP gotchas)
- Process (5-step reasoning flow)
- ScrollTrigger reference table
- Timing/easing reference
- Mobile patterns
- Pattern names (catalog index, not full details)

The **on-demand** context is accessed via tools:
- `lookup_pattern` → full CONVENTIONS.md section for a specific pattern (~200-400 tokens each)
- `read_reference` → actual production code from completed builds (~up to 30k chars)
- `read_file` → current state of the target PitchApp

This means the agent starts with ~4k tokens of system context, then pulls in 1-3 pattern references as needed (~1-2k more), rather than injecting the full ~8k-token CONVENTIONS.md upfront.

### Cost Comparison

| Approach | Input tokens (est.) | Notes |
|----------|---------------------|-------|
| Current generic agent | ~3k system + ~65k files | No animation knowledge |
| Full CONVENTIONS injection | ~8k system + ~65k files | Wastes budget on unrelated sections |
| **Proposed: selective** | **~4k system + ~65k files + ~2k patterns** | Only loads what's needed |

---

## Model Selection

**Use `claude-sonnet-4-5` (MODEL_SONNET), not Opus.**

Rationale:
- Animation implementation is structured code generation — Sonnet's strength
- The creative interpretation is handled by the structured reasoning prompt, not raw model creativity
- Sonnet with extended thinking (10k budget, same as current revise) handles the "interpret → plan → implement" flow well
- Opus is reserved for narrative/judgment tasks; animation is pattern-matching + code
- Cost: Sonnet is ~5x cheaper than Opus per token

```javascript
const response = await streamMessage(client, {
  model: MODEL_SONNET,
  max_tokens: 16384,
  thinking: { type: "enabled", budget_tokens: 10000 },
  system: ANIMATION_SPECIALIST_SYSTEM,
  tools: [...reviseTools, ...animationTools],
  messages,
});
```

---

## Agent Turn Budget

**Recommend: MAX_ANIMATE_TURNS = 12** (vs current MAX_REVISE_TURNS = 10)

Animation changes need slightly more turns because:
1. Turn 1: Read current JS file (understand existing animation setup)
2. Turn 2: lookup_pattern or read_reference for the target pattern
3. Turn 3-4: Possibly read_reference for a second pattern or the CSS
4. Turn 5-8: Write file(s) — animation changes often require all 3 files
5. Turn 9-10: Read back to verify, possibly fix
6. Turn 11-12: revision_complete

The current generic revise agent often finishes in 4-6 turns for text edits. Animation will use 7-10 turns typically.

---

## Integration with Pipeline Executor

The animation specialist is invoked from `handleAutoRevise` (or a new `handleAutoAnimate`) based on brief classification. The routing decision is designed in Task #4, but the interface is:

```javascript
// Called by the routing logic when brief is classified as animation
async function runAnimationSpecialist(job, project, appDir, taskDir, editBriefs) {
  // Same agentic loop structure as handleAutoRevise
  // But with: ANIMATION_SPECIALIST_SYSTEM prompt + expanded tool set
  // Returns: { changes_applied, patterns_used, gotchas_verified }
}
```

The function follows the exact same pattern as the current handleAutoRevise agentic loop (lines 1382-1468 of pipeline-executor.mjs) — claim Anthropic client, define tools, loop with tool_use handling, budget checks between turns.

---

## revision_complete Output Schema

The animation specialist's `revision_complete` call provides richer metadata than the generic agent:

```json
{
  "changes_applied": [
    "Added character decode animation to hero title",
    "Added CSS text-shadow glow layers for neon effect",
    "Added prefers-reduced-motion bypass"
  ],
  "briefs_addressed": ["brief-uuid-1"],
  "patterns_used": ["character_decode"],
  "gotchas_verified": [
    "no_gsap_from",
    "no_css_smooth_scroll",
    "plugins_registered",
    "selectors_scoped",
    "mobile_fallback_present",
    "reduced_motion_respected",
    "progressive_enhancement_intact"
  ]
}
```

This metadata feeds into:
- The automation log (for debugging)
- The `pitchapp_manifests.animations` field (for the manifest, if Task #4 extends it)
- The review step (auto-review can check that gotchas_verified is complete)

---

## Failure Modes and Mitigations

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Agent can't find a pattern match | No `lookup_pattern` call, or it returns "not found" | System prompt says: "If no proven pattern matches, compose from CSS + GSAP primitives but flag as custom" |
| Agent introduces gsap.from() | Post-revision grep for `gsap.from(` in written JS | Pipeline executor can run a simple regex check after revision_complete and fail the job with a clear error |
| Agent exceeds turn budget | Turn counter hits MAX_ANIMATE_TURNS | Same as current: break loop, log incomplete, return partial results |
| Agent writes invalid JS | File is written but breaks the PitchApp | The downstream auto-review step catches this (or a lightweight syntax check post-write) |
| Brief is misclassified as animation | Animation specialist gets a "change the headline text" brief | Doesn't break — the specialist can handle text changes too, just uses a heavier prompt. Slight cost waste. |

### Post-Write Safety Check (Recommended)

After the agentic loop completes but before returning, run a simple validation:

```javascript
const finalJs = readFileSync(join(appDir, "js/app.js"), "utf-8");
const violations = [];

if (/gsap\.from\s*\(/.test(finalJs)) {
  violations.push("gsap.from() detected — FOUC risk");
}
if (/scroll-behavior\s*:\s*smooth/.test(
  readFileSync(join(appDir, "css/style.css"), "utf-8")
)) {
  violations.push("CSS scroll-behavior: smooth detected — GSAP conflict");
}

if (violations.length > 0) {
  await logAutomation("animation-safety-violations", { violations }, job.project_id);
  // Optionally: re-prompt the agent to fix, or fail the job
}
```

---

## Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Single agent with rich prompt | Simpler, cheaper, fewer failure modes than mini-team |
| Model | Sonnet (not Opus) | Animation is structured code generation, not creative writing |
| System prompt | ~3.5k tokens with safety rules + pattern index | Non-negotiable rules always present; details on-demand |
| New tools | `lookup_pattern` + `read_reference` | On-demand access to patterns library and production code |
| Context strategy | Selective injection via tools | Saves ~4k tokens vs full CONVENTIONS.md injection |
| Turn budget | 12 turns (vs 10 for generic) | Animation needs pattern lookup + multi-file writes |
| Safety net | Post-write regex validation | Catches the two most common GSAP bugs automatically |
| Failure mode for misclassification | Graceful degradation | Animation specialist handles text changes fine, just slight cost overhead |
