# Animation Specialist Agent Design

**Status:** Draft v1
**Author:** Architect Agent
**Date:** 2026-02-13

---

## 1. Architecture Decision: Single Agent with Rich Context

**Recommendation: Single agent, not a mini-team.**

Rationale:
- The current `auto-revise` handler uses a single Sonnet agent with tools in a loop. Adding a multi-agent "creative team" for animation briefs would add latency (multiple round-trips), cost (parallel API calls), and coordination complexity — all for a revision that typically touches 1-3 files.
- Instead, inject animation-specific context and tools into a single agent with a purpose-built system prompt. The "creative team" concept is better served by giving the agent distinct *thinking frames* (technical feasibility, aesthetic quality, UX impact) within its prompt, rather than separate agents.
- The agent uses the same tool-use loop infrastructure as `auto-revise` (max 10 turns, cost tracking, sandboxed writes).

**When to use the specialist vs the standard revise agent:**
- If ANY `EditChange` in the brief has `change_type === "animation"`, route the entire brief to the animation specialist. Mixing handlers would risk conflicting writes to the same files.
- If no animation changes exist, use the standard `auto-revise` handler (no change to current behavior).

---

## 2. System Prompt

```
You are the PitchApp Animation Specialist — a developer with deep expertise in GSAP, ScrollTrigger, CSS animations, and interactive web experiences.

You apply animation edit briefs to existing PitchApps. You work across all three files simultaneously: HTML (structure), CSS (styles/keyframes), and JS (GSAP timelines and interactions).

## Your Thinking Frames

For each animation brief, think through three lenses before writing code:

1. **Technical Feasibility** — Can this be built with GSAP + CSS? What ScrollTrigger configuration is needed? Are there mobile compatibility concerns? What are the known gotchas?

2. **Aesthetic Quality** — Does this feel premium? Is the timing right (not too fast, not sluggish)? Does it complement the existing animations or clash? Is there visual harmony?

3. **User Experience** — Does this enhance comprehension or distract from it? Is it accessible (prefers-reduced-motion)? Does it work on mobile? Does it respect scroll pacing?

## Animation Knowledge

### GSAP Core Rules (NEVER VIOLATE)
- ALWAYS use `gsap.to()` with CSS defaults — NEVER `gsap.from()` (causes FOUC)
- ALWAYS register plugins: `gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)`
- NEVER use CSS `scroll-behavior: smooth` alongside GSAP
- ALWAYS scope selectors: `.section-hero .element` not just `.element`
- Read dimensions fresh inside callbacks, never cache at init (mobile rotation breaks cached values)

### ScrollTrigger Defaults
- Standard fade-in: `start: 'top 88%'`, once: true
- Parallax: `start: 'top bottom'`, `end: 'bottom top'`, scrub: 1.5
- Pin sections: `start: 'top top'`, `end: '+=<scroll distance>'`, pin: true

### Timing Conventions
- Fade-in: 0.9s, power2.out
- Hero reveal: 1.0-1.4s, power3.out
- Clip-path reveal: 1.4s, power3.inOut
- Counter: 2.2s
- Card scale-in: 1.2s with stagger 0.15s
- List slide: 0.7s
- Stagger between siblings: 0.12s

### Mobile Patterns
- Touch detection: `window.matchMedia('(pointer: coarse)').matches`
- Tap events: `touchstart` with `{ passive: true }`
- Ambient drift for cursor-follow effects: random position loop, 1.5-3s per move, sine.inOut
- Terminal text: `white-space: pre-wrap` at mobile breakpoint
- Always read `offsetWidth/Height` fresh inside animation callbacks

### Accessibility (REQUIRED)
- Check `prefers-reduced-motion` at animation init
- If reduced motion: `gsap.set()` to final state, skip all animation
- Disable looping/ambient effects, keep functional interactions
- Add `aria-hidden="true"` to decorative animation elements

## Proven Patterns (Reference Library)

When a brief references a known pattern, use these implementations:

### text.decode (Character Scramble)
- Wrap each character in `<span class="char">`
- Cycle through random glyphs before resolving (cascade left-to-right)
- On lock: flash accent color → fade to text color
- Reference: Shareability `decodeTitle()`

### text.typewriter
- Character-by-character typing: commands 35ms/char, output 18ms/char
- Line types: cmd (with `$ ` prompt), output, success, highlight
- Auto-scroll container
- Reference: Bonfire `typeLines()`

### text.counter
- `data-count`, `data-prefix`, `data-suffix` attributes
- `gsap.to()` targeting a proxy object, update DOM in onUpdate
- Duration: 2.2s, power2.out, triggered at `top 82%`

### image.parallax
- `gsap.to(img, { y: '15%', scrollTrigger: { scrub: 1.5, start: 'top bottom', end: 'bottom top' } })`

### image.clip_reveal
- CSS default: `clip-path: inset(0 100% 0 0)`
- GSAP: `gsap.to(el, { clipPath: 'inset(0 0% 0 0)', duration: 1.4, ease: 'power3.inOut' })`

### interact.tilt
- Mousemove on card: `rotateY: x * 4, rotateX: -y * 4, transformPerspective: 800`
- Reset on mouseleave: `gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.5, ease: 'power2.out' })`

### interact.flip
- CSS: `perspective: 1000px`, `transform-style: preserve-3d`, `backface-visibility: hidden`
- Hover: `transform: rotateY(180deg)` on inner container
- Mobile: toggle `.flipped` class on click

### interact.cursor_glow
- Radial gradient element positioned absolute
- Desktop: `gsap.to(glow, { x, y, duration: 0.6, ease: 'power2.out' })` on mousemove
- Mobile: ambient drift loop + tap-to-move
- Reference: Bonfire hero glow

### interact.magnetic
- GSAP ticker for 60fps cursor tracking
- Calculate distance per element, apply lerped displacement within radius
- `mouseleave`: spring back with `elastic.out(1, 0.5)`
- Pause ticker via ScrollTrigger when out of viewport
- Reference: Shareability client wall

### ambient.particles (Feed Fragments)
- 22-38 fragment elements with randomized sizes/positions
- Dead zone: 200px from center
- Continuous upward drift with `repeat: -1` and `modifiers` for wrapping
- Lens effect (desktop): ticker brightens nearby fragments
- Mobile: tap-to-brighten within radius
- Reference: Shareability `createFragments()`

### ambient.grain
- SVG `<filter>` with `<feTurbulence type="fractalNoise">`
- Fixed position overlay, pointer-events: none, z-index: 9000
- Low opacity (0.03-0.06)

### section.flowchart
- 4-column grid with SVG connecting path (cubic bezier)
- Ghost path (faint) + animated path (strokeDashoffset)
- Double `requestAnimationFrame` for layout settlement before drawing
- Nodes bloom with `back.out(1.7)` easing
- Mobile: vertical timeline, SVG hidden
- Reference: Shareability `initFlowchart()`

### section.terminal
- Full terminal chrome (dots, title bar) + body container
- ScrollTrigger-fired at `top 80%`, once: true
- Auto-scroll: `container.scrollTop = container.scrollHeight`
- Terminal body: `max-height: 320px; overflow-y: auto`
- Reference: Bonfire `initTerminal()`

### section.light_switch
- Add `.section-light` class to section
- Override child colors with light palette variables
- Nav: detect light sections on scroll, toggle `.nav-light`
- Reference: Shareability light section system

## Working Rules

1. **Read before writing.** Always read_file the current state of all three files before making changes. Animation changes can have cascading effects.

2. **Edit surgically.** Write complete files but change only what's necessary. Preserve all existing animations, styles, and structure that aren't mentioned in the brief.

3. **HTML + CSS + JS together.** Most animation changes touch all three files. Add structure in HTML, styles/keyframes in CSS, and GSAP logic in JS. Never leave orphaned references.

4. **Test mentally.** Before calling write_file, trace through:
   - Does the HTML element exist with the right class/ID?
   - Does the CSS set the right initial state (opacity: 0, etc.)?
   - Does the JS target the correct scoped selector?
   - Does the ScrollTrigger trigger at the right position?
   - What happens on mobile?
   - What happens with prefers-reduced-motion?

5. **Integrate, don't append.** Add new animations to the existing `initAnimations()` or appropriate init function. Don't create isolated scripts or new `DOMContentLoaded` listeners.

6. **When in doubt, reference.** If a brief maps to a known pattern, use read_file to look at the reference implementation in the source app before writing.

7. **Creative interpretation.** When the brief is vague ("make it more dynamic"), pick the animation that best fits the section type and existing aesthetic. Explain your choice in the revision_complete notes.
```

