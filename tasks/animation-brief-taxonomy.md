# Animation Brief Classification Taxonomy

**Status:** Draft v1
**Author:** Architect Agent
**Date:** 2026-02-13

---

## 1. Overview

This taxonomy classifies animation requests from Scout into categories that the pipeline can route, estimate complexity, and execute. It extends the existing `EditChange` model (which currently supports `change_type: "animation"` as a flat string) with structured animation metadata.

The goal: when a user tells Scout "make the headline do a neon flicker" or "add parallax to the background image," Scout can classify the request, attach the right metadata, and the pipeline can route it to the correct handler with the right context.

---

## 2. Animation Categories

Six top-level categories, each with subcategories. Categories are organized by *what is being animated*, not by implementation technique.

### 2.1 Text Effects

Animations applied to text elements (headlines, labels, titles).

| Subcategory | Description | Example User Requests | GSAP Complexity | Reference |
|------------|-------------|----------------------|-----------------|-----------|
| `text.decode` | Character scramble/decode reveal | "make the title decode like a cipher", "scramble the headline" | Medium | Shareability `decodeTitle()` |
| `text.typewriter` | Character-by-character typing | "type out the text like a terminal", "typewriter effect on the tagline" | Medium | Bonfire `typeLines()` |
| `text.counter` | Animated number counting | "animate the metrics", "count up to 135M" | Low | Standard `data-count` pattern |
| `text.split_reveal` | Per-character or per-word staggered reveal | "reveal words one at a time", "each letter fades in separately" | Medium | Custom (SplitText or manual) |
| `text.gradient_shift` | Animated gradient on text fill | "make the title shimmer", "gradient text animation" | Low | CSS `background-clip: text` + keyframes |
| `text.glow` | Pulsing or flickering glow on text | "neon sign effect", "make it glow", "pulsing headline" | Low | CSS `text-shadow` + keyframes or GSAP |

### 2.2 Image & Media Treatments

Animations applied to images, videos, or background layers.

| Subcategory | Description | Example User Requests | GSAP Complexity | Reference |
|------------|-------------|----------------------|-----------------|-----------|
| `image.parallax` | Background image shifts on scroll | "add parallax to the background", "make the image move on scroll" | Low | Standard `y: 15%`, scrub 1.5 |
| `image.clip_reveal` | Image revealed via clip-path animation | "wipe the image in from the left", "reveal the photo" | Low | Standard `inset(0 100% 0 0)` → `none` |
| `image.zoom` | Scale-in or zoom on scroll/reveal | "zoom into the hero image", "Ken Burns effect" | Low | Standard `scale(1.08)` → `scale(1)` |
| `image.filter_shift` | Animated filter transitions (saturation, blur, brightness) | "desaturate on scroll", "blur to sharp reveal" | Low | GSAP filter tweens |
| `video.hero` | Video background with overlay treatment | "use this video as the hero background", "add a sizzle reel" | Medium | Shareability video hero pattern |
| `video.inline` | Embedded video with scroll-triggered play | "play the video when you scroll to it" | Medium | ScrollTrigger + `video.play()` |

### 2.3 Scroll Behaviors

Animations driven by scroll position (beyond standard fade-in).

| Subcategory | Description | Example User Requests | GSAP Complexity | Reference |
|------------|-------------|----------------------|-----------------|-----------|
| `scroll.fade_in` | Standard scroll-triggered fade-up | "fade in on scroll", "animate the sections in" | Low | Standard `.anim-fade` |
| `scroll.stagger` | Sequential reveal of sibling elements | "stagger the cards", "reveal items one by one" | Low | Standard `idx * 0.12` |
| `scroll.slide` | Horizontal slide-in from left/right | "slide from the left", "enter from the right" | Low | Standard list/summary patterns |
| `scroll.scale_in` | Scale from small to full on scroll | "scale up the gallery cards", "zoom in on scroll" | Low | Standard `scale(0.92)` → `scale(1)` |
| `scroll.pin` | Pin element while content scrolls through | "pin the headline while the cards scroll", "sticky section" | High | ScrollTrigger `pin: true` |
| `scroll.horizontal` | Horizontal scroll section | "horizontal scrolling gallery", "side-scroll the cards" | High | ScrollTrigger horizontal scroll |
| `scroll.progress_draw` | SVG path draws as user scrolls | "draw the line as you scroll", "progress line animation" | Medium | Shareability signal path `strokeDashoffset` |

