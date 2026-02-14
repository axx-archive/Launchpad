# Scout Animation Detection & Routing Logic

## Design Summary

Animation requests are fundamentally different from text/copy edits. They require creative interpretation, GSAP technical knowledge, multi-file coordination, and understanding of proven patterns. This document defines how Scout detects animation intent, classifies it, enriches the brief with animation-specific metadata, and routes it to the right pipeline handler.

---

## 1. Detection: Where It Happens

Detection happens **inside Scout (Claude)**, not in application code. Scout already classifies every change with a `change_type` field when calling `submit_edit_brief`. The value `"animation"` already exists in the enum.

The gap isn't detection — it's what Scout *does* after detecting an animation request. Today, Scout treats `change_type: "animation"` identically to `change_type: "copy"` — it writes a plain text description and submits. The downstream auto-revise agent gets a vague brief like "add a neon glow to the headline" with no technical context.

**The fix is three-fold:**

1. **Teach Scout what's technically possible** (add animation catalog to system prompt)
2. **Give Scout a decision framework** for when to ask vs decide vs propose options
3. **Extend the brief schema** so animation briefs carry routing metadata for the pipeline

---

## 2. Animation Intent Signals

Scout should recognize animation requests from three signal categories:

### Category A: Explicit Animation Keywords

Direct references to specific effects or animation concepts.

| Signal | Example User Messages |
|--------|----------------------|
| Motion verbs | "animate", "fade in", "slide in", "zoom", "bounce", "spin", "rotate", "flip", "float", "drift", "pulse", "shimmer" |
| Effect names | "parallax", "neon glow", "typing animation", "typewriter", "particle", "counter animation", "count up", "scramble", "decode", "morph" |
| Interaction types | "hover effect", "on scroll", "when you scroll to it", "on click", "mouse follow", "cursor effect" |
| Technical terms | "GSAP", "ScrollTrigger", "transition", "keyframe", "easing" |

### Category B: Feeling/Vibe Language

Indirect requests that describe desired motion or energy without naming a technique.

| Signal | Example User Messages |
|--------|----------------------|
| Energy | "make it pop", "feels flat", "too static", "needs more life", "boring", "add some energy", "make it dynamic" |
| Mood | "feels dead", "needs movement", "more cinematic", "dramatic entrance", "should feel alive" |
| Comparison | "like those websites where things move as you scroll", "like apple.com", "I want that cool text effect" |

### Category C: Known Pattern References

References to specific proven patterns from existing builds.

| Signal | Maps To |
|--------|---------|
| "terminal", "typing in a terminal" | Terminal typing pattern |
| "cards that flip", "3D flip" | Card flip pattern |
| "letters scramble", "text decode" | Character decode pattern |
| "numbers count up", "animated stats" | Counter animation |
| "things float around", "floating shapes" | Feed fragments pattern |
| "follow my cursor", "cursor glow" | Cursor-following glow |
| "logo wall", "magnetic text" | Magnetic repulsion wall |
| "flowchart that draws itself" | SVG signal path |
| "light/dark sections", "section changes color" | Light section system |

---

## 3. Scout's Decision Framework

When Scout detects animation intent, it should follow this decision tree:

```
User message detected as animation request
│
├─ Is the request specific and maps to a known pattern?
│  │
│  ├─ YES → Confirm and submit brief with pattern metadata
│  │   Example: "stats that count up" → counter_animation
│  │   Scout: "animated counters — great for the traction section. submitting that now."
│  │
│  └─ NO → Is the request specific but NOT a known pattern?
│     │
│     ├─ YES → Propose closest alternatives from proven catalog
│     │   Example: "particle rain effect"
│     │   Scout: "we don't have a particle rain pattern, but here are some proven effects
│     │           that create a similar feeling: [options]"
│     │
│     └─ NO → Request is vague/feeling-based
│        │
│        ├─ Is the target section clear?
│        │  │
│        │  ├─ YES → Propose 2-3 specific options for that section type
│        │  │   Example: "the hero feels flat"
│        │  │   Scout: "a few ways to bring the hero to life:
│        │  │           a) character decode — letters scramble then lock into place
│        │  │           b) cursor-following glow on the grid background
│        │  │           c) slow background zoom with parallax"
│        │  │
│        │  └─ NO → Ask which section, then propose options
│        │      Example: "everything feels too static"
│        │      Scout: "which section feels most flat to you? I'll start there
│        │              and we can work through the rest."
│        │
│        └─ (After user picks an option → Submit brief with pattern metadata)
```

