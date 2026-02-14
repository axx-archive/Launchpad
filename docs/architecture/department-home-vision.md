# Department Home Screen & Research-First Experience
## Creative Vision Document

> Product Lead perspective — feel, metaphor, copy, creative direction.
> This is a vision proposal, not a spec. Implementation details deferred to architect.

---

## The Core Tension

Right now, Launchpad has one door and one hallway: you create a "mission" and it becomes a PitchApp project. The pipeline does research as a step inside that hallway — pull → research → narrative → build → deploy. But research shouldn't always lead to a build. Sometimes you just want to understand a market. Sometimes you want a report, not a presentation. Sometimes you want to *start* with intelligence before you know what you're making.

The question isn't "how do we add a Research button." It's: **what does Launchpad become when it stops being a single-product pipeline?**

---

## The Metaphor: Studios, Not Departments

"Departments" sounds corporate. "Labs" sounds R&D. **Studios** feels right for the Launchpad DNA — each studio is a focused capability space where creative work happens, staffed by AI specialists and overseen by the user.

The mental model: you walk into a creative agency. The lobby has doors. Behind each door is a studio optimized for a different kind of work. Each studio has its own tools, its own AI team, its own vibe. But they share a building — they share your brand DNA, your materials, your intelligence.

**Studios, not silos.** Research done in the Intelligence Studio is available when you walk into the Creative Studio to build a PitchApp. The insight travels with you.

### The Studios

| Studio | Internal Code | Vibe | What Happens Here |
|--------|--------------|------|-------------------|
| **Intelligence** | `INT` | Quiet, analytical, deep | Market research, competitive analysis, audience profiling, trend mapping |
| **Creative** | `CRE` | Theatrical, cinematic, the original Launchpad | PitchApps — the full pipeline from narrative to deploy |
| **Strategy** | `STR` | Structured, narrative-first | Standalone narratives, positioning docs, messaging frameworks — story without build |

Three is the right number for now. Resist the urge to pre-build more. When there's a clear user need (analytics studio? email studio?), add it. But launching with three gives the architecture its shape without overcommitting.

**Why not two (Research + Build)?** Because the narrative layer is genuinely different from both. Someone might want a narrative brief and never build a PitchApp. Someone might want a positioning doc for a board meeting. Strategy is the bridge between raw intelligence and creative output — it deserves its own space.

---

## The Home Screen: The Lobby

### What It Feels Like

The lobby isn't a dashboard. It's a moment of choice. You've just walked in. The space is quiet, premium, a little theatrical. The greeting knows your name. The question is simple: *what are you working on?*

Think of it as the inverse of the current "mission control" — instead of showing you everything you've done, it asks you what you want to do *next*. Your active projects are still accessible (a small count, a link), but they're not the hero. The hero is the prompt.

### The Visual

The screen has three zones, stacked vertically:

**Zone 1: The Greeting (top)**
```
launchpad                                        — sign out

                    ── ── ── ── ──

              good evening, aj.

              3 active projects · 1 in build

                    ── ── ── ── ──
```

The greeting uses `font-display` (Cormorant Garamond) at hero scale. It's warm, not robotic. Time-aware ("good morning", "good evening"). The active project count is a small, clickable `font-mono` link that takes you to the project list (the current DashboardClient, now a secondary screen — "mission control" becomes the archive/project-list view, not the home view).

**Zone 2: The Studios (center)**