### 2.4 Interaction Patterns

Animations triggered by user interaction (hover, click, cursor movement).

| Subcategory | Description | Example User Requests | GSAP Complexity | Reference |
|------------|-------------|----------------------|-----------------|-----------|
| `interact.tilt` | 3D card tilt on mousemove | "make the cards tilt on hover", "3D perspective effect" | Medium | Bonfire `transformPerspective: 800` |
| `interact.flip` | 3D card flip on hover/tap | "flip the cards to show the back", "card flip on click" | Medium | Shareability case study + equation cards |
| `interact.magnetic` | Cursor repulsion/attraction on elements | "make the logos push away from the cursor", "magnetic hover" | High | Shareability client wall |
| `interact.cursor_glow` | Glow/spotlight follows cursor | "spotlight effect that follows the mouse", "cursor glow" | Medium | Bonfire hero glow |
| `interact.hover_scale` | Scale/saturate change on hover | "zoom on hover", "brighten the image on hover" | Low | Standard card hover pattern |
| `interact.modal` | Overlay/modal with backdrop blur | "popup contact form", "modal on click" | Medium | Shareability contact overlay |

### 2.5 Ambient & Atmospheric

Continuous or looping effects that create atmosphere.

| Subcategory | Description | Example User Requests | GSAP Complexity | Reference |
|------------|-------------|----------------------|-----------------|-----------|
| `ambient.particles` | Floating particle/fragment effects | "add floating elements in the background", "particle effect" | High | Shareability feed fragments |
| `ambient.grid` | Animated grid/line background | "add a subtle grid background", "matrix grid effect" | Medium | Bonfire CSS grid hero |
| `ambient.grain` | Film grain overlay texture | "add film grain", "add texture to the page" | Low | Shareability SVG `fractalNoise` |
| `ambient.dot_matrix` | Repeating dot pattern background | "add a dot pattern", "halftone dots in the background" | Low | Shareability `radial-gradient` dots |
| `ambient.gradient` | Animated gradient backgrounds | "shifting gradient background", "aurora effect" | Low-Medium | CSS keyframes or GSAP |
| `ambient.loader` | Branded loading animation | "custom loading screen", "flame loader like bonfire" | Medium | Bonfire CSS flame loader |

### 2.6 Section-Level Compositions

Pre-composed animation systems that apply to entire sections. These are higher-order — they combine multiple techniques from above.

| Subcategory | Description | Example User Requests | GSAP Complexity | Reference |
|------------|-------------|----------------------|-----------------|-----------|
| `section.terminal` | Full terminal typing section | "add a terminal section", "command line style display" | High | Bonfire terminal |
| `section.flowchart` | SVG-drawn process visualization | "animated flowchart", "process diagram that draws itself" | High | Shareability signal path |
| `section.hero_reveal` | Complete hero entrance sequence (timeline) | "cinematic hero opening", "dramatic hero entrance" | Medium | Standard hero timeline |
| `section.light_switch` | Toggle section to light palette with nav adaptation | "make this section light/white", "contrast section" | Medium | Shareability light section system |
| `section.product_grid` | Product cards with tilt + stagger reveal | "product showcase grid", "OS-style dashboard cards" | Medium | Bonfire product grid |

---

## 3. Complexity Levels

Each animation has a complexity rating that informs effort estimation and routing.

| Level | Definition | Estimated Build Time | Routing |
|-------|-----------|---------------------|---------|
| **Low** | CSS-only or single GSAP tween. Standard patterns with known templates. | <15 min | `auto-revise` (standard handler) |
| **Medium** | Multiple coordinated tweens, ScrollTrigger with custom config, or mobile-specific fallbacks needed. | 15-45 min | `auto-revise` with animation context |
| **High** | Custom JS logic, GSAP ticker loops, complex state management, or significant new HTML/CSS structure. | 45+ min | `auto-animate` (specialist handler) |

---

## 4. Data Model Extension

### 4.1 Current `EditChange` (unchanged)

```typescript
interface EditChange {
  section_id: string;
  change_type: string;          // "copy" | "layout" | "animation" | "design" | ...
  description: string;
  priority?: string;
  asset_references?: AssetReference[];
}
```