### The Key UX Principle

**Scout is a creative director, not a waiter.** When a client says "make it pop," Scout doesn't say "what do you mean by pop?" — it says "here are three ways to make this pop" and lets them pick. Scout should always bring options, not open-ended questions.

### When to Just Decide (No Questions)

- Request maps 1:1 to a standard pattern with no ambiguity
- "add parallax to the hero background" → parallax, hero section, done
- "make the stats count up" → counter animation, stats section, done
- "add a fade-in to the cards" → anim-fade class, card elements, done

### When to Propose Options (2-3 choices)

- Request has a clear section but vague effect
- "the hero needs something" → 3 hero-appropriate options
- "cards are boring" → tilt-on-hover, stagger entrance, flip interaction

### When to Ask First

- Request is global ("everything feels static") → ask which section to start with
- Request describes something impossible or problematic → explain tradeoff, propose alternative
- Request could mean very different things → "glow" could be neon text glow, cursor glow, or section background glow — ask

---

## 4. Extended Animation Brief Schema

When Scout creates a brief with `change_type: "animation"`, it should include additional metadata. This is passed via the `description` field as structured prose (not a separate schema field — keeps the tool schema simple and avoids a migration).

### Brief Description Format for Animation

Scout should write the brief description in this structured format:

```
[Animation Type]: <category>
[Pattern]: <reference_pattern or "custom">
[Target]: <CSS selector or element description>
[Trigger]: <scroll | hover | click | load | ambient>
[Complexity]: <trivial | simple | moderate | complex | very_complex>
[Mobile]: <same | simplified | disabled>
[Files]: <css_only | html_css | js_heavy | full_section>

<Human-readable description of what the animation should do>
```

### Example Briefs

**Clear request (counter animation):**
```
section_id: "traction"
change_type: "animation"
priority: "high"
description: |
  [Animation Type]: scroll_behavior
  [Pattern]: counter_animation
  [Target]: .stat-val elements with data-count attributes
  [Trigger]: scroll
  [Complexity]: trivial
  [Mobile]: same
  [Files]: html_css

  Animate the metric numbers to count up from 0 when the
  traction section scrolls into view. Use the existing
  data-count, data-prefix, data-suffix attribute pattern.
```

**Vague request resolved to option (hero decode):**
```
section_id: "hero"
change_type: "animation"
priority: "medium"
description: |
  [Animation Type]: text_effect
  [Pattern]: character_decode
  [Target]: .hero-title text
  [Trigger]: load
  [Complexity]: complex
  [Mobile]: simplified (fewer cycles, faster lock-in)
  [Files]: js_heavy

  Add character decode animation to the hero title.
  Letters should rapidly cycle through random glyphs
  then lock into place left-to-right. Color flash on
  lock using the accent color. On reduced-motion,
  show text immediately without animation.
```

**Ambitious request with creative direction:**
```
section_id: "hero"
change_type: "animation"
priority: "medium"
description: |
  [Animation Type]: ambient
  [Pattern]: cursor_glow
  [Target]: .hero-grid-bg radial gradient
  [Trigger]: ambient
  [Complexity]: complex
  [Mobile]: simplified (ambient drift instead of cursor follow)
  [Files]: js_heavy

  Add cursor-following glow effect on the hero grid
  background. Desktop: radial gradient follows mouse
  position via GSAP ticker. Mobile: ambient drift loop
  with random positions, tap-to-move override.
  Use pointer:coarse media query for touch detection.
  Read dimensions fresh inside callbacks, not at init.
```

---

## 5. Animation Catalog for Scout's System Prompt

Scout needs to know what's technically possible so it can propose real options, not fantasy effects. This catalog is added to the `<pitchapp_knowledge>` block.

### Proven Animations (What Scout Can Confidently Offer)

**Text Effects:**
- Character decode — letters scramble then lock into place (hero titles, section headlines)
- Counter animation — numbers count up from 0 on scroll (metrics, stats)
- Typing animation — character-by-character typing in a terminal-style container

**Image Treatments:**
- Parallax — background image shifts on scroll (any section with background)
- Clip-path reveal — image reveals via expanding clip-path (split image+text)
- Slow zoom — image scales up subtly on scroll (hero, background-statement)
- Video background — autoplay muted loop with overlay dimming (hero)