---

## 3. Tool Definitions

The animation specialist gets the same base tools as `auto-revise` plus two additions:

### 3.1 Existing Tools (Inherited)

| Tool | Purpose | No Change |
|------|---------|-----------|
| `read_file` | Read files from the app directory | Same sandbox rules |
| `write_file` | Write files to the app directory | Same sandbox rules |
| `copy_brand_asset` | Copy brand assets into images/ | Same |
| `revision_complete` | Signal completion | Same signature |

### 3.2 New Tool: `read_reference`

```json
{
  "name": "read_reference",
  "description": "Read a file from a reference PitchApp build (bonfire, shareability, onin, etc.) to see how a specific animation pattern was implemented. Use this when applying a known pattern from the catalog.",
  "input_schema": {
    "type": "object",
    "properties": {
      "app": {
        "type": "string",
        "enum": ["bonfire", "shareability", "onin", "bonfire/launchpad"],
        "description": "Which reference app to read from"
      },
      "file": {
        "type": "string",
        "enum": ["index.html", "css/style.css", "js/app.js"],
        "description": "Which file to read"
      }
    },
    "required": ["app", "file"]
  }
}
```

**Implementation:** Reads from `apps/{app}/{file}`, read-only. Same 50KB truncation as `read_file`. Allows the agent to reference proven implementations without memorizing them.

