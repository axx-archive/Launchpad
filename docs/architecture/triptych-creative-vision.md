# The Triptych: Full Creative Vision
## Launchpad Three-Department Experience

> Product Lead (Creative/Visionary) — the theatrical, visual, and experiential design
> for the full studios platform. This is NOT an MVP scope-cut. This is the vision.

---

## The Big Idea: A Triptych, Not a Dashboard

A triptych is a three-panel artwork — the format used in Renaissance altarpieces, where each panel tells part of a larger story and the whole is greater than its parts. That's the metaphor for Launchpad's home screen.

Today, Launchpad has one door. You walk in, you create a mission, it becomes a PitchApp. The home screen is a project list — functional but linear. A hallway.

The triptych turns that hallway into a **cathedral**. Three towering panels. Each one a portal into a different kind of creative work. The user stands in front of them, and the question isn't "what's my project status?" — it's **"what kind of work am I doing today?"**

This isn't a navigation pattern. It's a moment. The first time a user sees the triptych should feel like opening the doors to something bigger than they expected.

---

## The Home Screen: The Triptych

### Layout

Three full-height panels, side by side, dividing the screen into thirds. On desktop, they literally fill the viewport — no nav bar on initial load, no header, no chrome. Just three vertical worlds.

```
┌─────────────────┬─────────────────┬─────────────────┐
│                  │                 │                  │
│                  │                 │                  │
│   INTELLIGENCE   │    CREATIVE     │    STRATEGY      │
│                  │                 │                  │
│   ░░░░░░░░░░░   │    ▓▓▓▓▓▓▓▓    │   ░░░░░░░░░░░   │
│   ░░ signal ░░   │    ▓ forge ▓    │   ░ warroom ░   │
│   ░░░░░░░░░░░   │    ▓▓▓▓▓▓▓▓    │   ░░░░░░░░░░░   │
│                  │                 │                  │
│   ┌──────────┐   │   ┌──────────┐  │   ┌──────────┐  │
│   │ INT      │   │   │ CRE      │  │   │ STR      │  │
│   │          │   │   │          │  │   │          │  │
│   │ signals  │   │   │ builds   │  │   │ research │  │
│   │ trends   │   │   │ deploys  │  │   │ briefs   │  │
│   │ reports  │   │   │ stories  │  │   │ strategy │  │
│   └──────────┘   │   └──────────┘  │   └──────────┘  │
│                  │                 │                  │
│   $ enter ▊      │   $ enter ▊     │   $ enter ▊     │
│                  │                 │                  │
│   2 active       │   5 active      │   1 active      │
│                  │                 │                  │
└─────────────────┴─────────────────┴─────────────────┘
```

### The Hover State: Panel Expansion

When the user hovers over a panel, it **expands** — taking ~50% width while the other two compress to ~25% each. This is the triptych interaction: hover left, the left panel breathes open and reveals more of its world. The transition is smooth (GSAP or CSS `transition: flex 0.6s var(--ease-out)`).

On expansion, the panel reveals:
- A brief description of the studio's personality
- A live activity indicator (if work is happening)
- The `$ enter` terminal prompt becomes visually prominent
- The background intensifies — the ambient effects (glow, particles, grid) become more visible

On de-hover, all three panels return to equal thirds. The resting state is balanced, tense — three worlds held in equilibrium.

### The Panel Visual Language

Each panel has its own ambient background — not images, but generative/CSS effects that establish mood without loading assets:

| Panel | Background Effect | Energy |
|-------|-------------------|--------|
| **Intelligence** | Dot matrix radar sweep — concentric circles with a rotating scan line, data points pulsing in/out at random positions. Think: a radar screen or network visualization. | Cool, analytical, scanning |
| **Creative** | Bonfire flame particles — rising ember dots with a warm glow center, the signature bonfire animation adapted from the loader. Think: creative energy, warmth, production. | Warm, theatrical, alive |
| **Strategy** | Topographic contour lines — layered translucent lines that shift with parallax on mouse move, like a terrain map. Think: depth, layers of understanding, strategic landscape. | Measured, layered, deliberate |

These backgrounds are LOW intensity at rest (opacity ~0.08-0.12). On hover, they intensify to ~0.2-0.3. They're atmospheric, not distracting.

