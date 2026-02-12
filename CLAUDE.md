# PitchApp

## What Is a PitchApp

A **PitchApp** is a scroll-driven, single-page interactive presentation — a modern, premium alternative to sending a PDF or slide deck.

Instead of flipping through static slides, the viewer scrolls through a cinematic, full-screen experience with smooth animations and a clear narrative arc. It's a URL you send to someone — they open it, scroll through it, and walk away understanding the story. No downloads, no deck attachments, no "let me walk you through this."

**Core DNA (all PitchApps share):**
- Scroll-driven navigation with progress indicator
- Section-based structure (numbered, with labels)
- Hero → Sections → Closing arc
- Premium aesthetic, smooth animations
- Mobile + desktop optimized
- Self-contained — each PitchApp is independently deployable
- Deployed to Vercel as a standalone URL

**Use cases:**
- Investor pitch decks (fundraising)
- Client proposals (sales)
- Strategy presentations (consulting)
- Case studies, portfolios, product launches
- Company/studio landing pages

---

## Visual Principles

All PitchApps should feel:
- **Premium** — generous whitespace, refined typography, no clutter
- **Confident** — bold statements, not salesy copy
- **Scroll-native** — built for the medium, not adapted from slides
- **Cinematic** — atmospheric backgrounds, desaturated imagery, controlled contrast
- **Readable** — scannable headlines, short paragraphs

### Color System

All theming is controlled by CSS custom properties. A typical palette:

```css
:root {
    --color-bg:           #0a0a0a;    /* page background (near-black) */
    --color-bg-card:      #141414;    /* card/surface background */
    --color-bg-raised:    #1e1e1e;    /* hover states, elevated surfaces */
    --color-text:         #f0ede8;    /* primary text (warm off-white) */
    --color-text-muted:   #9a9388;    /* secondary/supporting text */
    --color-accent:       #c8a44e;    /* brand accent */
    --color-accent-light: #e2c97e;    /* lighter accent for subtitles */
    --color-accent-dim:   rgba(200,164,78,0.15); /* tinted backgrounds */
}
```

The accent color is the brand's identity. Everything else stays in the neutral dark palette.

### Typography

Two font families minimum, sometimes three:
- **Display** — a serif for headlines, titles, and big statements (default: Cormorant Garamond)
- **Body** — a clean sans-serif for everything else (default: DM Sans)
- **Mono** — optional, for tech accents, labels, nav elements (e.g., JetBrains Mono)

All type sizes use `clamp()` for fluid scaling:

| Element | Size Range |
|---------|-----------|
| Hero title | 64px → 160px |
| Section headlines | 26px → 46px |
| Big statements | 40px → 90px |
| Metric values | 40px → 64px |
| Body text | 14px → 17px |

### Image Treatment

Background images follow a consistent cinematic treatment:
- Opacity: 15–35% (dimmed so text reads clearly)
- Saturation: 70–90% (desaturated for mood)
- Wash overlay: gradient from dark to transparent, direction varies by section
- Parallax: subtle vertical shift on scroll (`y: 15%`, scrubbed)

### Image-Free PitchApps

Not all PitchApps need images. Abstract/tech aesthetics work with:
- CSS grid backgrounds (lines, dots, patterns)
- Cursor-following glow effects (`pointer: coarse` for mobile detection)
- Product card grids with gradient headers
- Terminal typing animations
- CSS-only loader animations (flames, pulses, etc.)

Reference: `apps/bonfire/` — a complete PitchApp with zero images.

---

## Tech Stack Options

PitchApps can be built two ways. Choose based on context:

### Option A: Static HTML/CSS/JS + GSAP

Best for: Standalone presentations, investor decks, studio pages, one-offs

```
app/
├── index.html      # Single page, all sections
├── css/style.css   # CSS variables for theming
├── js/app.js       # GSAP + ScrollTrigger animations
└── images/
```