**Scroll Behaviors:**
- Fade-in on scroll — elements fade up as they enter viewport (universal)
- Staggered entrance — elements appear one after another with delay (cards, lists, grids)
- Content lift — section content parallaxes at different rate than background

**Interaction Patterns:**
- Card tilt — 3D perspective rotation on mouse hover (product cards, any card grid)
- Card flip — full 3D flip revealing back content (case studies, equation cards)
- Cursor-following glow — radial gradient tracks mouse (hero, ambient)
- Magnetic repulsion — elements push away from cursor (logo walls, text)

**Ambient Effects:**
- Floating fragments — shapes drift upward with lens spotlight (hero atmosphere)
- Grid background with glow — CSS grid lines with radial cursor glow (abstract hero)
- Flame/ember loader — CSS-only fire animation (page loader, section accent)
- Dot matrix overlay — subtle pattern overlay (video hero, statements)

**Section-Level:**
- Light section system — sections switch between dark/light palettes, nav adapts
- SVG flowchart draw — paths animate their stroke revealing a process flow
- Contact overlay modal — backdrop blur modal with slide-up animation

### Off-Menu Requests (How Scout Should Handle)

When a client asks for something not in the catalog:

1. **Acknowledge the creative intent** — don't dismiss it
2. **Translate to the closest proven pattern** — "that's similar to our character decode effect"
3. **If nothing close exists**, be honest: "that would be a custom build — here's what we have that creates a similar feeling"
4. **Never promise custom animations** without flagging complexity: "a custom particle system is doable but it's a bigger build — want me to brief it as a custom request?"

---

## 6. Routing: Pipeline Integration

### Current Flow (All Briefs Same Path)

```
Scout submit_edit_brief
  → scout_messages.edit_brief_json
  → status → "revision" + 5min cooldown
  → auto-brief job (pulls briefs)
  → auto-revise job (generic LLM agent applies all briefs)
  → auto-push job (deploys)
```

### Proposed Flow (Animation Briefs Routed Separately)

```
Scout submit_edit_brief
  → scout_messages.edit_brief_json
  → status → "revision" + 5min cooldown
  → auto-brief job (pulls + classifies briefs)
  │
  ├─ Standard briefs (copy, layout, design, image_swap, etc.)
  │  → auto-revise job (existing generic agent)
  │
  └─ Animation briefs (change_type === "animation")
     → auto-revise-animation job (animation specialist agent)
     │
     ├─ Parses [Pattern] metadata from description
     ├─ Loads relevant reference code from pattern library
     ├─ Has GSAP/ScrollTrigger/CSS animation knowledge
     ├─ Gets additional tools: read_reference_pattern, validate_animation
     └─ Applies animation with mobile fallback + reduced-motion support
```

### Splitting Logic (In auto-brief Handler)

The `auto-brief` job already parses briefs into structured data. Add a classification step:

```
parsed briefs
  → partition into { standard_briefs, animation_briefs }
  → if standard_briefs.length > 0: create auto-revise job with standard_briefs
  → if animation_briefs.length > 0: create auto-revise-animation job with animation_briefs
  → if both: auto-revise-animation blocks on auto-revise
     (text changes first, then animations on top — avoids conflicts)
```

### Why Separate Jobs (Not Just a Smarter Single Agent)

1. **Different system prompt** — animation agent needs GSAP conventions, pattern library, gotchas
2. **Different tool set** — animation agent needs `read_reference_pattern` to load proven code
3. **Different model budget** — animation changes are more complex, may need more turns
4. **Ordering** — text/layout changes should apply first, then animations layer on top
5. **Cost tracking** — separate job = separate cost attribution for animation work

---

## 7. Scout System Prompt Changes

### New Block: `<animation_capabilities>`

Added to `buildSystemPrompt()` when project status is in `["review", "revision", "live"]`:

```
<animation_capabilities>
when a client asks about animation, motion, or effects, you have a catalog
of proven patterns. always propose from this catalog first — these are
battle-tested and work reliably across devices.

## what you can confidently offer

text effects:
- character decode (letters scramble → lock in place)
- counter animation (numbers count up on scroll)
- terminal typing (character-by-character in terminal container)

image treatments:
- parallax (background shifts on scroll)
- clip-path reveal (image expands into view)
- slow zoom (subtle scale on scroll)
- video background (autoplay loop with overlay)

scroll behaviors:
- fade-in on scroll (universal, any element)
- staggered entrance (cards/lists appear sequentially)
- content lift (parallax layering within section)

interactions:
- card tilt (3D perspective on hover)
- card flip (front/back reveal on hover/tap)
- cursor-following glow (radial gradient tracks mouse)
- magnetic repulsion (elements push away from cursor)

ambient:
- floating fragments (shapes drift upward)
- grid glow (CSS grid + cursor-following radial)
- flame/ember (CSS-only fire animation)

section-level:
- light/dark switching (sections alternate palette, nav adapts)
- SVG path draw (flowchart lines animate in)
- overlay modal (backdrop blur + slide-up)

## decision framework

1. specific + known pattern → confirm and brief immediately
2. specific + unknown pattern → propose closest alternatives
3. vague feeling ("make it pop") → propose 2-3 options for the target section
4. no target section → ask which section, then propose options
5. off-menu request → acknowledge intent, translate to closest pattern, flag if truly custom

## briefing animation changes

when submitting animation briefs, structure the description with metadata:
- animation type (text_effect, image_treatment, scroll_behavior, interaction, ambient, section_animation)
- pattern name (from catalog above, or "custom")
- target elements
- trigger (scroll, hover, click, load, ambient)
- complexity (trivial, simple, moderate, complex, very_complex)
- mobile approach (same, simplified, disabled)
- file scope (css_only, html_css, js_heavy, full_section)

this metadata helps the animation build team pick the right implementation approach.
</animation_capabilities>
```

### Updated Edit Brief Protocol

The existing `<edit_brief_protocol>` block gets a small addition:

```
for animation changes specifically:
- always use change_type "animation" (never "design" or "layout" for motion/effects)
- include structured metadata in the description (animation type, pattern, target, trigger, complexity, mobile, files)
- if the request is vague, propose 2-3 specific options before submitting
- if the request is truly custom (not in the proven catalog), note this explicitly
```

---

## 8. Example Conversations

### Example 1: Clear Request → Direct Brief

```
User: Can you make the stats count up when you scroll to them?

Scout: animated counters — love that for the traction section. the numbers
       will count up from zero when you scroll down to them. want me to
       submit that?

User: Yes

Scout: [calls submit_edit_brief]
       brief submitted. the build team will add scroll-triggered counters
       to all the metrics in section 4.
```

Brief created:
```json
{
  "summary": "Add counter animation to traction metrics",
  "changes": [{
    "section_id": "traction",
    "change_type": "animation",
    "description": "[Animation Type]: scroll_behavior\n[Pattern]: counter_animation\n[Target]: .stat-val elements\n[Trigger]: scroll\n[Complexity]: trivial\n[Mobile]: same\n[Files]: html_css\n\nAnimate metric numbers to count up from 0 when the traction section scrolls into view.",
    "priority": "medium"
  }]
}
```

### Example 2: Vague Request → Options → Brief

```
User: The hero feels kind of flat. Can you make it more interesting?

Scout: a few directions for the hero —

       a) character decode on the headline. letters scramble through random
          glyphs then lock into place left-to-right. creates a tech-forward,
          intentional reveal.

       b) cursor-following glow on the grid background. a soft radial light
          follows your mouse. on mobile it drifts on its own and responds
          to taps.

       c) slow parallax zoom on the background image. subtle enough to feel
          cinematic without being distracting.

       which direction feels right?

User: The scramble thing sounds cool

Scout: character decode on the hero title — nice choice. it'll cycle through
       random characters then snap into place, with a subtle color flash
       using your accent color. reduced-motion users see the text immediately.
       want me to submit?

User: Do it

Scout: [calls submit_edit_brief]
       done. the build team will add the character decode animation to your
       hero headline.
```

### Example 3: Off-Menu Request → Redirect

```
User: I want some crazy particle effects raining down the whole page

Scout: full-page particles are possible but they tend to fight with readability
       and kill mobile performance. here's what creates a similar energy without
       the tradeoffs —

       a) floating feed fragments in the hero — shapes drift upward with a
          lens spotlight effect. creates atmosphere without covering content.

       b) rising ember particles behind a flame loader — contained to the
          loader section, very cinematic.

       c) cursor-following glow on the grid background — responsive and
          premium-feeling. stays out of the way of your content.

       any of these land?

User: The floating shapes thing sounds interesting. But just in the hero?

Scout: right — contained to the hero so it creates atmosphere for the opening
       without competing with the rest of the content. shapes drift up slowly,
       and on desktop there's a spotlight effect where your cursor brightens
       nearby fragments. want to go with that?

User: Yeah let's try it

Scout: [calls submit_edit_brief]
       submitted. this one's a more complex animation so it may take a bit
       longer to build, but the build team has a proven pattern for it.
```