Three cards, side by side on desktop, stacked on mobile. Each card is a `TerminalChrome`-styled surface with:
- A two-letter code in `font-mono` (like BuildTheater's persona strip: `INT`, `CRE`, `STR`)
- A display-font name
- A one-line description in `text-muted`
- A status dot if work is in progress in that studio

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ ● ● ●  intelligence│  │ ● ● ●    creative  │  │ ● ● ●    strategy │
│                    │  │                    │  │                    │
│  INT               │  │  CRE               │  │  STR               │
│                    │  │                    │  │                    │
│  intelligence      │  │  creative studio   │  │  strategy          │
│                    │  │                    │  │                    │
│  market research,  │  │  interactive       │  │  narrative arcs,   │
│  competitive       │  │  pitchapps —       │  │  positioning,      │
│  analysis,         │  │  the full build    │  │  messaging          │
│  audience intel    │  │  pipeline          │  │  frameworks        │
│                    │  │                    │  │                    │
│  $ enter ▊         │  │  $ enter ▊         │  │  $ enter ▊         │
│                    │  │  2 active missions │  │                    │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

Design notes:
- Cards use the `TerminalChrome` wrapper (traffic light dots + title bar) to stay in the Launchpad visual language
- The `$ enter` prompt at the bottom is the CTA — clicking it takes you into that studio
- Cards have the 3D tilt hover from `ProjectCard` (perspective + rotateY/rotateX)
- The Creative card might have a subtle shimmer (the "building" state from ProjectCard) if builds are active
- Each card has a distinct gradient tint from the `GRADIENT_MAP` palette — gold for Creative (it's the original), a cool blue-green for Intelligence, a muted warm for Strategy
- The active project count per studio shows only if > 0, in `text-muted` at the bottom of the card

**Zone 3: Recent Activity (bottom)**

A compact horizontal strip — not a full project list, just a "recently touched" ticker showing 3-5 items. Each item is a small pill: `[INT] SaaS Market Report — 2h ago` or `[CRE] Series A Deck — in build`. Clicking any pill goes directly to that project.

This replaces the need for the project grid on the home screen while still giving a sense of motion and recency. The full project list ("mission control") is a link from the greeting zone or the nav.

### The Interaction

Clicking a studio card is the primary action. It takes you into that studio's "intake" flow — the equivalent of the current `/dashboard/new` but tailored to the studio.

### Empty State (First Visit)

When a user has zero projects across all studios, the studio cards are the same but the greeting changes:

```
welcome to launchpad.

you're standing in the lobby of a creative agency
staffed by AI. pick a studio to get started.
```

And the bottom zone shows nothing (no recent activity). The `WelcomeBlock` component's content about "how it works" moves into the individual studio intake flows where it's contextual.

---

## The Intelligence Studio (Research-First Flow)

### What It Feels Like

You've walked into a quiet room. There's a desk, a terminal, and an AI researcher waiting for a brief. The vibe is analytical — less cinematic than Creative, more precise. The accent color shifts subtly (a cooler tone — the blue-green from `GRADIENT_MAP.research_report`, or a dedicated intelligence palette).

### The Intake

The intake isn't a form. It's a conversation.

```
┌─────────────────────────────────────────────────┐
│ ● ● ●  intelligence — new brief                │
│                                                 │
│  INT                                            │
│                                                 │
│  what do you want to understand?                │
│                                                 │
│  $ ▊                                            │
│                                                 │
│  ── quick starts ──                             │
│                                                 │
│  market landscape    competitive analysis       │
│  audience profiling  trend mapping              │
│                                                 │
└─────────────────────────────────────────────────┘
```

The `$` prompt is the primary input — freeform text. "research the enterprise SaaS market for project management tools" or "who are the top 10 competitors to Notion?" or "profile seed-stage VC firms investing in climate tech."

The quick-start pills below are affordances for common research types. Clicking one pre-fills a template prompt but the user can edit it.

**There is no "company name" field.** Intelligence work isn't always company-specific. You might be researching a market before you have a company. Or researching your own competitive landscape. The system infers entities from the brief.

### The Research Experience

After submitting, the user enters a research workspace — not a project detail page, but a live research session.

```
┌─────────────────────────────────────────────────┐
│ ● ● ●  intelligence — saas market analysis      │
│                                                 │
│  [RS] researcher                  ● active      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 4/12          │
│  searching: "project management saas market     │
│  size 2025"                                     │
│                                                 │
│  ────────────────────────────────────           │
│                                                 │
│  [11:42:03] researcher: pulled market sizing    │
│             data from gartner, forrester        │
│  [11:42:18] researcher: analyzing competitive   │
│             positioning of top 8 players        │
│  [11:42:34] researcher: cross-referencing       │
│             funding rounds for market signals   │
│                                                 │
│  ── ── ──                                       │
│                                                 │
│  $ ask a follow-up or add constraints...  ▊     │
│                                                 │
└─────────────────────────────────────────────────┘
```

This reuses the BuildTheater pattern almost directly — persona strip, progress bar, live log. But with one critical difference: **the user can interrupt.** There's a live input at the bottom where the user can steer the research mid-stream: "focus more on pricing models" or "include European players too." This is the Scout chat pattern, but inside the research context.

### The Output: The Report

When research completes, the output is a structured report rendered inline — not a PDF, not a download, but a scrollable document within the Launchpad interface.

The report has sections (market overview, competitive landscape, key players, trends, opportunities) rendered with the same design language as the narrative preview (`NarrativePreview.tsx` — section cards with numbers and labels).

Below the report, two CTAs:

```
$ export as document ↓        $ take this to creative studio →
```

**Export** generates a downloadable PDF or markdown. **Take this to creative studio** is the handoff moment (see below).

### Iteration

The research workspace persists. The user can come back to it, ask follow-up questions via the `$` prompt, and the AI researcher adds to the report. Think of it as a living intelligence document, not a one-shot output.

The Intelligence Studio's project list shows these research briefs as cards — similar to ProjectCard but with the blue-green gradient and research-specific metadata (sources count, last updated, depth level).

---

## The Handoff Moment: Intelligence → Creative

This is the most important transition in the entire system. A user has done research. Now they want to turn it into something. How does that feel?

### Option A: The Promotion (Recommended)

The user is in their Intelligence report. They click **"take this to creative studio →"**. A modal appears — not a full page redirect, but an overlay in the TerminalChrome style:

```
┌─────────────────────────────────────────────────┐
│ ● ● ●  promote to creative studio               │
│                                                 │
│  your research will become the foundation       │
│  for a new pitchapp project.                    │
│                                                 │
│  $ project name: ▊                              │
│  $ company:      (pre-filled from research)     │
│  $ type:         investor pitch  proposal  ...  │
│  $ audience:     (pre-filled from research)     │
│                                                 │
│  the researcher's findings will be passed       │
│  to the narrative strategist as starting        │
│  material. you won't lose the original report.  │
│                                                 │
│  $ promote ▊                                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

Key details:
- Fields pre-filled from research (company names mentioned, audience inferred)
- The research report is linked to the new Creative project as "starting material" — the narrative strategist gets it as input instead of (or in addition to) uploaded documents
- The original Intelligence report stays accessible in the Intelligence Studio
- The `$ promote` action creates the project in Creative and (optionally) triggers the LaunchSequence

This is the "promote" verb — intelligence gets promoted to creative. Not "converted" (the research doesn't disappear), not "transferred" (it doesn't move). It's promoted — elevated to a new context.

### Option B: Start in Creative, Reference Research

The user goes to Creative Studio, starts a new mission the usual way, and in the materials section there's an option: **"attach research from Intelligence"** which shows their research reports as selectable items. The system pulls the report content into the pipeline as additional material.

This is the passive path — useful when someone does research first, goes away for a week, then comes back and starts a PitchApp from the Creative intake.

### Both paths should exist. The promotion is the theatrical, intentional path. The attachment is the practical, reconnection path.

---

## The Mission Note Intent Detection

The user creates a new Creative project and in the notes writes: "research the SaaS market before building." How does the system respond?

### The Scout Nudge

When the Creative pipeline's first step (auto-pull) ingests the project, it reads the notes. If it detects research intent — keywords like "research", "analyze", "investigate", "understand the market", "competitive landscape" — it **doesn't silently do research and continue**. Instead, it pauses and sends a Scout message:

```
scout: i noticed your notes mention research. would you
like me to run a deep research phase before we start
the narrative? this will take longer but produce a
more grounded story.

  [yes, go deep]    [skip, use what I gave you]
```

This is a decision point, not a redirect. The user stays in Creative. But the pipeline branches — if they say "go deep," it runs the Intelligence pipeline stage inline (same RS researcher persona, same depth) before continuing to narrative. If they say "skip," it uses only the uploaded materials.

### The Alternative: "I already have research"

If the notes say "I already have my own research" or "see attached deck for market data," Scout acknowledges and proceeds normally. No nudge. The system trusts the user's materials.

### The Detection Logic

This isn't a checkbox. It's not a dropdown. It's natural language parsed by the first pipeline agent (or by Scout at project creation). The patterns to detect:

- **Research request:** "research", "analyze the market", "competitive landscape", "who are the competitors", "market sizing"
- **Self-sufficient signal:** "I already have", "see attached", "research is done", "we've done our homework"
- **Ambiguous:** Everything else — proceed normally, no nudge

The key principle: **never surprise the user with extra work.** If the system is going to spend 10 minutes on deep research, ask first.

---

## The Strategy Studio

Brief note — Strategy is the third studio but the least urgent. Its core offering:

- **Standalone narratives:** The 6-beat arc methodology applied without a build
- **Positioning documents:** Brand positioning, competitive messaging
- **Messaging frameworks:** Taglines, value props, elevator pitches

The intake is similar to Intelligence (conversational) but oriented around "what story do you need to tell?" rather than "what do you need to understand?"

Strategy can also receive promotions from Intelligence (research → strategy doc) and feed into Creative (narrative → PitchApp). It's the middle studio — the bridge.

---

## Copy and Tone: The Studio Voice

### Studio Names and Prompts

Each studio has its own terminal prompt prefix, maintaining the `$` motif but with a studio marker:

| Studio | Prompt | Example |
|--------|--------|---------|
| Intelligence | `[INT] $` | `[INT] $ research the climate tech investment landscape` |
| Creative | `[CRE] $` | `[CRE] $ launchpad --submit` |
| Strategy | `[STR] $` | `[STR] $ build a positioning framework for...` |

The prompt prefix appears in logs, the live build theater, and the Scout chat when in studio context.

### Naming Convention

Studio names are always lowercase. Always one word when possible.

- "intelligence" not "Intelligence Studio" or "Market Intelligence Lab"
- "creative" not "Creative Studio" or "Build Lab"
- "strategy" not "Strategy Studio" or "Narrative Lab"

In the nav: `launchpad — intelligence` (same pattern as current `launchpad — mission control`)

In copy: "your intelligence brief is ready" not "your Intelligence Studio Research Report is complete"

### The Greeting Voice

The home screen greeting is warm but not chatty:

```
good morning, aj.
```

Not "Good morning, AJ! Welcome back to Launchpad! Ready to create something amazing?" That's assistant-brain. The Launchpad voice is confident, understated, and assumes the user is a professional who doesn't need to be cheerleaded.

### The Studio Card Copy

Each card has a two-line description that tells you what happens inside, not what the studio "is":

| Studio | Copy |
|--------|------|
| intelligence | "market research, competitive analysis, audience profiling" |
| creative | "interactive pitchapps — narrative to deploy" |
| strategy | "positioning, messaging frameworks, story arcs" |

Short. Lowercase. No periods. Action-oriented.

---

## How This Affects the Existing UI

### What Stays

- **ProjectCard** — stays exactly as is, used inside studio project lists
- **TerminalChrome** — the wrapper for everything, stays
- **BuildTheater** — reused for both Intelligence and Creative pipelines
- **ScoutChat** — reused with studio context
- **LaunchSequence** — stays for Creative studio launches
- **Nav** — stays, just the `sectionLabel` changes per studio

### What Moves

- **DashboardClient** (current home) → becomes the project list *within* a studio, or accessed via "mission control" as a cross-studio archive
- **NewProjectClient** (current `/dashboard/new`) → becomes the Creative Studio's intake. Intelligence and Strategy get their own intake flows.
- **WelcomeBlock** → breaks apart; the "how it works" content becomes studio-specific onboarding

### What's New

- **LobbyScreen** — the new home screen (greeting + studio cards + recent activity)
- **IntelligenceIntake** — conversational research brief input
- **ResearchWorkspace** — live research session (BuildTheater variant + Scout-like input)
- **ReportView** — structured research output renderer
- **PromoteFlow** — the modal for promoting Intelligence → Creative
- **StudioCard** — the studio selector card (TerminalChrome variant)

---

## Open Questions

1. **Should studios share a project list or have separate ones?** My instinct: separate, with a "mission control" view that aggregates across studios for power users.

2. **What's the URL structure?** `/intelligence`, `/creative`, `/strategy`? Or `/studio/intelligence`? The former is cleaner but uses up top-level routes.

3. **Do studios have different accent colors?** Subtle palette shifts could reinforce the "different rooms" feeling — Intelligence gets a cooler accent, Strategy gets a warmer muted tone, Creative keeps the original amber.

4. **Can a project live in multiple studios?** The promotion flow creates a *new* project in Creative that *references* the Intelligence report. But is the Intelligence report a "project"? Or just a document? This has data model implications.

5. **What about the admin view?** Admins see all projects across all studios. Does the admin panel get studio filters? Or does it stay as a flat list?

---

## Summary: The Feeling

Launchpad today feels like a single-purpose tool — you submit, we build, you review. It's good. But it's a hallway.

The department model turns Launchpad into a **building**. You choose which room to work in. The AI team works differently in each room. Research is quiet and deep. Creative is theatrical and cinematic. Strategy is structured and narrative-first.

The home screen is a lobby — calm, premium, with three doors. The greeting is warm. The choice is clear. You pick a door and the experience adapts.

The biggest moment isn't the home screen. It's the **handoff** — when research becomes narrative, when intelligence becomes creative output. That's the magic of having studios that share a brain. The research you did at 2am becomes the foundation of the pitch deck you build at 10am, and you didn't have to re-explain anything.

That's the feeling: **continuity across capabilities.** One building, many rooms, shared memory.