**Characteristics:**
- No build tools, no bundler, no framework
- GSAP 3.12+ with ScrollTrigger + ScrollToPlugin from CDN
- Self-contained and independently deployable
- Deploy: `vercel --prod`

**Reference implementations:**
- `apps/onin/` — Investor deck (gold accent, cinematic imagery)
- `apps/bonfire/` — Studio landing page (no images, abstract tech aesthetic, product grid + terminal)

### Option B: Next.js + React Components

Best for: Proposals embedded in existing sites, password-gated content

```tsx
<PitchApp
  title="Proposal Title"
  subtitle="The hook"
  sections={[
    { id: 'problem', label: 'The Problem', title: 'The Problem', content: <></> },
    // ...
  ]}
/>
```

**Characteristics:**
- Reusable React components (PitchList, PitchHighlight, PitchColumns, etc.)
- Can be password-gated
- Integrates with existing Next.js site
- CSS Modules for styling

**Reference implementation:**
- `~/Site/chaos-labs-site/src/components/PitchApp.tsx`
- `~/Site/chaos-labs-site/src/app/proposals/` — **Playbook** (`proposals/playbook/page.tsx`) is the primary reference

---

## Animation System (Static Option)

- **Library:** GSAP 3.12+ with ScrollTrigger + ScrollToPlugin
- **Fade-in:** Add class `anim-fade` for scroll-triggered fade-up
- **ScrollTrigger start:** `top 88%` for most elements
- **Stagger:** Elements within sections stagger by ~0.12s
- **Parallax:** Background images shift with `scrub: 1.5`
- **Counters:** `data-count`, `data-prefix`, `data-suffix` for animated numbers
- **Card interactions:** Subtle tilt on mousemove with `transformPerspective: 800`

### GSAP Gotchas (Known Bugs)

These are hard-won patterns — violating them causes real bugs:

| Gotcha | Problem | Fix |
|--------|---------|-----|
| **ScrollToPlugin not registered** | Smooth scroll links silently fail | Always `gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)` — register ALL plugins explicitly |
| **`gsap.from()` causes FOUC** | Elements flash at full opacity then animate from hidden state | Use `gsap.to()` with CSS defaults (`opacity: 0; transform: scale(0.94)`) — animate TO the visible state |
| **`scroll-behavior: smooth` in CSS** | Conflicts with GSAP's programmatic scrolling, causes janky double-scroll | Never use CSS smooth scroll alongside GSAP — remove it from `html` |
| **Unscoped selectors** | `.hero-grid-bg` hits both hero and closing section when class is reused | Always scope: `.section-hero .hero-grid-bg` |
| **Mobile stale dimensions** | `offsetWidth/Height` captured once at init breaks on orientation change | Read dimensions fresh inside animation loops, not at init time |
| **Terminal overflow on mobile** | `white-space: nowrap` causes horizontal scroll on narrow screens | Add `max-height`, `overflow-y: auto`, and `pre-wrap` at mobile breakpoints |

### Mobile Interaction Patterns

- **Touch detection:** Use `window.matchMedia('(pointer: coarse)').matches` — more reliable than user agent sniffing
- **Tap-to-move:** Add `touchstart` listener (with `{ passive: true }`) for interactive elements like glow effects
- **Ambient drift:** For cursor-following effects on mobile, use a `glowDrift()` loop with random positions — tap interrupts and repositions, then resumes drift
- **Fresh dimensions:** Always read `element.offsetWidth/Height` inside the animation callback, not once at init — orientation changes invalidate cached values

For full animation timing tables, ScrollTrigger positions, and stagger values, see `docs/CONVENTIONS.md` sections 3–4.

---

## Section Types

PitchApps are composed from a catalog of section types. The 13 standard types are documented in detail in `docs/CONVENTIONS.md` with exact HTML patterns, CSS classes, and animation specs. Read that file when actively building.

### Standard Types (Quick Reference)