### The Greeting

Above the triptych, a thin greeting strip:

```
launchpad                                              aj hart
                         good evening.
```

Cormorant Garamond, `text-3xl`, understated. Time-aware. One line. No "Welcome back!" — just a quiet acknowledgment. The user's name is in the top-right corner as a small `font-mono` link (to settings/sign out).

Below the triptych, a thin activity strip:

```
── recent ──  [INT] market sizing report — 2h ago  ·  [CRE] ONIN pitch deck — in build  ·  [STR] positioning brief — ready
```

`font-mono`, `text-xs`, scrollable on mobile. Each pill is clickable, goes directly to that project. This gives "recent activity" without needing a full project list on the home screen.

### Mobile: The Stacked Triptych

On mobile (< 768px), the three panels stack vertically. Each panel becomes a full-width card with ~30vh height. The same hover expansion becomes a tap-to-expand interaction — tapping a panel expands it to show the full description, then a second tap enters the studio.

The panels keep their ambient backgrounds but simplified (fewer particles, static gradients instead of animations) for performance.

```
┌─────────────────────────────┐
│  INT · intelligence         │
│                             │
│  signals, trends, reports   │
│                             │
│  $ enter ▊     2 active     │
├─────────────────────────────┤
│  CRE · creative             │
│                             │
│  narrative → build → deploy │
│                             │
│  $ enter ▊     5 active     │
├─────────────────────────────┤
│  STR · strategy             │
│                             │
│  research, briefs, strategy │
│                             │
│  $ enter ▊     1 active     │
└─────────────────────────────┘
```

---

## The Three Color Worlds

Each studio shifts the Launchpad palette. The base dark background stays, but the accent color and ambient lighting change. This is the "different rooms" feeling — you're in the same building, but the light has changed.

### Intelligence: Cool Blue

```css
/* Intelligence palette — borrowed from Shareability DNA */
--studio-accent:       #4D8EFF;   /* Shareability blue */
--studio-accent-light: #7DAAFF;
--studio-accent-dim:   rgba(77, 142, 255, 0.12);
--studio-glow:         rgba(77, 142, 255, 0.06);
```

Why Shareability blue: Intelligence IS Shareability rebuilt as AI. The blue is their DNA — cool, analytical, digital. It signals "this is where the data lives." The Shareability PitchApp already established this palette — Space Grotesk display, Inter body, blue accents. Intelligence inherits that lineage.

Display font option: **Space Grotesk** (modern, analytical) — matching Shareability's font stack rather than Cormorant Garamond. This reinforces "different studio, different personality."

### Creative: Bonfire Amber (the Original)

```css
/* Creative palette — the existing Launchpad palette, unchanged */
--studio-accent:       #c07840;   /* The original amber */
--studio-accent-light: #e0a870;
--studio-accent-dim:   rgba(192, 120, 64, 0.12);
--studio-glow:         rgba(192, 120, 64, 0.06);
```

Creative keeps the EXACT current Launchpad palette. This is home. Cormorant Garamond display, DM Sans body, JetBrains Mono terminal. The fire. The LaunchSequence. The BuildTheater. Everything the user already knows — it lives in Creative.

### Strategy: Warm Stone

```css
/* Strategy palette — between the other two, grounded */
--studio-accent:       #8B9A6B;   /* Sage/olive — deliberate, grounded */
--studio-accent-light: #A8B88A;
--studio-accent-dim:   rgba(139, 154, 107, 0.12);
--studio-glow:         rgba(139, 154, 107, 0.06);
```

Strategy is neither the cool analytical blue of Intelligence nor the warm theatrical amber of Creative. It's a sage/olive — earthy, considered, like the green of a map or the color of a well-worn strategy document. It says "we've done the thinking."

Display font option: **Cormorant Garamond** (shared with Creative, but in a more restrained way — lighter weights, more structured layouts). Strategy is a bridge — it should feel related to Creative but calmer.

### Palette Switching Implementation

The palette shift happens at the layout level via CSS custom properties. When the user enters a studio, the root `--color-accent` variables transition:

```tsx
// StudioLayout wraps each studio route
<div
  className="studio-layout"
  style={{
    '--color-accent': studioAccent,
    '--color-accent-light': studioAccentLight,
    '--color-accent-dim': studioAccentDim,
  } as React.CSSProperties}
>
  {children}
</div>
```

The transition between palettes should be a smooth 0.6s crossfade. The grid background, scrollbar, film grain tint, and selection color all shift automatically because they reference `--color-accent`.

---

## Per-Studio Identity

### Intelligence Studio

**Code:** `INT`
**Tagline:** "signals before noise"
**Voice:** Analytical, precise, observational. Speaks in data. Short sentences. Present tense.
**Example copy:** "3 emerging signals in climate tech. velocity: accelerating. window: 6-8 months."

**Persona Codes:**
| Code | Role | Description |
|------|------|-------------|
| `SA` | Signal Analyst | Scans sources, detects emerging patterns |
| `TM` | Trend Mapper | Maps trend velocity, lifecycle, clusters |
| `CI` | Culture Intel | Audience profiling, subculture mapping (Shareability core) |
| `RM` | Report Master | Synthesizes findings into structured reports |

**Entry Sequence (replaces LaunchSequence):**

Instead of a rocket, Intelligence gets a **Scan Sequence** — a radar sweep animation:

```
$ intelligence --brief "climate tech investment landscape"
  ✓ brief received
  ✓ source matrix loaded [reddit, youtube, x, linkedin, arxiv]
  ✓ time range: 90 days
  ✓ depth: comprehensive

$ intelligence --scan
  scanning...  ████████████░░░░░░░░░░░  47%
```

The visual isn't a rocket — it's a **radar circle** that sweeps clockwise, with data points appearing at random positions as "signals" are found. The circle pulses on completion. Same theatrical energy as LaunchSequence, different metaphor.

**The Intelligence Workspace:**

After the scan sequence, the user enters a research workspace that adapts the BuildTheater pattern:

- **Persona strip** uses Intelligence codes (`SA`, `TM`, `CI`, `RM`)
- **Live log** shows research activity: `[11:42] SA: scanning r/climateinvestment — 847 posts, 23 trending topics`
- **Interactive input** at the bottom (unlike Creative's BuildTheater) — the user can steer research in real-time: "focus on Series A rounds" or "exclude carbon credits"
- **Output** is a structured report rendered inline — sections with numbered findings, trend cards with velocity indicators, cluster maps

**Trend Card Pattern (new component):**

```
┌──────────────────────────────────────┐
│  ● rising                     +340%  │
│                                      │
│  AI-native insurance                 │
│                                      │
│  lifecycle: early-growth             │
│  velocity:  ████████░░  accelerating │
│  sources:   reddit, x, linkedin      │
│  first seen: 14 days ago             │
│                                      │
│  "insurance products built AI-first  │
│  rather than bolting AI onto legacy   │
│  systems..."                          │
│                                      │
│  $ deep dive  ·  $ add to report     │
└──────────────────────────────────────┘
```

### Creative Studio

**Code:** `CRE`
**Tagline:** "story, built"
**Voice:** Confident, cinematic, declarative. The existing Launchpad voice — "mission launched," "your launchpad is being built." Bold statements, not explanations.
**Example copy:** "the story is ready. one click to build."

**Persona Codes:** The existing 7 — `RA`, `RS`, `NS`, `CW`, `DV`, `QA`, `DE`

**Entry Sequence:** The existing LaunchSequence, unchanged. It's already perfect.

**The Creative Workspace:** The existing project detail page — BuildTheater, NarrativePreview, ScoutChat, PipelineActivity, all of it. Creative IS the current Launchpad. The only additions:

1. **Provenance badges** on materials that came from Intelligence: `[INT] market report → used as research input`
2. **Strategy references** if a narrative was drafted in Strategy first: `[STR] narrative brief → imported as starting material`
3. **A "source material" panel** in the project detail that shows where intelligence/strategy inputs came from

### Strategy Studio

**Code:** `STR`
**Tagline:** "the thinking before the making"
**Voice:** Authoritative, structured, evidence-based. Speaks in frameworks and arcs. Longer form than Intelligence, more structured than Creative.
**Example copy:** "the positioning framework has 4 layers. each one builds on research from intelligence."

**Persona Codes:**
| Code | Role | Description |
|------|------|-------------|
| `NS` | Narrative Strategist | Story extraction, 6-beat arc (shared with Creative) |
| `PM` | Positioning Master | Brand positioning, competitive framing |
| `MF` | Message Framer | Taglines, value propositions, elevator pitches |
| `SD` | Strategy Director | Synthesis, framework construction |

**Entry Sequence: The Brief Sequence**

Strategy gets a **typing sequence** — a document being written in real-time:

```
$ strategy --brief "series a positioning for acme corp"
  ✓ brief received
  ✓ loading context [2 intelligence reports linked]
  ✓ framework: competitive positioning

$ strategy --draft
  the strategist is writing...

  ┌──────────────────────────────────┐
  │  ▊                               │
  │                                  │
  │  (text appears character by      │
  │   character, like the Bonfire     │
  │   terminal typing animation)      │
  │                                  │
  └──────────────────────────────────┘
```

The visual is a document materializing — text appearing line by line in a TerminalChrome wrapper. Less explosive than LaunchSequence, less scanning than Intelligence. It's the quiet intensity of a strategist drafting.

**The Strategy Workspace:**

Similar to Intelligence but output-oriented rather than discovery-oriented:

- **Persona strip** uses Strategy codes
- **Output is a structured document** — positioning framework, messaging matrix, narrative arc
- **Export options:** PDF, Markdown, "Send to Creative" (promotion)
- **Interactive refinement** via `$` prompt: "make the positioning more aggressive" or "focus the narrative on the technical moat"

---

## Cross-Department Flow: The Thread

### The Metaphor: Threads, Not Arrows

Work that moves between studios is tracked as a **thread** — a continuous line of creative work that passes through different rooms. The thread is visualized as a thin accent-colored line that connects related items across studios.

### The Promote Action

Promotion is the intentional act of moving work forward. It's always explicit (the user clicks a button), never automatic.

| Promotion Path | What Moves | What Stays |
|----------------|------------|------------|
| Intelligence → Strategy | Research report becomes input for positioning/narrative | Original report stays in Intelligence |
| Intelligence → Creative | Research report becomes input for PitchApp build | Original report stays in Intelligence |
| Strategy → Creative | Narrative/positioning brief becomes input for PitchApp build | Original brief stays in Strategy |

The promotion modal uses the TerminalChrome pattern:

```
┌─────────────────────────────────────────────┐
│ ● ● ●  promote to creative                  │
│                                             │
│  this research will become the foundation   │
│  for a new pitchapp project.                │
│                                             │
│  from: [INT] SaaS market report             │
│  to:   [CRE] new project                    │
│                                             │
│  $ project name: ▊                          │
│  $ company:      Acme Corp (from research)  │
│  $ type:         investor pitch             │
│                                             │
│  ─ research findings will be passed to the  │
│    narrative strategist as context. you      │
│    won't lose the original report.          │
│                                             │
│  $ promote ▊                                │
│                                             │
└─────────────────────────────────────────────┘
```

### Provenance Badges

When work has crossed studios, it carries a provenance badge — a small indicator showing its lineage:

```
[INT → CRE]  "informed by intelligence report: SaaS Market Analysis"
[INT → STR → CRE]  "intelligence → strategy positioning → creative build"
```

These appear as small `font-mono` badges on project cards and in project detail views. They tell the story of how this work was assembled — and they link back to the source materials.

### The Thread View (Future)

A dedicated view (accessible from any studio) that shows the full journey of a piece of work across studios. Think of it as a horizontal timeline:

```
[INT] Market Report ──→ [STR] Positioning Brief ──→ [CRE] Series A Deck
     Dec 3                    Dec 5                      Dec 8
     8 sources                4 frameworks               12 sections
     ✓ complete               ✓ complete                 ● in build
```

This is the "shared brain" visualization — proof that the three studios are interconnected, not siloed.

---

## The Triptych Entry Animation

When the home screen first loads, the three panels don't just appear. They have a theatrical entrance:

### Sequence (total ~2.5s):

1. **Black screen** (0.3s) — the Launchpad logo fades in center, small, `font-mono`
2. **Three vertical lines** appear — thin `1px` accent lines at the 1/3 and 2/3 marks, growing from center outward (0.4s)
3. **Panels fade in** — left, center, right, staggered by 0.15s each. Each panel's ambient background starts simultaneously (0.6s)
4. **Panel labels appear** — studio code, name, description stagger in from bottom (0.4s)
5. **Greeting appears** — above the triptych, fade-in (0.3s)
6. **Recent activity strip** — slides up from bottom (0.3s)

On subsequent visits (session cookie), skip to step 3 (faster load, no logo beat).

### Reduced Motion

`prefers-reduced-motion`: all panels appear simultaneously, no stagger, no animations on backgrounds. The triptych is still visually structured but everything is static.

---

## The Studio Transition

When the user clicks `$ enter` on a panel, the transition INTO the studio is its own theatrical moment:

### The Door Open

1. The selected panel **expands to fill the viewport** (0.4s, `ease-out`) while the other two panels compress and fade to 0 opacity
2. The panel's ambient background intensifies
3. The panel content (code, label) transforms into the studio's nav header
4. The studio content fades in beneath

This is the "walking through the door" moment. The panel IS the door. You don't navigate to a new page — the panel opens and becomes the page.

### The Exit (Back to Triptych)

A `← triptych` link in the studio nav (or the Launchpad logo) reverses the animation — the studio compresses back into its panel, the other two panels expand back, and you're standing in front of the three doors again.

---

## Studio Intake Flows

Each studio has its own intake — the "what are you working on?" moment when you first enter.

### Intelligence Intake

Conversational. The `$` prompt is primary. Quick-start pills below for common research types.

```
INT · intelligence — new brief

what do you want to understand?

$ ▊

── quick starts ──

  market landscape    competitive analysis
  audience profiling  trend mapping
  company deep dive   white-space analysis
```

No company name field. No project name required upfront. Intelligence work starts with a question, not a form. The system infers structure from the brief.

### Creative Intake

The existing `/dashboard/new` flow, enhanced. Company name, project name, type, materials. The form the user already knows. But now with:

- **"Attach from Intelligence"** — a pill that shows available Intelligence reports to use as research input
- **"Import Strategy Brief"** — a pill that shows available Strategy docs to use as narrative input
- **Notes field** still supports natural language, and Scout still detects research intent for inline nudging

### Strategy Intake

Hybrid of Intelligence and Creative. The prompt is structured but flexible:

```
STR · strategy — new brief

what story needs to be told?

$ ▊

── framework ──

  positioning          messaging matrix
  narrative arc        competitive framing
  value proposition    brand voice
```

Strategy intake asks "what story" not "what data" — it's narrative-first. If the user mentions a company, the system looks for existing Intelligence reports on that company and offers to link them.

---

## Per-Studio Project Lists

Each studio has its own project list (the current DashboardClient pattern, but scoped to one studio). The card gradient shifts to match the studio palette:

| Studio | Card Gradient | Status Accents |
|--------|--------------|----------------|
| Intelligence | Blue-tinted (`rgba(77, 142, 255, 0.28)`) | Blue dots |
| Creative | Amber-tinted (existing) | Amber dots |
| Strategy | Sage-tinted (`rgba(139, 154, 107, 0.28)`) | Sage dots |

### Mission Control (Cross-Studio Archive)

A separate view — accessible from the greeting strip ("3 active projects" link) or from the nav — that shows ALL projects across all studios. This is the current DashboardClient behavior, essentially unchanged, but now with studio badges on each card: `[INT]`, `[CRE]`, `[STR]`.

Filtering includes studio filter tabs alongside the existing status filters.

---

## The Studio Nav

Each studio's nav follows the existing pattern but with the studio context:

```
launchpad — intelligence                    aj hart  ⚙  sign out
```

The section label in the nav shows the studio name. The Launchpad logo is always clickable and returns to the triptych.

When inside a project within a studio, the nav shows the breadcrumb:

```
launchpad — intelligence — saas market report       aj hart  ⚙  sign out
```

---

## Empty States

### First Visit (Zero Projects Everywhere)

The triptych panels each have a "first time" variant with inviting copy:

| Panel | Empty Copy |
|-------|------------|
| Intelligence | "ask a question about any market, company, or trend. the signal analyst is waiting." |
| Creative | "turn an idea into an interactive presentation. from story to deploy in one pipeline." |
| Strategy | "frame the narrative before you build. positioning, messaging, story arcs." |

The greeting above the triptych:

```
welcome to launchpad.

three studios. one creative brain. pick a door.
```

### Empty Studio (Studio Has Zero Projects)

Inside a studio with no projects, the studio shows a large terminal prompt in the center:

```
INT · intelligence

no active briefs.

$ start your first brief ▊
```

Clicking the prompt opens the intake flow.

---

## Admin View Adaptation

Admin users see a fourth option in the nav: **mission control** (the cross-studio archive). The admin view continues to show all projects with the existing admin capabilities, but now each project card carries its studio badge.

Admin-specific features (automation settings, pipeline retry, escalation) remain accessible from the project detail page, regardless of which studio the project lives in.

---

## Technical Design Notes (for Architect)

### URL Structure

```
/                           → Triptych (home)
/intelligence               → Intelligence studio project list
/intelligence/new           → Intelligence intake
/intelligence/[id]          → Intelligence report/workspace
/creative                   → Creative studio project list
/creative/new               → Creative intake (existing /dashboard/new)
/creative/[id]              → Creative project detail (existing /project/[id])
/strategy                   → Strategy studio project list
/strategy/new               → Strategy intake
/strategy/[id]              → Strategy document workspace
/missions                   → Mission Control (cross-studio archive)
```

### Data Model Implications

- `projects` table gets a `studio` column: `'intelligence' | 'creative' | 'strategy'`
- `project_promotions` table tracks cross-studio lineage: `source_project_id`, `target_project_id`, `promotion_type`
- Intelligence and Strategy get their own output storage (reports/documents), possibly in the existing `project_narratives` table with a `type` discriminator, or in a new `studio_outputs` table
- The existing pipeline stages adapt per studio — Intelligence has its own pipeline (`scan → analyze → synthesize → report`), Strategy has its own (`brief → research → draft → refine`)

### Component Reuse

| Existing Component | Reused In | Adaptation |
|-------------------|-----------|------------|
| `TerminalChrome` | All studios | No change — universal wrapper |
| `BuildTheater` | Intelligence, Strategy | Different persona codes, interactive input for Intelligence |
| `ProjectCard` | All studios | Gradient map adds studio-specific colors |
| `LaunchSequence` | Creative only | Unchanged |
| `ScoutChat` | All studios | Prompt prefix changes per studio |
| `NarrativePreview` | Creative, Strategy | Strategy uses it for positioning docs |
| `TerminalInput` | All studios | The `$` prompt pattern is universal |

### New Components Needed

| Component | Purpose |
|-----------|---------|
| `TriptychHome` | The three-panel home screen |
| `TriptychPanel` | Individual panel with ambient background, expand/compress |
| `StudioLayout` | Per-studio wrapper (palette switching, nav context) |
| `ScanSequence` | Intelligence entry animation (radar sweep) |
| `BriefSequence` | Strategy entry animation (typing document) |
| `TrendCard` | Intelligence output card (velocity, lifecycle, sources) |
| `PromoteModal` | Cross-studio promotion flow |
| `ProvenanceBadge` | Shows cross-studio lineage on project cards |
| `ThreadView` | Cross-studio journey visualization |
| `RecentActivityStrip` | Horizontal scrolling recent items below triptych |

---

## The Feeling

The triptych isn't a feature. It's an identity shift. Launchpad stops being "the PitchApp builder" and becomes **"the creative agency in your browser."**

When you see three panels — Intelligence in cool blue, Creative in warm amber, Strategy in sage green — you understand immediately: this is a place with depth. This is a place where different kinds of thinking happen. And they're all connected.

The theatrical moments matter. The panel expanding when you hover. The door-open animation when you enter. The scan sequence in Intelligence, the rocket in Creative, the typing draft in Strategy. Each studio earns its personality through these moments.

The cross-department thread matters too. The provenance badge that says `[INT → CRE]` tells the user: "your research is in here. your thinking carried forward. nothing was lost." That's the promise of the connected platform — **continuity across capabilities.**

Three studios. One creative brain. Every door leads somewhere worth going.