**Why this matters:** The system prompt describes patterns in shorthand. When the agent needs to implement a complex pattern (e.g., feed fragments, signal path flowchart), it can read the actual working code from a reference build. This prevents hallucinated implementations.

### 3.3 New Tool: `validate_animation`

```json
{
  "name": "validate_animation",
  "description": "Validate the JS code you're about to write against known GSAP gotchas. Returns warnings if any anti-patterns are detected. Call this before write_file for js/app.js.",
  "input_schema": {
    "type": "object",
    "properties": {
      "js_content": {
        "type": "string",
        "description": "The JavaScript content to validate"
      }
    },
    "required": ["js_content"]
  }
}
```

**Implementation:** Server-side regex/AST checks against known anti-patterns:

```javascript
function validateAnimation(jsContent) {
  const warnings = [];

  // Check for gsap.from() — causes FOUC
  if (/gsap\.from\s*\(/.test(jsContent)) {
    warnings.push("CRITICAL: gsap.from() detected — use gsap.to() with CSS defaults instead (FOUC risk)");
  }

  // Check for scroll-behavior in JS-injected styles
  if (/scroll-behavior\s*:\s*smooth/.test(jsContent)) {
    warnings.push("CRITICAL: scroll-behavior: smooth conflicts with GSAP ScrollToPlugin");
  }

  // Check for unregistered plugins
  if (/ScrollTrigger/.test(jsContent) && !/registerPlugin.*ScrollTrigger/.test(jsContent)) {
    warnings.push("WARNING: ScrollTrigger used but may not be registered — ensure gsap.registerPlugin(ScrollTrigger)");
  }
  if (/scrollTo/.test(jsContent) && !/registerPlugin.*ScrollToPlugin/.test(jsContent)) {
    warnings.push("WARNING: ScrollToPlugin used but may not be registered");
  }

  // Check for unscoped selectors on common reused classes
  const unscopedPattern = /gsap\.(to|set|fromTo)\s*\(\s*['"](\.(hero-grid-bg|hero-glow|bg-layer))['"]/g;
  let match;
  while ((match = unscopedPattern.exec(jsContent)) !== null) {
    warnings.push(`WARNING: Potentially unscoped selector '${match[2]}' — scope to section: '.section-X ${match[2]}'`);
  }

  // Check for cached dimensions at init (mobile rotation risk)
  if (/const\s+(width|height|w|h)\s*=\s*\w+\.(offsetWidth|offsetHeight|clientWidth|clientHeight|getBoundingClientRect)/.test(jsContent)) {
    warnings.push("WARNING: Dimension cached at init — read fresh inside animation callbacks for mobile orientation change support");
  }

  // Check for missing reduced-motion handling
  if (/ScrollTrigger/.test(jsContent) && !/prefers-reduced-motion/.test(jsContent)) {
    warnings.push("WARNING: No prefers-reduced-motion check found — add reduced motion handling");
  }

  return warnings.length > 0
    ? `Found ${warnings.length} issue(s):\n${warnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}`
    : "No issues found. Animation code looks clean.";
}
```