| Type | Purpose |
|------|---------|
| **Hero** | Opening — background image or abstract grid, centered title, scroll prompt |
| **Closing** | Ending — brand echo, CTA, copyright |
| **Text-Centered** | Mission statements, positioning |
| **Numbered Grid** | 2x2 pillars with thin borders |
| **Background Stats** | Metrics with animated counters |
| **Metric Grid** | 3-column large numbers |
| **Background Statement** | Big claim with background image |
| **Card Gallery** | 2-column image cards |
| **Split Image+Text** | 50/50 with clip-path reveal |
| **List** | Problems/points with icons |
| **Dual Panel** | Side-by-side image comparison |
| **Team Grid** | Circular photos with names |
| **Summary** | Numbered takeaway blocks |

### Custom Section Types

Not every PitchApp uses the standard catalog. Custom sections are encouraged when the content demands it. Document custom patterns in the app's README.md.

**Examples from existing apps:**
- **Product Grid** (`apps/bonfire/`) — OS-style dashboard cards with gradient headers, status dots, SVG icons, 3-column responsive grid
- **Terminal** (`apps/bonfire/`) — Typing animation triggered by ScrollTrigger, character-by-character rendering with auto-scroll
- **Flame Loader** (`apps/bonfire/`) — CSS-only fire animation with layered flame shapes + rising ember particles, no external dependencies

### Typical Section Flows

**Investor deck:**
Hero → Text-Centered (mission) → Numbered Grid (pillars) → Background Stats (traction) → Background Statement (product) → Card Gallery (portfolio) → Split (differentiator) → Team Grid → Summary → Closing

**Proposal:**
Hero → Text-Centered (the goal) → Numbered Grid (approach) → Metric Grid (what you get) → Split (why this works) → Background Statement (investment) → Closing

**Studio/company page:**
Hero → Product Grid (tools/products) → Terminal or Team section → Closing

These are starting points. The content drives the structure, not the other way around.

---

## Creating a PitchApp

### Step 1: Find the Story

Before building anything, find the story. Use `@narrative-strategist` (see agents below).

The goal isn't to organize information into sections — it's to find the arc that makes someone lean in.

### Step 2: Structure the Sections

Map the narrative to sections. Common patterns:

**For investor decks:**
1. Hero (title + hook)
2. Problem / Opportunity
3. Insight / Solution
4. Proof / Traction
5. How it works
6. Team
7. The Ask
8. Closing

**For proposals:**
1. Hero (title + hook)
2. The Goal / Problem
3. The Approach
4. What You Get
5. Why This Works
6. Investment
7. Closing / CTA

**For studio/company pages:**
1. Hero (brand + tagline)
2. Products/Tools (grid)
3. Team or Process
4. Closing

These are starting points, not rigid templates. Let the content drive the structure.

### Step 3: Build

**Static (GSAP):**
1. Copy from `templates/pitchapp-starter/` or use `/pitchapp new <name>`
2. Update CSS variables for brand colors
3. Replace section content
4. Add images to `images/` (or build image-free)
5. Test locally: `python3 -m http.server 8080`
6. Deploy: `vercel --prod`

**Next.js (React):**
1. Define sections array with id, label, title, content (JSX)
2. Use PitchApp component with PitchList, PitchHighlight, etc.
3. Wrap in PasswordGate if needed
4. Deploy with site

### Step 4: Review

Use `/pitchapp review` to spin up a full review team, or manually:

1. **Capture screenshots** with Playwright (see Visual QA section below)
2. Use `@visual-qa` to review rendered output
3. Use `@code-review` skill for implementation quality
4. Fix bugs first, then iterate copy

---

## Visual QA and Screenshots

### Capturing Screenshots with Playwright

PitchApps are visual — code review alone can't catch layout issues, animation glitches, or responsive problems. Always capture screenshots before review.

