# UX Flows: Three-Department Launchpad Platform

> UX/UI Designer deliverable — Task #3
> Covers: Triptych Home, Intelligence, Strategy, Creative, Cross-Department Navigation, Responsive

---

## Table of Contents

1. [Design System Inheritance](#1-design-system-inheritance)
2. [The Triptych Home Screen](#2-the-triptych-home-screen)
3. [Intelligence Department](#3-intelligence-department)
4. [Strategy Department](#4-strategy-department)
5. [Creative Department](#5-creative-department)
6. [Cross-Department Navigation](#6-cross-department-navigation)
7. [Responsive Considerations](#7-responsive-considerations)
8. [Notification & Activity System](#8-notification--activity-system)

---

## 1. Design System Inheritance

All three departments share the existing Launchpad design DNA. This is non-negotiable — the platform should feel like one product, not three apps stitched together.

### Inherited Patterns (Do Not Reinvent)

| Pattern | Current Implementation | Extend To |
|---------|----------------------|-----------|
| **TerminalChrome** | Cards with traffic-light dots + title | Every department's primary content containers |
| **StatusDot** | Colored dot + mono label | Trend lifecycle badges, research status, build status |
| **Accent color system** | `--color-accent: #c07840` (warm copper) | All departments share the same accent. Department identity comes from *context labels*, not color coding |
| **Font stack** | Cormorant Garamond (display), DM Sans (body), JetBrains Mono (mono) | All UI text across departments |
| **Mono `$` prompt** | Search input, Scout chat input | Universal search, trend scoring input, research query input |
| **3D tilt hover** | ProjectCard `perspective(800px)` | Trend cards, research cards, project cards |
| **Realtime subscriptions** | `useRealtimeSubscription` hook | Signal ingestion feed, research progress, build theater |
| **Pipeline stages** | PipelineFlow DAG with NodeDot connectors | Strategy research pipeline, Intelligence scoring pipeline |
| **Skeleton shimmer** | Loading states across all components | All new loading states |
| **Film grain overlay** | Fixed SVG noise at 3% opacity | Persists across all department views |
| **Grid background** | CSS grid lines at 60px, masked radial | Persists across all views |

### New Tokens (Additions, Not Overrides)

```css
/* Department context colors — used ONLY for subtle identification, never as primary accent */
--color-dept-intelligence: #5b8fd4;  /* cool blue — reuses existing --color-review */
--color-dept-strategy: #28c840;      /* green — reuses existing --color-success */
--color-dept-creative: #c07840;      /* warm copper — same as --color-accent */

/* Velocity/urgency spectrum (Intelligence-specific) */
--color-velocity-cold: #948f86;      /* same as --color-text-muted */
--color-velocity-warm: #e0a020;      /* same as --color-warning */
--color-velocity-hot: #ef4444;       /* red — high velocity */
--color-velocity-peak: #c07840;      /* accent — at peak momentum */
```

**Key principle:** Departments are NOT color-coded. The accent color is always `#c07840`. Department identity is communicated via context labels ("intelligence / trend dashboard"), section headers, and iconography — never via different-colored chrome.

---

## 2. The Triptych Home Screen

### The Problem

The triptych needs to be two things at once:
1. **First visit:** A theatrical portal selection — "choose your world"
2. **Daily return:** A functional dashboard showing active work across departments

These are fundamentally different needs. The solution is a single screen that gracefully transitions between modes.

### 2.1 First-Time / Empty State: The Portal

**Layout:** Three full-height panels side by side, each taking ~33vw. Each panel is a clickable region.

```
┌─────────────────┬─────────────────┬─────────────────┐
│                  │                 │                  │
│   INTELLIGENCE   │    STRATEGY     │    CREATIVE      │
│                  │                 │                  │
│   ◇ signals      │   ◇ research    │   ◇ build        │
│   cultural       │   deep          │   the            │
│   radar          │   analysis      │   packaging      │
│                  │                 │                  │
│   "what's        │   "understand   │   "make it       │
│    happening"    │    everything"  │    real"          │
│                  │                 │                  │
│   [0 active]     │   [0 active]    │   [0 active]     │
│                  │                 │                  │
└─────────────────┴─────────────────┴─────────────────┘
```

**Panel Behavior:**
- Each panel has a subtle background treatment — abstract, not illustrative:
  - Intelligence: Animated dot matrix (signals arriving) — dots slowly appear and fade
  - Strategy: Slow-moving concentric rings (depth, layers of analysis)
  - Creative: Subtle grid lines assembling into shape (construction, building)
- On hover, the hovered panel expands to ~50vw (push animation on siblings, ~25vw each). CSS `transition: flex 0.5s var(--ease-out)`.
- The hovered panel reveals 2-3 more lines of description text and a "enter" CTA
- Panel text uses `font-display` (Cormorant Garamond) for the department name, `font-mono` for the tagline
- Clicking a panel navigates to that department's dashboard

**Panel Content (Expanded State):**

```
┌──────────────────────────────────────┬──────────┬──────────┐
│                                      │          │          │
│   INTELLIGENCE                       │ STRATEGY │ CREATIVE │
│                                      │          │          │
│   ◇ signals · cultural radar         │          │          │
│                                      │          │          │
│   monitor cultural trends from       │          │          │
│   youtube, reddit, and x.            │          │          │
│   score against brand fit.           │          │          │
│   generate pitch-ready briefs.       │          │          │
│                                      │          │          │
│   $ enter intelligence →             │          │          │
│                                      │          │          │
│   [0 active trends]                  │          │          │
│                                      │          │          │
└──────────────────────────────────────┴──────────┴──────────┘
```

### 2.2 Returning User: The Activity Dashboard

Once a user has active projects in any department, the triptych transforms into a compact header + activity stream.

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  nav: launchpad ── home    [search] [notifications] [▼] │
├──────────┬───────────┬──────────────────────────────────┤
│          │           │                                   │
│  Intel   │  Strategy │  Creative                         │
│  ▓▓▓▓▓▓  │  ▓▓▓▓▓▓   │  ▓▓▓▓▓▓                          │
│  3 hot   │  2 active │  5 projects                       │
│          │           │                                   │
├──────────┴───────────┴──────────────────────────────────┤
│                                                          │
│  recent activity                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ● "Nike Gen-Z" trend hit velocity peak        2m  │  │
│  │   intelligence · auto-scored 87/100                │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ ● Acme Corp research completed                12m  │  │
│  │   strategy · 4 sections · ready for review         │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ ● Bolt Financial PitchApp deployed            1h   │  │
│  │   creative · live at bolt.bonfire.tools            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────┐ ┌──────────────────┐               │
│  │ needs attention   │ │ recently active   │              │
│  │                   │ │                   │              │
│  │ 2 trends need     │ │ Nike trend (intel)│              │
│  │   scoring         │ │ Acme (strategy)   │              │
│  │ 1 narrative needs │ │ Bolt (creative)   │              │
│  │   approval        │ │                   │              │
│  └──────────────────┘ └──────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

**Triptych Header (Compact):**
- Three clickable mini-panels, horizontal strip (~80px tall)
- Each shows: department name, a spark-line or mini-indicator, count of active items
- Click navigates to department dashboard
- The panels still have the subtle flex-expand on hover, but much smaller (33% → 40%)

**Activity Stream:**
- Unified feed of recent events across ALL departments
- Each event shows: department label (mono, colored dot), event description, timestamp
- Events are clickable — navigate to the relevant item
- Sorted by recency
- Maximum 10 items shown, with "view all activity" link

**"Needs Attention" Panel:**
- TerminalChrome card listing items that require user action
- Examples: trends needing scoring, narratives needing approval, PitchApps needing review
- Each item is a direct deep-link

**"Recently Active" Panel:**
- TerminalChrome card listing the user's most recently touched items across departments
- Quick-access links

### 2.3 Transition Between Modes

- The triptych state is determined by `hasActivity` (boolean): does the user have ANY active trends, research projects, or creative projects?
- First-time users see the full theatrical triptych
- Once they create their first item in any department, the page transitions to the compact dashboard mode
- The compact triptych header preserves the portal metaphor while being practical

---

## 3. Intelligence Department

### 3.0 Overview

Intelligence is the cultural radar. It monitors signals from YouTube, Reddit, and X, clusters them into trends using LLM analysis, tracks lifecycle and velocity, and lets users score trends against brand fit. High-scoring trends can generate pitch-ready briefs or hand off to Strategy/Creative.

### 3.1 Trend Dashboard (Primary View)

**URL:** `/intelligence`

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  nav: launchpad ── intelligence    [search] [🔔] [▼]    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  signal ingestion ─── live                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ▸ reddit/r/technology: "AI agents replacing..."  3s│  │
│  │ ▸ youtube/@mkbhd: "Why Everyone's Talking..."    8s│  │
│  │ ▸ x/@elonmusk: "The future of..."              14s│  │
│  │                          12,847 signals today ───│  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐                │
│  │ hot (7)  │  │ rising(12)│ │ all (43) │ [$ search]    │
│  └─────────┘  └──────────┘  └──────────┘                │
│                                                          │
│  ┌──────────────────┐ ┌──────────────────┐               │
│  │                   │ │                  │               │
│  │  AI Agents in     │ │  Nostalgia       │               │
│  │  Enterprise       │ │  Marketing       │               │
│  │                   │ │                  │               │
│  │  ▲▲▲▲▲ hot        │ │  ▲▲▲▲░ rising    │               │
│  │  347 signals      │ │  189 signals     │               │
│  │  ◉ ▣ ✕            │ │  ◉ ✕             │               │
│  │  2h ago           │ │  6h ago          │               │
│  │                   │ │                  │               │
│  │  [score: 87]      │ │  [not scored]    │               │
│  └──────────────────┘ └──────────────────┘               │
│                                                          │
│  ┌──────────────────┐ ┌──────────────────┐               │
│  │ ...more cards     │ │                  │               │
└──────────────────────────────────────────────────────────┘
```

#### Signal Ingestion Bar

**Position:** Top of dashboard, always visible. Collapsible.

**Visual treatment:** TerminalChrome container with `title="signal ingestion"`. Dark background. Mono font.

**Content:**
- A 3-line rolling feed of the most recent signals being ingested
- Each line: `▸ {source}/{channel}: "{title_truncated}"  {age}`
- Source icons: small monochrome icons for Reddit (◉), YouTube (▣), X (✕)
- Bottom-right: total signal count for today, updating in realtime
- Subtle amber pulse dot next to "live" label when ingestion is active

**Behavior:**
- Realtime updates via `useRealtimeSubscription` on signals table
- Collapses to a single-line summary: `"12,847 signals today · last: 3s ago"` when collapsed
- Default: expanded for new users, remembers collapse state

#### Trend Cards (Grid)

**Layout:** Responsive grid matching current ProjectCard grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`

**Each Trend Card:**

```
┌──────────────────────────────┐
│  ▲▲▲▲▲  hot · lifecycle:     │  ← velocity bar + lifecycle badge
│          peaking              │
│                               │
│  AI Agents in Enterprise      │  ← font-display, 24px (matches ProjectCard)
│                               │
│  Enterprises adopting AI      │  ← 14px text-muted summary (AI-generated)
│  agent frameworks...          │
│                               │
│  ───────────────────────────  │
│  347 signals · ◉ ▣ ✕         │  ← signal count + source icons
│  score: 87/100 · 2h ago      │  ← brand fit score + freshness
│                               │
└──────────────────────────────┘
```

**Card Components:**

1. **Velocity Bar:** 5 chevrons (▲). Filled chevrons = velocity level.
   - 1 chevron: cold (muted color)
   - 2-3: warming (warning color)
   - 4: hot (red)
   - 5: peaking/viral (accent color, pulsing)
   - Implemented as 5 small SVG arrows, colored by velocity threshold

2. **Lifecycle Badge:** Mono text, 10px, tracking-[2px]. Values:
   - `emerging` — just detected, few signals
   - `rising` — gaining momentum
   - `peaking` — maximum velocity
   - `sustained` — high but steady
   - `declining` — velocity dropping
   - Badge color follows velocity spectrum

3. **Source Icons:** Small inline icons showing which platforms have signals for this trend
   - Reddit (◉), YouTube (▣), X (✕)
   - Muted when no signals from that source
   - Each clickable to filter trend detail by source

4. **Brand Fit Score:** Only shown if scored. `score: 87/100` in accent color if high (>70), muted if medium (40-70), error color if low (<40). `[not scored]` in text-muted if unscored.

5. **3D tilt hover:** Same `perspective(800px)` treatment as ProjectCard

**Filtering:**
- Filter tabs (same pattern as current dashboard): `hot` | `rising` | `all` | `scored` | `unscored`
- Search input with `$` prompt (same as current)
- Source filter: Reddit | YouTube | X | All (secondary filter row)

#### Trend Card Interactions

- **Click card** → navigates to Trend Detail view (`/intelligence/trend/[id]`)
- **Hover** → 3D tilt, border glow
- **Quick actions on hover** (bottom-right overlay):
  - `[score]` — opens scoring flow inline
  - `[brief]` — generates brief (only if score > 70)
  - `[→ strategy]` — hand off to strategy

### 3.2 Trend Detail View

**URL:** `/intelligence/trend/[id]`

**Layout:** Split view (same pattern as ProjectDetailClient — preview left, info right)

```
┌─────────────────────────────────────────────────────────┐
│  nav: launchpad ── intelligence ── trend name            │
├─────────────────────────────────┬────────────────────────┤
│                                 │                        │
│  SIGNAL FEED                    │  TREND OVERVIEW        │
│                                 │  TerminalChrome        │
│  ┌───────────────────────────┐  │  ┌──────────────────┐  │
│  │ ◉ reddit · r/technology   │  │  │ velocity: ▲▲▲▲▲  │  │
│  │   "AI agents are now..."  │  │  │ lifecycle: peaking│  │
│  │   ↑ 2.4k · 347 comments  │  │  │ signals: 347     │  │
│  │   3h ago                  │  │  │ sources: ◉ ▣ ✕   │  │
│  ├───────────────────────────┤  │  │ first seen: 2d   │  │
│  │ ▣ youtube · @mkbhd        │  │  │ brand score: 87  │  │
│  │   "Why AI Agents Are..."  │  │  └──────────────────┘  │
│  │   ↑ 1.2M views · 12h ago │  │                        │
│  ├───────────────────────────┤  │  VELOCITY CHART        │
│  │ ✕ x · @elonmusk           │  │  TerminalChrome        │
│  │   "The future of AI..."   │  │  ┌──────────────────┐  │
│  │   ↑ 8.2k · 2.1k retweets │  │  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  │   6h ago                  │  │  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │
│  └───────────────────────────┘  │  │  sparkline (7d)   │  │
│                                 │  └──────────────────┘  │
│  [show more signals]            │                        │
│                                 │  ACTIONS               │
│  ─── AI SUMMARY ───             │  [$ score this trend]  │
│  TerminalChrome                 │  [$ generate brief]    │
│  "This trend represents a       │  [$ → research deeper] │
│   convergence of enterprise     │  [$ → build pitch]     │
│   AI adoption and the agent     │                        │
│   framework ecosystem..."       │  TEAM NOTES            │
│                                 │  TerminalChrome        │
│                                 │  ScoutChat-style thread │
│                                 │                        │
├─────────────────────────────────┴────────────────────────┤
│  RELATED TRENDS (horizontal scroll)                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │
│  │trend │ │trend │ │trend │ │trend │                     │
│  └──────┘ └──────┘ └──────┘ └──────┘                    │
└──────────────────────────────────────────────────────────┘
```

#### Left Panel: Signal Feed

**Visual treatment:** Vertically scrolling list of individual signals, grouped by source.

**Each Signal Item:**
```
┌────────────────────────────────────────┐
│  ◉ reddit · r/technology · 3h ago      │  ← source icon, subreddit/channel, age
│                                        │
│  "AI agents are now handling entire     │  ← title/content preview (2 lines max)
│   customer service departments..."      │
│                                        │
│  ↑ 2.4k · 347 comments                │  ← engagement metrics
│  [sentiment: positive] [relevance: 94] │  ← AI-tagged metadata
└────────────────────────────────────────┘
```

- Signals sorted by recency (newest first)
- Source filter tabs at top of signal feed: `all` | `◉ reddit` | `▣ youtube` | `✕ x`
- Infinite scroll with "load more" trigger
- Each signal clickable to open source URL in new tab

**AI Summary Block:** Below the signal feed. TerminalChrome with `title="ai summary"`. Auto-generated synthesis of the trend's key themes, updated as new signals arrive. Shows when signals > 10.

#### Right Panel: Trend Metadata + Actions

**Trend Overview Card:** TerminalChrome with key metrics:
- Velocity (chevron bar + numeric)
- Lifecycle stage
- Signal count (total + per-source breakdown)
- First detected timestamp
- Brand fit score (if scored)
- Trend cluster tags (AI-generated topic tags)

**Velocity Chart:** TerminalChrome with ASCII-style sparkline showing signal velocity over time (7-day window). Horizontal axis = days, vertical = signals/hour. Using a simple bar chart or line rendered with CSS (not a charting library — keeps it lightweight and terminal-aesthetic).

```
signals/hr
  12 │         ▓▓
  10 │       ▓▓▓▓▓▓
   8 │     ▓▓▓▓▓▓▓▓▓▓
   6 │   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   4 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   2 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
     └──────────────────────
       M  T  W  T  F  S  S
```

**Actions:** Styled as terminal commands (mono, accent color, `$` prefix):
- `$ score this trend` → Opens scoring flow
- `$ generate brief` → Triggers brief generation (only if scored > 70)
- `$ → research deeper` → Hands off to Strategy (creates pre-populated research project)
- `$ → build pitch` → Hands off to Creative (creates project with trend context)

**Team Notes:** ScoutChat-style threaded discussion. Same TerminalChrome + message pattern as current ScoutChat but scoped to the trend. Team members can discuss whether to pursue, add context, tag colleagues.

### 3.3 Scoring Flow

The scoring flow has three stages. It can be initiated from the trend card (quick action) or from the trend detail view.

#### Stage 1: Knockout Questions (3 quick checks)

**Visual:** Full-screen overlay (modal) with a focused, one-question-at-a-time interface.

```
┌──────────────────────────────────────────┐
│                                          │
│  scoring: AI Agents in Enterprise        │
│  ─────────────────────────────────       │
│                                          │
│  knockout check 1 of 3                   │
│                                          │
│  "Is this trend relevant to any          │
│   of your active client verticals?"      │
│                                          │
│  ┌──────────┐   ┌──────────┐             │
│  │   yes     │   │    no    │             │
│  └──────────┘   └──────────┘             │
│                                          │
│  ─────── ● ○ ○ ──────                    │
│                                          │
└──────────────────────────────────────────┘
```

- Three binary (yes/no) questions, shown one at a time
- If ANY knockout answer is "no" → trend is flagged as "low fit" with explanation
- Progress dots at bottom
- Smooth transition between questions (slide left)
- Knockout questions are configurable per organization/brand

#### Stage 2: Full Rubric (10 questions)

**Visual:** Same modal, but now a scrollable rubric with 10 questions. Each question has a 1-5 scale.

```
┌──────────────────────────────────────────┐
│                                          │
│  scoring: AI Agents in Enterprise        │
│  ─────────────────────────────────       │
│                                          │
│  full rubric · 10 dimensions             │
│                                          │
│  1. audience alignment                   │
│     how well does this match your        │
│     target audience?                     │
│     ○ 1  ○ 2  ● 3  ○ 4  ○ 5            │
│                                          │
│  2. timing                               │
│     is the timing right for action?      │
│     ○ 1  ○ 2  ○ 3  ● 4  ○ 5            │
│                                          │
│  ... (8 more questions)                  │
│                                          │
│  ──────────────────────                  │
│  current score: 74/100                   │
│  [$ submit score]                        │
│                                          │
└──────────────────────────────────────────┘
```

- 10 scored dimensions, each 1-5
- Running score total shown at bottom, updating live
- Each question has a short description of what 1 and 5 mean (tooltip on hover)
- Submit button calculates final score = (sum / 50) * 100

#### Stage 3: AI Comparison

**Visual:** After submitting, the modal transitions to show the AI's independent score alongside the user's.

```
┌──────────────────────────────────────────┐
│                                          │
│  scoring complete                        │
│  ─────────────────                       │
│                                          │
│  your score        ai score              │
│     74               81                  │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ dimension     you    ai    delta    │ │
│  │ ──────────    ───    ──    ─────    │ │
│  │ audience       3      4     +1      │ │
│  │ timing         4      5     +1      │ │
│  │ uniqueness     3      3      0      │ │
│  │ ...                                 │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ai notes:                               │
│  "Strong alignment with enterprise       │
│   B2B verticals. Timing is optimal —     │
│   trend is 2 weeks from peak..."         │
│                                          │
│  [$ accept ai score]  [$ keep mine]      │
│  [$ generate brief]                      │
│                                          │
└──────────────────────────────────────────┘
```

- Side-by-side comparison table
- Delta column highlights where human and AI disagree (>1 point diff in accent color)
- AI provides written rationale
- User can accept AI score, keep their own, or average
- Direct action to generate brief if score is high

### 3.4 Brief Generation

Triggered from trend detail or post-scoring. Creates a pitch-ready brief document.

**Flow:**
1. User clicks `$ generate brief`
2. BuildTheater-style visualization appears (reusing the persona strip pattern):
   - `RA` (analyst) → gathering trend data
   - `RS` (researcher) → synthesizing signals
   - `CW` (writer) → drafting brief
3. Brief appears in a new TerminalChrome card on the trend detail page

**Brief Output:**
```
┌────────────────────────────────────────┐
│  TerminalChrome: pitch brief           │
│                                        │
│  AI Agents in Enterprise               │
│  ─────────────────────                 │
│                                        │
│  hook                                  │
│  "Enterprise AI is shifting from       │
│   copilots to autonomous agents..."    │
│                                        │
│  key insight                           │
│  "67% of Fortune 500 are evaluating    │
│   agent frameworks for 2026..."        │
│                                        │
│  supporting evidence                   │
│  • Signal 1: MKBHD video (1.2M views) │
│  • Signal 2: r/technology thread       │
│  • Signal 3: Industry report cited     │
│                                        │
│  suggested angle                       │
│  "Position as the definitive guide     │
│   to enterprise agent adoption..."     │
│                                        │
│  timing window                         │
│  "Peak attention in 5-10 days.         │
│   Optimal publication: this week."     │
│                                        │
│  ────────────────────────              │
│  [$ → create research project]         │
│  [$ → create pitchapp]                 │
│  [$ export as pdf]                     │
│  [$ copy to clipboard]                 │
└────────────────────────────────────────┘
```

### 3.5 Handoff Flows

#### Intelligence → Strategy ("Research Deeper")

**Trigger:** `$ → research deeper` from trend detail or brief

**Flow:**
1. Confirmation modal: "Create a Strategy research project from this trend?"
2. Shows what will be transferred:
   - Trend name → research project title
   - AI summary → research context
   - Top signals → reference materials
   - Brief (if generated) → research brief
3. User confirms → navigates to new Strategy project (pre-populated)
4. Trend card gets a badge: `→ strategy` linking to the research project

#### Intelligence → Creative ("Build a Pitch")

**Trigger:** `$ → build pitch` from trend detail or brief

**Flow:**
1. Confirmation modal: "Create a Creative project from this trend?"
2. Shows what will be transferred:
   - Trend name → project name
   - Brief → narrative seed
   - Score + timing data → project context
3. User confirms → navigates to new Creative project (pre-populated)
4. Trend card gets a badge: `→ creative` linking to the project

### 3.6 Intelligence Settings

**URL:** `/intelligence/settings` (gear icon in department nav)

- **Sources:** Toggle Reddit / YouTube / X ingestion on/off
- **Subreddits / Channels / Accounts:** Configure which specific sources to monitor
- **Knockout Questions:** Customize the 3 knockout questions
- **Rubric Dimensions:** Customize the 10 scoring dimensions
- **Alert Thresholds:** Set velocity thresholds for notifications (e.g., "notify me when any trend hits velocity 4+")

---

## 4. Strategy Department

### 4.0 Overview

Strategy is the research engine. Users create research projects, AI performs deep analysis (company research, market research, competitive analysis), results are presented as structured reports, users iterate via Scout, and final outputs can be exported or promoted to Creative.

### 4.1 Research Dashboard

**URL:** `/strategy`

**Layout:** Same grid pattern as current Mission Control dashboard.

```
┌─────────────────────────────────────────────────────────┐
│  nav: launchpad ── strategy    [search] [🔔] [▼]        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  research lab                                            │
│  3 active projects                                       │
│                                                          │
│  [all] [in progress] [complete] [from intelligence]      │
│  [$ search research...]                                  │
│                                                          │
│  ┌──────────────────┐ ┌──────────────────┐               │
│  │                   │ │                  │               │
│  │  Acme Corp        │ │  Nike Gen-Z      │               │
│  │  Market Analysis  │ │  Cultural Deep   │               │
│  │                   │ │  Dive            │               │
│  │  ● in progress    │ │  ● complete      │               │
│  │  4 sections       │ │  6 sections      │               │
│  │  company research │ │  from: intel ◇   │               │
│  │  12m ago          │ │  1d ago          │               │
│  │                   │ │                  │               │
│  └──────────────────┘ └──────────────────┘               │
│                                                          │
│  [+ new research]                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Research Cards:** Follow the ProjectCard pattern:
- Title (font-display, 24px)
- Research type label (company / market / competitive / cultural)
- Status dot + label
- Section count
- Origin badge if from Intelligence: `from: intel ◇` (links back to source trend)
- 3D tilt hover
- Gradient background based on research type (same pattern as ProjectCard `GRADIENT_MAP`)

**Filter tabs:** `all` | `in progress` | `complete` | `from intelligence`

**New Research button:** Opens creation form

### 4.2 Research Creation

**URL:** `/strategy/new`

**Two entry paths:**

**Path A: From scratch**
```
┌────────────────────────────────────────┐
│  TerminalChrome: new research          │
│                                        │
│  what do you want to research?         │
│                                        │
│  topic                                 │
│  [$ enter topic or company name...]    │
│                                        │
│  type                                  │
│  [company] [market] [competitive]      │
│  [cultural] [custom]                   │
│                                        │
│  context (optional)                    │
│  [$ any specific angles or            │
│     questions to explore...]           │
│                                        │
│  depth                                 │
│  [quick scan] [standard] [deep dive]   │
│                                        │
│  [$ start research →]                  │
│                                        │
└────────────────────────────────────────┘
```

**Path B: From Intelligence handoff**
- Same form, but pre-populated with:
  - Topic: trend name
  - Context: AI summary + brief content
  - Type: auto-selected based on trend type
  - Origin badge showing the source trend
- User can modify any field before starting

### 4.3 Research Detail View (Active Research)

**URL:** `/strategy/research/[id]`

**Layout:** Split view, same pattern as current ProjectDetailClient.

```
┌─────────────────────────────────────────────────────────┐
│  nav: launchpad ── strategy ── Acme Corp Analysis        │
├──────────────────────────────────┬───────────────────────┤
│                                  │                       │
│  RESEARCH OUTPUT                 │  STATUS               │
│                                  │  TerminalChrome       │
│  When research is running:       │  ┌─────────────────┐  │
│  ┌────────────────────────────┐  │  │ progress        │  │
│  │  BuildTheater              │  │  │ ── ● ○ ○ ○     │  │
│  │  (reused from Creative)    │  │  │ researching...  │  │
│  │                            │  │  │                 │  │
│  │  RS: researching web...    │  │  │ depth: deep     │  │
│  │  RS: analyzing financials  │  │  │ est: 5-10 min   │  │
│  │  RS: cross-referencing...  │  │  └─────────────────┘  │
│  └────────────────────────────┘  │                       │
│                                  │  RESEARCH PIPELINE    │
│  When research is complete:      │  PipelineFlow (reuse) │
│  ┌────────────────────────────┐  │  ┌─────────────────┐  │
│  │  Section 1: Overview       │  │  │ ●─●─●─○─○       │  │
│  │  ─────────────────         │  │  │ web  analyze     │  │
│  │  Acme Corp is a...         │  │  │ structure report │  │
│  │                            │  │  └─────────────────┘  │
│  │  Section 2: Market         │  │                       │
│  │  ─────────────────         │  │  SCOUT               │
│  │  The enterprise SaaS...    │  │  TerminalChrome       │
│  │                            │  │  (same as Creative)   │
│  │  Section 3: Competitors    │  │  "tell me more about  │
│  │  ─────────────────         │  │   competitor X"       │
│  │  Key players include...    │  │  "add a SWOT section" │
│  │                            │  │  "go deeper on M&A"   │
│  └────────────────────────────┘  │                       │
│                                  │  ACTIONS              │
│  [section navigation tabs]       │  [$ iterate]          │
│                                  │  [$ export]           │
│                                  │  [$ → creative]       │
│                                  │                       │
│                                  │  ORIGIN               │
│                                  │  from: intel ◇        │
│                                  │  "AI Agents" trend    │
│                                  │  score: 87/100        │
│                                  │                       │
└──────────────────────────────────┴───────────────────────┘
```

#### Research Theater (While Running)

Reuses the BuildTheater component pattern:
- Pipeline stages: `web search` → `analyze` → `structure` → `report` → `review`
- Persona strip showing: RS (researcher), RA (analyst)
- Live log of research actions
- Progress bar (turn/max_turns)

#### Research Output (Complete)

**Structured report** displayed as collapsible section cards:
- Each section: TerminalChrome with section title, body content
- Sections are ordered (1, 2, 3...) with a section nav at the bottom
- Content is rich markdown rendered as HTML (reusing `edit-brief-content` CSS)
- Key findings highlighted with accent color
- Data points, statistics rendered in mono font

#### Scout Integration

Same ScoutChat component, but with research-specific suggested prompts:
- "go deeper on [section]"
- "add a section about..."
- "compare this with..."
- "what's missing?"

Scout responses can trigger re-research on specific sections (iteration loop).

#### Actions

- `$ iterate` — Send Scout message to request changes (same as current edit flow)
- `$ export` — Export as PDF / Markdown / Google Docs
- `$ → creative` — Hand off to Creative department (see handoff flow below)

#### Origin Panel

If this research project came from Intelligence:
- Shows the source trend card (mini version)
- Links back to the trend detail
- Shows the trend's brand fit score

### 4.4 Strategy → Creative Handoff

**Trigger:** `$ → creative` from research detail

**Flow:**
1. Confirmation modal: "Create a Creative project from this research?"
2. Shows what will be transferred:
   - Research title → project name
   - Company name → company name
   - Full research report → attached as reference material
   - Intelligence context (if applicable) → included
3. User selects project type: `investor_pitch` | `client_proposal` | `research_report` | etc.
4. User confirms → navigates to new Creative project
5. Research card gets badge: `→ creative` linking to the project
6. Creative project gets origin panel showing Strategy source

---

## 5. Creative Department

### 5.0 Overview

Creative is the current Launchpad — the PitchApp build pipeline. The existing UI IS the Creative department, enhanced with cross-department context.

### 5.1 Creative Dashboard

**URL:** `/creative` (this replaces the current `/dashboard` as one of three department views)

**Layout:** Identical to current DashboardClient, with additions:

**Additions to current dashboard:**
1. **Origin badges** on ProjectCards that came from Intelligence or Strategy:
   - `from: intel ◇ "trend name"` — links to source trend
   - `from: strategy ◇ "research name"` — links to source research
   - `from: intel → strategy ◇` — shows the full journey chain

2. **"Intelligence context" panel** on project detail (right sidebar):
   - Only shown when project originated from Intelligence
   - Shows: trend name, velocity, score, timing window
   - Real-time update: "this trend is still peaking — timing is good" / "this trend has started declining"

3. **Research attachment** on project detail:
   - When project came from Strategy, the research report is available as a reference panel
   - Collapsible, sits above Documents section

### 5.2 Creative Project Detail

The existing ProjectDetailClient remains the foundation. Additions:

```
┌────────────────────────────────┬──────────────────────────┐
│  (existing preview panel)      │  (existing right panel)  │
│                                │                          │
│                                │  NEW: Origin Trail       │
│                                │  TerminalChrome          │
│                                │  ┌────────────────────┐  │
│                                │  │ journey            │  │
│                                │  │                    │  │
│                                │  │ intel ◇            │  │
│                                │  │ "AI Agents" trend  │  │
│                                │  │ score: 87          │  │
│                                │  │ │                  │  │
│                                │  │ ↓                  │  │
│                                │  │ strategy ◇         │  │
│                                │  │ "Acme Research"    │  │
│                                │  │ 6 sections         │  │
│                                │  │ │                  │  │
│                                │  │ ↓                  │  │
│                                │  │ creative ●         │  │
│                                │  │ (this project)     │  │
│                                │  │ in build           │  │
│                                │  └────────────────────┘  │
│                                │                          │
│                                │  NEW: Timing Pulse       │
│                                │  (only if from Intel)    │
│                                │  ┌────────────────────┐  │
│                                │  │ trend: still       │  │
│                                │  │ peaking ▲▲▲▲▲      │  │
│                                │  │ optimal window:    │  │
│                                │  │ 5-10 days          │  │
│                                │  └────────────────────┘  │
│                                │                          │
│                                │  (existing: progress,    │
│                                │   pipeline, scout, etc.) │
│                                │                          │
└────────────────────────────────┴──────────────────────────┘
```

### 5.3 Creative Pipeline Enhancements

The existing build pipeline gains awareness of upstream data:

**Narrative stage:** If research data exists, the auto-narrative job receives the research report as context, improving narrative quality.

**Review stage:** If Intelligence data exists, the auto-review job checks timing alignment ("is this trend still relevant?").

---

## 6. Cross-Department Navigation

### 6.1 Updated Nav Component

The current Nav component evolves from a flat bar to a department-aware navigation:

```
┌──────────────────────────────────────────────────────────┐
│  launchpad ── [intelligence] [strategy] [creative]       │
│               ^^^^^^^^^^^                                │
│               active dept                                │
│                                      [🔍] [🔔] [admin] [▼]│
└──────────────────────────────────────────────────────────┘
```

**Implementation:**
- `launchpad` logo link → home (triptych)
- Department tabs: `intelligence` | `strategy` | `creative`
  - Active tab: `text-accent`, `border-b-2 border-accent`
  - Inactive: `text-text-muted/70`, hover → `text-text-muted`
  - Each tab shows a mini activity indicator (dot) when there's unread activity in that department
- Right side: universal search, notification bell (existing), admin link (existing), user menu
- On department-specific views, the section label still appears: `launchpad ── intelligence ── trend name`

**The current `sectionLabel` prop expands:**
```tsx
// Current:
<Nav sectionLabel="mission control" />

// New:
<Nav
  department="creative"           // highlights department tab
  sectionLabel="mission control"  // breadcrumb trail
/>
```

### 6.2 Universal Search

**Trigger:** `Cmd+K` or click search icon in nav.

**Visual:** Full-screen overlay with centered search input (command palette pattern).

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│        ┌──────────────────────────────────────┐          │
│        │ $ search across all departments...   │          │
│        └──────────────────────────────────────┘          │
│                                                          │
│        intelligence                                      │
│        ◇ "AI Agents in Enterprise" — trend, hot          │
│        ◇ "Nostalgia Marketing" — trend, rising           │
│                                                          │
│        strategy                                          │
│        ◇ "Acme Corp Analysis" — research, complete       │
│                                                          │
│        creative                                          │
│        ◇ "Bolt Financial" — pitchapp, live               │
│        ◇ "Nike Campaign" — pitchapp, in build            │
│                                                          │
│        recent                                            │
│        ◇ "AI Agents" trend (viewed 2m ago)               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Behavior:**
- Results grouped by department
- Each result shows: name, type (trend/research/pitchapp), status
- Keyboard navigable (arrow keys, Enter to select)
- Recent items shown when search is empty
- Fuzzy search across: trend names, research titles, project names, company names

### 6.3 Project Journey View

Any item that has cross-department history shows a "journey" trail. This is a TerminalChrome component that appears in the right sidebar.

```
┌─────────────────────────────┐
│  TerminalChrome: journey    │
│                             │
│  ◇ intelligence             │
│  │ "AI Agents" trend        │
│  │ detected 5d ago          │
│  │ scored: 87/100           │
│  │                          │
│  ↓                          │
│  ◇ strategy                 │
│  │ "Acme Corp Analysis"     │
│  │ 6 sections               │
│  │ completed 2d ago         │
│  │                          │
│  ↓                          │
│  ● creative                 │
│  │ "Acme Investor Deck"     │
│  │ in build                 │
│  │ est. 24-48h              │
│                             │
└─────────────────────────────┘
```

- Each node is a clickable link to that department's detail view
- Active node (current view) shown with `●`, others with `◇`
- Shows key metadata for each stage
- Connectors use the same visual language as PipelineFlow

### 6.4 Cross-Department Notifications

The existing notification system extends to cover all departments:

**New notification types:**
- `trend_velocity_alert` — "Nike Gen-Z trend hit velocity 5 (peaking)"
- `trend_scored` — "AI Agents scored 87/100"
- `research_complete` — "Acme Corp research finished (6 sections)"
- `handoff_created` — "'AI Agents' trend was sent to Strategy"
- `timing_warning` — "'AI Agents' trend is declining — Creative project may need to accelerate"

**Notification items include a department badge** so users know which world the notification is about.

---

## 7. Responsive Considerations

### 7.1 Triptych (Home Screen)

| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥1024px) | Three panels side by side, flex-expand on hover |
| Tablet (768-1023px) | Three panels stacked vertically, each ~33vh, tap to expand |
| Mobile (<768px) | Three panels stacked vertically, each ~150px tall, tap navigates directly |

**Compact dashboard mode (returning users):**

| Breakpoint | Behavior |
|------------|----------|
| Desktop | Horizontal triptych header strip + grid below |
| Tablet | Horizontal triptych strip (smaller) + single-column activity |
| Mobile | Department selector as horizontal scroll tabs + activity feed |

### 7.2 Intelligence

| Component | Desktop | Tablet | Mobile |
|-----------|---------|--------|--------|
| Signal ingestion bar | Full 3-line feed | 2-line feed | Single-line summary (collapsed) |
| Trend cards | 3-column grid | 2-column grid | Single column, cards become compact list items |
| Trend detail (split) | Side-by-side | Side-by-side (narrower right) | Stacked (signal feed then info) |
| Velocity chart | Full width sparkline | Full width | Simplified mini-sparkline |
| Scoring flow | Centered modal, 600px | Full width modal | Full screen overlay |
| Brief output | Full width card | Full width | Full width, smaller text |

**Mobile trend card (compact):**
```
┌───────────────────────────────┐
│ ▲▲▲▲▲ AI Agents in Enterprise │
│ 347 signals · score: 87 · 2h │
└───────────────────────────────┘
```
- Single row per trend
- Velocity chevrons inline with title
- Key stats condensed to one line
- Tap to navigate to detail

### 7.3 Strategy

| Component | Desktop | Tablet | Mobile |
|-----------|---------|--------|--------|
| Research cards | 3-column grid | 2-column grid | Single column |
| Research detail (split) | Side-by-side | Side-by-side | Stacked (output then info) |
| Research sections | Collapsible cards | Same | Same, full width |
| Creation form | Centered, 600px | Full width | Full width |

### 7.4 Creative

No changes to current responsive behavior — it already handles mobile well.

### 7.5 Cross-Department Nav

| Breakpoint | Behavior |
|------------|----------|
| Desktop | Department tabs in nav bar |
| Tablet | Department tabs in nav bar (abbreviated labels: `intel` / `strat` / `creat`) |
| Mobile | Hamburger menu with department list, or bottom tab bar |

**Mobile bottom tab bar option (preferred):**
```
┌─────────────────────────────────────┐
│          (content area)              │
│                                      │
├────────┬──────────┬────────┬────────┤
│  home  │  intel   │ strat  │ creat  │
│   ◇    │   ◇ ●   │   ◇    │   ◇    │
└────────┴──────────┴────────┴────────┘
```
- Fixed bottom bar, 4 items: home + 3 departments
- Active item highlighted with accent color
- Unread indicator dot on departments with new activity
- This replaces the top nav department tabs on mobile

### 7.6 Universal Search (Mobile)

- Full-screen overlay (same as desktop)
- Input at top of screen, results below
- Departments sections stack vertically
- Touch-friendly result items (44px min height)

---

## 8. Notification & Activity System

### 8.1 Unified Activity Feed

A new cross-department activity feed replaces the concept of checking each department separately.

**Data model:** Each activity event has:
```typescript
interface ActivityEvent {
  id: string;
  department: 'intelligence' | 'strategy' | 'creative';
  event_type: string;  // 'trend_detected', 'research_complete', 'build_deployed', etc.
  title: string;
  description: string;
  entity_id: string;   // trend_id, research_id, or project_id
  entity_type: 'trend' | 'research' | 'project';
  metadata: Record<string, unknown>;  // velocity, score, section count, etc.
  created_at: string;
}
```

**Display:** On the home dashboard (compact mode), the activity feed shows the 10 most recent events across all departments. Each event is a clickable card that navigates to the relevant detail view.

### 8.2 Attention Queue

A "needs attention" system surfaces items requiring user action:

| Trigger | Department | Action Required |
|---------|------------|-----------------|
| Trend scored > 70, no brief generated | Intelligence | "Generate brief or dismiss" |
| Trend velocity hit 5, no action taken | Intelligence | "Review trending topic" |
| Research complete, not exported/promoted | Strategy | "Export or promote to Creative" |
| Narrative ready for review | Creative | "Review and approve narrative" |
| PitchApp ready for review | Creative | "Review and approve PitchApp" |
| Trend declining, linked Creative project still in build | Cross-dept | "Trend declining — consider accelerating" |

The attention queue appears as a TerminalChrome card on the home dashboard and as a badge count on the nav.

### 8.3 Notification Routing

Existing NotificationBell component extends to handle cross-department notifications. Each notification includes a `department` field that determines its icon and navigation target.

---

## Summary: Component Reuse Map

| Existing Component | Reused In | Modifications |
|-------------------|-----------|---------------|
| `ProjectCard` | Trend cards, Research cards | New gradient maps, new metadata fields |
| `TerminalChrome` | Everything | None — core wrapper stays the same |
| `StatusDot` | Trend lifecycle, research status | New status values and colors |
| `BuildTheater` | Research theater | Different persona labels (RS/RA only) |
| `PipelineFlow` | Research pipeline, Intelligence scoring pipeline | Different node definitions |
| `PipelineActivity` | Research activity | Different job labels and ETAs |
| `ScoutChat` | Team notes (Intel), Scout (Strategy) | Context-specific prompts |
| `ProgressTimeline` | Research progress, Scoring progress | Different phase definitions |
| `Nav` | All views | New `department` prop, department tabs |
| `NotificationBell` | All views | New notification types, department badges |
| `ProjectDetailClient` layout | Trend detail, Research detail | Same split-view pattern, different content |

**New Components (to build):**
- `TriptychHome` — the three-panel portal / compact dashboard
- `TrendCard` — extends ProjectCard pattern for trends
- `ResearchCard` — extends ProjectCard pattern for research
- `VelocityBar` — 5-chevron velocity indicator
- `LifecycleBadge` — trend lifecycle label
- `SignalFeed` — realtime signal ingestion display
- `ScoringFlow` — 3-stage scoring modal
- `VelocityChart` — ASCII-style sparkline chart
- `BriefOutput` — pitch brief display card
- `JourneyTrail` — cross-department lineage visualization
- `UniversalSearch` — Cmd+K search overlay
- `ActivityFeed` — cross-department event stream
- `AttentionQueue` — "needs attention" card
- `DepartmentTabs` — nav component for department switching
- `TimingPulse` — real-time trend status for Creative projects

---

*End of UX flows document.*