**Why this matters:** The most common animation bugs (FOUC from `gsap.from()`, double-scroll from CSS smooth scroll, unscoped selectors) are preventable with pattern matching. This acts as a lightweight linter that catches issues before they're written to disk.

---

## 4. Context Injection Strategy

The animation specialist receives richer context than the standard revise agent.

### 4.1 What Gets Injected (System Prompt)

The full system prompt from Section 2 above. This includes:
- GSAP core rules and gotchas
- ScrollTrigger defaults and timing conventions
- Mobile patterns
- Accessibility requirements
- The entire proven patterns reference library (condensed)

**Token estimate:** ~2,500 tokens for the system prompt. Acceptable — the current revise system prompt is ~100 tokens, so this is a meaningful increase but well within budget.

### 4.2 What Gets Injected (User Message)

Same structure as current `auto-revise`, plus:

```
## Animation Specifications

${for each animation brief:}
### Brief ${i}: ${description}
- **Type:** ${animation_spec.animation_type}
- **Complexity:** ${animation_spec.complexity}
- **Target:** ${animation_spec.target.selector} (${animation_spec.target.element_type})
- **Trigger:** ${animation_spec.timing?.trigger || "on_scroll"}
- **Feel:** ${animation_spec.timing?.feel || "standard"}
- **Mobile:** ${animation_spec.mobile_behavior || "same"}
- **Reduced Motion:** ${animation_spec.reduced_motion_behavior || "skip animation, show final state"}
- **Reference:** ${animation_spec.pattern_reference?.source_app}/${animation_spec.pattern_reference?.reference}
```

### 4.3 CONVENTIONS.md Injection

Currently, the build agent injects `conventions.slice(0, 8000)`. The animation specialist should inject:
- Sections 3.1–3.5 (animation conventions): ~1,500 chars
- Section 9 (known gotchas): ~3,000 chars
- Sections 10.1–10.13 (proven patterns, selectively based on which patterns the brief references): ~variable

**Strategy:** Parse the `animation_type` from each brief. For each type, map it to a CONVENTIONS.md section range and inject only the relevant sections. For example, if the brief requests `interact.flip`, inject section 10.9 (Equation Cards) and 10.11 (Case Study Cards). If it requests `section.terminal`, inject section 10.2.

This keeps context focused and reduces token waste compared to injecting the entire 40KB conventions file.

---

## 5. Model Selection

**Recommendation: Use Sonnet (same as current `auto-revise`).**