```bash
# Start a local server
cd apps/{name} && python3 -m http.server 8080 &

# Capture desktop screenshot
npx playwright screenshot --viewport-size="1440,900" --full-page http://localhost:8080 screenshots/desktop-full.png

# Capture mobile screenshot
npx playwright screenshot --viewport-size="390,844" --full-page http://localhost:8080 screenshots/mobile-full.png

# Capture tablet screenshot
npx playwright screenshot --viewport-size="768,1024" --full-page http://localhost:8080 screenshots/tablet-full.png

# Kill the server
kill %1
```

Screenshots go in `apps/{name}/screenshots/` (git-ignored) and are fed to `@visual-qa` or `/pitchapp review` for analysis.

### Review Priorities

1. **Fix code bugs first** — animation failures, FOUC, scroll conflicts
2. **Then visual polish** — spacing, alignment, hierarchy
3. **Then copy** — iterate language with the user
4. **Then responsive** — test all breakpoints
5. **Then deploy** — with meta tag verification

---

## Deployment Checklist

Before deploying any PitchApp:

- [ ] Test locally (`python3 -m http.server 8080`)
- [ ] No console errors
- [ ] Scroll animations work on desktop and mobile
- [ ] **OG meta tags set** — `og:title`, `og:description`, `og:type` (these control how the link looks when shared)
- [ ] **Twitter card meta tags** — `twitter:card`, `twitter:title`, `twitter:description`
- [ ] `<title>` tag matches brand (this shows in browser tabs and link previews)
- [ ] Responsive at mobile, tablet, and desktop
- [ ] Images optimized (JPEG, under 400KB each, total under 5MB)
- [ ] Copyright/attribution present if needed

```bash
cd apps/{name}
vercel link       # first time: create Vercel project
vercel --prod     # deploy to production
```

After deploy, verify the production URL and test link sharing preview (paste URL into Messages/Slack to check OG rendering).

---

## Agents

### @narrative-strategist (Primary)

**The key agent.** Finds the story in messy inputs (transcripts, notes, scattered materials).

Location: `.claude/agents/narrative-strategist.md`

Use when:
- You have a transcript or raw materials
- The story hasn't emerged yet
- An existing pitch feels flat

Core principle: **Story discovery over structure application.**

The output is a narrative brief — the spine that all copy flows from.

### Pipeline Agents

The specialized agents in `.claude/agents/` handle specific pipeline stages:

| Agent | Role | Location |
|-------|------|----------|
| `@narrative-strategist` | Story extraction from raw materials | `.claude/agents/narrative-strategist.md` |
| `@copywriter` | Narrative brief → emails, PitchApp copy, slides | `.claude/agents/copywriter.md` |
| `@pitchapp-developer` | Copy → working PitchApp build | `.claude/agents/pitchapp-developer.md` |
| `@pitchapp-visual-qa` | Review rendered output against conventions | `.claude/agents/pitchapp-visual-qa.md` |
| `@pitch-pipeline` | Orchestrate full transcript → PitchApp flow | `.claude/agents/pitch-pipeline.md` |

### Review Team Pattern

For comprehensive review of a built PitchApp, use `/pitchapp review` which creates an agent team with:

| Role | Focus |
|------|-------|
| **Product Lead** | Is this CEO-friendly? Would the target audience get it immediately? |
| **Copywriter** | Does the language feel human, confident, on-brand? |
| **Copy Critic** | Flag anything that sounds like AI wrote it or feels generic |
| **UX/UI Expert** | Flow, hierarchy, mobile experience, card interactions |
| **Code Reviewer** | GSAP bugs, FOUC, scroll conflicts, mobile issues, performance |

This uses the real agent team infrastructure (`/agent-team` protocol) — not independent subagents. The team shares a task list, communicates via messages, and coordinates findings.

### Global Agents

For individual review tasks, these global agents work well with PitchApp context:

| Stage | Agent | Notes |
|-------|-------|-------|
| Build | @mvp-builder or @frontend-design | Reference this CLAUDE.md + templates |
| Visual QA | @visual-qa | Feed it Playwright screenshots |
| Code review | @code-review skill | For implementation quality |
| Design review | @ux-designer | For UX/accessibility concerns |