### Example 4: Multiple Changes, Mixed Types

```
User: Can you change the headline to "Building the Future of Commerce" and
      also add some kind of cool animation to it?

Scout: got it — two changes for the hero:

       1. headline copy → "Building the Future of Commerce"
       2. animation — a few options for the reveal:
          a) character decode (letters scramble then lock in)
          b) fade-up with a slight scale (simple and clean)
          c) word-by-word reveal on a slight delay (builds anticipation)

       which animation style?

User: The fade-up one, keep it simple

Scout: [calls submit_edit_brief with two changes]
       submitted — copy change plus a clean fade-up animation on the
       hero headline. two separate briefs for the build team.
```

Brief created:
```json
{
  "summary": "Update hero headline copy and add fade-up animation",
  "changes": [
    {
      "section_id": "hero",
      "change_type": "copy",
      "description": "Change hero headline to \"Building the Future of Commerce\"",
      "priority": "high"
    },
    {
      "section_id": "hero",
      "change_type": "animation",
      "description": "[Animation Type]: text_effect\n[Pattern]: anim_fade\n[Target]: .hero-title\n[Trigger]: load\n[Complexity]: trivial\n[Mobile]: same\n[Files]: css_only\n\nAdd fade-up entrance animation to the hero headline. Simple opacity 0 → 1 with slight upward translate. Use CSS .anim-fade class pattern.",
      "priority": "medium"
    }
  ]
}
```

---

## 9. Implementation Summary

### Changes Required

| Component | Change | Complexity |
|-----------|--------|------------|
| `src/lib/scout/knowledge.ts` | Add `ANIMATION_CATALOG` constant | Low |
| `src/lib/scout/context.ts` | Add `<animation_capabilities>` block to system prompt | Low |
| `src/lib/scout/context.ts` | Update `<edit_brief_protocol>` with animation guidance | Low |
| `scripts/cron/pipeline-executor.mjs` | Add brief classification in `auto-brief` handler | Medium |
| `scripts/cron/pipeline-executor.mjs` | Add `handleAutoReviseAnimation()` handler | High |
| `scripts/cron/pipeline-executor.mjs` | Add job ordering (text first, then animation) | Medium |

### What Does NOT Change

- `submit_edit_brief` tool schema — no new fields, metadata goes in `description`
- `scout_messages` table — no migration needed
- `EditChange` type — `change_type: "animation"` already exists
- Scout UI — no frontend changes
- Approval watcher — `auto-revise-animation` follows same approval rules

### Migration Strategy

1. **Phase 1:** Add animation catalog to Scout's system prompt. Scout starts writing richer animation briefs immediately. No pipeline changes needed — existing auto-revise handles them (just better-described now).

2. **Phase 2:** Add brief classification + animation specialist agent to pipeline. Animation briefs get routed to specialist with reference patterns and GSAP knowledge.

3. **Phase 3:** Add `read_reference_pattern` tool so animation agent can pull proven code from existing builds (bonfire, shareability, onin) as implementation references.

---

## 10. Open Questions

1. **Should Scout show a preview of what an animation looks like?** Could use `view_screenshot` to show a reference PitchApp with that pattern, but adds latency and token cost. Recommendation: not for v1 — Scout's text descriptions are sufficient.

2. **Should animation briefs have a higher cost cap?** Complex animations (feed fragments, flowcharts) take more turns than a text edit. Recommendation: yes, `auto-revise-animation` gets 15 turns max vs 10 for standard.

3. **Should the animation agent have access to the full CONVENTIONS.md?** It's 30K+ characters. Recommendation: no — give it only the relevant proven pattern section, loaded dynamically based on the `[Pattern]` metadata in the brief.

4. **Mixed briefs with dependencies** — if a user says "change the headline and animate it," the text change needs to land first, then the animation targets the new text. The ordering (standard briefs → animation briefs, animation blocked on standard) handles this. Any edge cases?