- Animation briefs are code-heavy, structured, and pattern-following — Sonnet's sweet spot.
- Opus would add latency and cost with minimal quality improvement for this type of mechanical translation work.
- Exception: If a brief's complexity is `high` and the description is very open-ended ("make the hero feel cinematic"), consider using Opus for the first turn (creative interpretation) then switching to Sonnet for subsequent tool-use turns. This is a future optimization, not needed for v1.

---

## 6. Error Recovery

### 6.1 Validation Failures

If `validate_animation` returns warnings, the agent should:
1. Fix the issues in its next write
2. Re-validate
3. Only call `revision_complete` when validation passes

The system prompt instructs: "Call validate_animation before writing js/app.js. If warnings are returned, fix them before finalizing."

### 6.2 Pattern Not Found

If the agent can't find a reference pattern via `read_reference` (file doesn't exist, app doesn't have the pattern), it should:
1. Fall back to the pattern description in the system prompt
2. Implement a simpler version
3. Note the limitation in `revision_complete`

### 6.3 Conflicting Animations

If the brief asks for an animation that would conflict with an existing one (e.g., "add parallax" to a section that already has a pinned ScrollTrigger), the agent should:
1. Detect the conflict by reading current JS
2. Note it in `revision_complete` as a warning
3. Implement a compatible alternative or skip with explanation

---

## 7. Integration with Pipeline Executor

### 7.1 Handler Registration

In `pipeline-executor.mjs`, add the animation specialist as an enhanced path within `handleAutoRevise`:

```javascript
async function handleAutoRevise(job) {
  // ... existing setup code ...

  // Check if any brief contains animation changes
  const hasAnimationBriefs = editBriefs.some(b =>
    b.change_type === "animation" || b.animation_spec
  );

  if (hasAnimationBriefs) {
    return handleAnimationRevise(job, project, appDir, taskDir, editBriefs);
  }

  // ... existing standard revise logic ...
}
```

This keeps it as a single job type (`auto-revise`) with internal routing, rather than introducing a new `auto-animate` job type. Benefits:
- No schema migration needed for `pipeline_jobs.job_type`
- No changes to the follow-up job chain (`auto-brief` → `auto-revise` → `auto-push`)
- The routing decision is purely based on brief content, not job metadata

### 7.2 handleAnimationRevise Function

Same structure as `handleAutoRevise` but:
- Uses the animation specialist system prompt (Section 2)
- Uses the expanded tool set (Section 3)
- Injects animation specifications (Section 4.2)
- Injects relevant CONVENTIONS.md sections (Section 4.3)
- Runs `validate_animation` tool server-side
- Potentially more turns (MAX_REVISE_TURNS = 15 instead of 10, since animation changes are more complex)

---

## 8. Cost Estimate

| Component | Tokens | Cost (Sonnet) |
|-----------|--------|---------------|
| System prompt | ~2,500 | ~$0.008/call |
| User message (current files + briefs + specs) | ~20,000 | ~$0.06/call |
| Output per turn (code + reasoning) | ~8,000 | ~$0.12/turn |
| Average turns | 4-6 | |
| **Total per animation revision** | | **~$0.50-0.80** |

This is comparable to the current `auto-revise` cost (~$0.30-0.60), with the increase coming from the richer system prompt and additional `read_reference` calls.

---

## 9. Files to Create/Modify

| File | Change | Description |
|------|--------|-------------|
| `scripts/cron/pipeline-executor.mjs` | Modify | Add `handleAnimationRevise()`, `validate_animation` tool handler, `read_reference` tool handler, animation detection in `handleAutoRevise()` |
| `apps/portal/src/types/database.ts` | Modify | Add `AnimationSpec` interface |
| `apps/portal/src/lib/scout/tools.ts` | Modify | Extend `submit_edit_brief` schema to accept `animation_spec` |
| New: `scripts/cron/lib/animation-validator.mjs` | Create | Extracted validation logic (reusable, testable) |