---

## Skills

### PitchApp-Specific Skills

| Skill | Purpose |
|-------|---------|
| `/pitchapp new <name>` | Scaffold a new PitchApp from template, set up brand colors, create Vercel project |
| `/pitchapp review` | Capture screenshots, create agent team for comprehensive review |

### Knowledge Skills (Reference)

These provide domain knowledge for agents and workflows:

| Skill | Content | Location |
|-------|---------|----------|
| `pitch-narrative` | 6-beat investor pitch arc methodology | `.claude/skills/pitch-narrative.md` |
| `investor-comms` | Email writing patterns and templates | `.claude/skills/investor-comms.md` |
| `pitchapp-sections` | Quick reference for 13 section types | `.claude/skills/pitchapp-sections.md` |

---

## Folder Structure

```
PitchApp/
├── CLAUDE.md                     # this file
├── .claude/
│   ├── agents/
│   │   ├── narrative-strategist.md   # Story extraction
│   │   ├── copywriter.md            # Copy generation
│   │   ├── pitchapp-developer.md    # Build from copy
│   │   ├── pitchapp-visual-qa.md    # Visual review
│   │   └── pitch-pipeline.md        # Full orchestration
│   └── skills/
│       ├── pitch-narrative/          # 6-beat arc methodology
│       ├── investor-comms/           # Email patterns
│       ├── pitchapp-sections/        # Section type reference
│       ├── pitchapp-new/             # /pitchapp new scaffold skill
│       └── pitchapp-review/          # /pitchapp review team skill
├── apps/
│   └── {name}/                   # Built PitchApps (static)
│       ├── index.html
│       ├── css/style.css
│       ├── js/app.js
│       ├── images/
│       ├── screenshots/          # Playwright captures (git-ignored)
│       └── README.md
├── templates/
│   └── pitchapp-starter/         # Starter template (static)
├── docs/
│   ├── CONVENTIONS.md            # Deep technical reference for static builds
│   └── PITCH-TEAM-GUIDE.md      # Non-technical guide for founders
└── tasks/
    └── {company}/                # Pipeline outputs
        ├── transcript.txt
        ├── narrative.md
        └── pitchapp-copy.md
```

---

## Workflow Patterns

### Full Pipeline (transcript → PitchApp)

```
1. @narrative-strategist on transcript → narrative.md
2. User approves narrative
3. Map narrative to sections → pitchapp-copy.md
4. Build PitchApp from copy
5. /pitchapp review (agent team)
6. Fix bugs first, then iterate copy
7. Deploy with OG meta tag verification
```

### Quick Build (content already clear)

```
1. /pitchapp new <name> (scaffold)
2. Define sections directly
3. Build PitchApp
4. /pitchapp review
5. Deploy
```

### Proposal from Brief

```
1. Review brief/requirements
2. Draft sections inline
3. Build using Next.js PitchApp component
4. Password-gate and deploy
```

---

## Important Rules

- **Story first.** Don't start building until the narrative is clear.
- **Sections serve the story.** Don't force content into a template.
- **Premium by default.** Generous spacing, confident copy, smooth animations.
- **Mobile matters.** Test responsive behavior, not just desktop.
- **Self-contained.** Each PitchApp should be independently deployable.
- **Fix bugs first.** Code bugs before copy polish — always.
- **Screenshots for review.** Use Playwright to capture before visual QA — code review can't catch visual issues.
- **OG tags for sharing.** Every PitchApp needs proper meta tags — the link preview is part of the experience.

---

## Reference Files

- Static starter template: `templates/pitchapp-starter/`
- Deep technical reference (section HTML, CSS architecture, animation timing): `docs/CONVENTIONS.md`
- Narrative methodology: `.claude/agents/narrative-strategist.md`
- React components: `~/Site/chaos-labs-site/src/components/PitchApp.tsx`
- React reference proposal: `~/Site/chaos-labs-site/src/app/proposals/playbook/page.tsx`