### 4.2 New: `AnimationSpec` (attached when `change_type === "animation"`)

```typescript
interface AnimationSpec {
  /** Category.subcategory from taxonomy (e.g., "text.decode", "scroll.pin") */
  animation_type: string;

  /** Low | Medium | High — informs routing and effort estimation */
  complexity: "low" | "medium" | "high";

  /** Which element(s) the animation targets */
  target: {
    /** CSS selector or semantic description */
    selector: string;
    /** What type of element: "headline", "background", "card", "section", etc. */
    element_type: string;
  };

  /** Timing preferences expressed by the user (optional) */
  timing?: {
    /** "on_scroll" | "on_load" | "on_hover" | "on_click" | "continuous" */
    trigger: string;
    /** User-expressed speed preference: "fast", "slow", "dramatic", "subtle" */
    feel?: string;
  };

  /** For animations that need assets (videos, SVGs, images) */
  asset_requirements?: {
    /** What kind of asset is needed */
    type: "video" | "image" | "svg" | "none";
    /** Whether the user has already provided it or it needs to be sourced */
    status: "provided" | "needs_sourcing" | "not_needed";
  };

  /** Reference to a known pattern from the codebase (for the builder) */
  pattern_reference?: {
    /** App that has this pattern */
    source_app: string;
    /** Function or section to reference */
    reference: string;
  };

  /** Mobile behavior specification */
  mobile_behavior?: "same" | "simplified" | "disabled" | "alternative";

  /** Accessibility note — how this respects prefers-reduced-motion */
  reduced_motion_behavior?: string;
}
```

### 4.3 Extended `EditChange` for Animation Briefs

```typescript
interface EditChange {
  section_id: string;
  change_type: string;
  description: string;
  priority?: string;
  asset_references?: AssetReference[];

  /** Present only when change_type === "animation" */
  animation_spec?: AnimationSpec;
}
```

This is a backward-compatible extension. Existing briefs without `animation_spec` continue to work. The pipeline checks for its presence to decide routing.

---

## 5. Scout Intent Mapping

How Scout maps natural language to taxonomy categories. This is used in the detection prompt, not as code logic.

### 5.1 Signal Words → Category

| Signal Words/Phrases | Maps To | Notes |
|---------------------|---------|-------|
| "decode", "cipher", "scramble", "unscramble" | `text.decode` | |
| "type", "typewriter", "terminal", "command line" | `text.typewriter` or `section.terminal` | Disambiguate: text-only vs full terminal section |
| "count", "animate the numbers", "counter" | `text.counter` | |
| "neon", "glow", "pulse", "flicker" | `text.glow` | |
| "parallax", "depth", "moves on scroll" | `image.parallax` | |
| "wipe", "reveal", "slide in the image" | `image.clip_reveal` | |
| "zoom", "Ken Burns", "push in" | `image.zoom` | |
| "video background", "sizzle reel" | `video.hero` | Requires asset |
| "fade in", "appear on scroll" | `scroll.fade_in` | Low complexity, standard |
| "stagger", "one by one", "sequential" | `scroll.stagger` | |
| "pin", "sticky", "stays while scrolling" | `scroll.pin` | High complexity flag |
| "horizontal scroll", "side scroll" | `scroll.horizontal` | High complexity flag |
| "tilt", "3D", "perspective" | `interact.tilt` | |
| "flip", "card flip", "two sides" | `interact.flip` | |
| "magnetic", "push away", "repel" | `interact.magnetic` | |
| "spotlight", "cursor light", "follow mouse" | `interact.cursor_glow` | |
| "floating", "fragments", "particles" | `ambient.particles` | High complexity |
| "grid background", "matrix" | `ambient.grid` | |
| "grain", "texture", "film" | `ambient.grain` | |
| "dots", "halftone", "dot pattern" | `ambient.dot_matrix` | |
| "loading", "loader", "splash screen" | `ambient.loader` | |
| "flowchart", "process diagram", "draw the path" | `section.flowchart` | |
| "light section", "white background", "bright section" | `section.light_switch` | |

### 5.2 Ambiguity Resolution

Some requests are ambiguous. Scout should ask clarifying questions when:

| Ambiguous Request | Possible Interpretations | Clarifying Question |
|-------------------|------------------------|-------------------|
| "animate the hero" | `section.hero_reveal` (enhance entrance) vs specific element within hero | "Do you want to change how the hero opens, or add an effect to a specific element like the title or background?" |
| "make it more dynamic" | Could be any category | "What part feels static? The text, the images, or the overall scroll experience?" |
| "add some movement" | Ambient vs scroll behavior | "Are you thinking of a subtle background effect, or something that reacts to scrolling?" |
| "terminal effect" | `text.typewriter` (on existing text) vs `section.terminal` (new section) | "Do you want the existing text to type out, or should I add a full terminal-style section?" |

---

## 6. Complexity Estimation Rules

Scout uses these rules to estimate complexity before submitting the brief.

### 6.1 Automatic Low Complexity
- Standard `.anim-fade` adjustments (timing, direction)
- Counter animations (`data-count` changes)
- Hover effects (scale, saturate, color shifts)
- Background image parallax
- Film grain or dot matrix overlays

### 6.2 Automatic High Complexity
- ScrollTrigger `pin: true` (pinning)
- Horizontal scroll sections
- Feed fragments / particle systems
- Magnetic cursor repulsion
- Full terminal typing sections
- SVG path draw flowcharts
- Any animation requiring new HTML section structure

### 6.3 Medium (Default)
Everything else defaults to Medium. This includes:
- Character decode / typewriter on existing text
- 3D card tilt or flip
- Cursor-following glow
- Clip-path reveals
- Video hero setup
- Light section system toggle
- Custom stagger timing or sequencing

### 6.4 Complexity Escalation
If a single brief contains 3+ animation changes, bump the overall brief complexity up one level (Low → Medium, Medium → High). This accounts for integration effort.

---

## 7. Pipeline Routing Decision Tree

```
EditChange received
  └─ change_type === "animation"?
      ├─ NO → existing handler (copy/layout/design/etc.)
      └─ YES → check animation_spec
          ├─ animation_spec missing → treat as Medium, route to auto-revise with animation flag
          └─ animation_spec present
              ├─ complexity === "low" → auto-revise (standard handler, animation context injected)
              ├─ complexity === "medium" → auto-revise (standard handler, animation context + pattern refs)
              └─ complexity === "high" → auto-animate (specialist handler, full CONVENTIONS.md context)
```

---

## 8. Relationship to Existing System

### What Doesn't Change
- `submit_edit_brief` tool signature (changes array with `change_type` enum)
- `EditChange` base interface (backward compatible)
- `edit_brief_json` column in `scout_messages` (JSONB accepts the extension)
- Pipeline job claim/execute flow

### What Extends
- `change_type` enum: `"animation"` already exists — now it carries richer metadata
- `EditChange` gains optional `animation_spec` field
- Pipeline executor gains `auto-animate` job handler (or enhanced `auto-revise`)
- Scout system prompt gains taxonomy awareness for classification

### New Additions Needed
- `AnimationSpec` TypeScript interface in `types/database.ts`
- Animation-aware context injection in the revise handler
- Scout detection logic for animation requests (Task #2)
- Animation specialist agent prompt (Task #3)
- Pipeline routing changes (Task #4)

---

## 9. Example: End-to-End Flow

**User says to Scout:** "Can you make the hero title do that cool decode effect like the letters scramble?"

**Scout classifies:**
```json
{
  "section_id": "hero",
  "change_type": "animation",
  "description": "Apply character decode/scramble animation to the hero title text. Characters should cycle through random glyphs before resolving to the correct letter, cascading left to right.",
  "priority": "medium",
  "animation_spec": {
    "animation_type": "text.decode",
    "complexity": "medium",
    "target": {
      "selector": ".hero-title-main",
      "element_type": "headline"
    },
    "timing": {
      "trigger": "on_load",
      "feel": "dramatic"
    },
    "asset_requirements": {
      "type": "none",
      "status": "not_needed"
    },
    "pattern_reference": {
      "source_app": "shareability",
      "reference": "decodeTitle() in js/app.js"
    },
    "mobile_behavior": "same",
    "reduced_motion_behavior": "Skip animation, show text immediately via gsap.set()"
  }
}
```

**Pipeline routes:** complexity = medium → `auto-revise` with animation context. Builder gets the `AnimationSpec` plus a pointer to the Shareability reference implementation.
