# What Is a PitchApp

A **PitchApp** is a scroll-driven, single-page interactive presentation — a modern, premium alternative to sending a PDF or slide deck.

Instead of flipping through static slides, the viewer scrolls through a cinematic, full-screen experience with smooth animations, background imagery, and a clear narrative arc. It's designed to make someone lean in.

## Why It Exists

Slide decks were built for conference rooms with projectors. They don't translate well to the way people actually consume content now — alone, on their laptop or phone, at their own pace.

A PitchApp is built for that reality. It's a URL you send to someone. They open it, scroll through it, and walk away understanding the story. No downloads, no deck attachments, no "let me walk you through this."

## What It's For

- **Investor pitch decks** — fundraising narratives that tell the story, not just list the metrics
- **Client proposals** — selling an approach, not shipping a PDF
- **Strategy presentations** — internal or external, for alignment and buy-in
- **Case studies, portfolios, product launches** — anything that benefits from a premium, scroll-native format

---

## Core DNA

Every PitchApp shares these characteristics:

| Trait | What It Means |
|-------|---------------|
| **Scroll-driven** | Navigation is scrolling. A thin progress bar shows position. Sections are numbered with labels. |
| **Section-based** | Content is organized into full-screen (or near-full-screen) sections, each with a purpose. |
| **Hero → Sections → Closing** | Every PitchApp follows this arc. The hero hooks, sections deliver, the closing lands. |
| **Premium aesthetic** | Dark backgrounds, generous whitespace, refined typography, cinematic image treatment. |
| **Animated** | Elements fade in, parallax, count up, clip-reveal — all driven by scroll position. |
| **Responsive** | Designed for desktop and mobile. Not an afterthought — a first-class experience on both. |
| **Self-contained** | Each PitchApp is a standalone site. One URL, independently deployable. |

---

## The Visual Language

### Look and Feel

PitchApps should feel:

- **Premium** — generous whitespace, refined typography, no clutter
- **Confident** — bold statements, not salesy copy
- **Scroll-native** — built for the medium, not adapted from slides
- **Cinematic** — background images are desaturated, dimmed, and washed to create atmosphere without competing with text

### Color System

All theming is controlled by CSS custom properties. A typical palette:

```css
:root {
    --color-bg:           #0a0a0a;    /* page background (near-black) */
    --color-bg-card:      #141414;    /* card/surface background */
    --color-bg-raised:    #1e1e1e;    /* hover states, elevated surfaces */
    --color-text:         #f0ede8;    /* primary text (warm off-white) */
    --color-text-muted:   #9a9388;    /* secondary/supporting text */
    --color-accent:       #c8a44e;    /* brand accent (gold in this example) */
    --color-accent-light: #e2c97e;    /* lighter accent for subtitles */
    --color-accent-dim:   rgba(200,164,78,0.15); /* tinted backgrounds */
}
```

The accent color is the brand's color. Everything else stays in the neutral dark palette. This keeps the focus on content while giving each PitchApp its own identity.

### Typography

Two font families, always:

- **Display** — a serif for headlines, titles, and big statements (default: Cormorant Garamond)
- **Body** — a clean sans-serif for everything else (default: DM Sans)

All type sizes use `clamp()` for fluid scaling between mobile and desktop:

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

---

## Section Types

PitchApps are composed from a catalog of section types. Each is a self-contained layout pattern that can be mixed and matched in any order (except Hero is always first, Closing is always last).

### Structural Bookends

| Type | Purpose |
|------|---------|
| **Hero** | Full-bleed background image with centered title, tagline, and scroll prompt. Sets the tone. |
| **Closing** | Background image with brand echo and back-to-top button. Lands the story. |

### Content Sections

| Type | Purpose | Layout |
|------|---------|--------|
| **Text-Centered** | Mission statements, positioning, big ideas | Centered serif headline with italic accent words |
| **Numbered Grid** | Pillars, principles, key points | 2×2 grid of numbered blocks with thin borders |
| **Background Stats** | Metrics, traction, proof points | Background image with animated counters and callout pills |
| **Metric Grid** | Comparable metrics, side-by-side numbers | 3-column grid of large values with descriptions |
| **Background Statement** | Product intros, big reveals | Background image with large centered title stack |
| **Card Gallery** | Visual showcases, portfolio items | 2-column image cards with overlay labels |
| **Split Image+Text** | Features, detailed explanations | 50/50 image + text with clip-path reveal |
| **List** | Comparisons, problem/solution, before/after | Background image with left-aligned items (✕ and → icons) |
| **Dual Panel** | Contrasts, two-sided comparisons | Two side-by-side image panels with overlay text |
| **Team Grid** | People, leadership, advisors | Circular photos with names and roles |
| **Summary** | Key takeaways, recap | Numbered vertical blocks with left-border accent |

### Typical Section Flows

**Investor deck:**
Hero → Text-Centered (mission) → Numbered Grid (pillars) → Background Stats (traction) → Background Statement (product) → Card Gallery (portfolio) → Split (differentiator) → Team Grid → Summary → Closing

**Proposal:**
Hero → Text-Centered (the goal) → Numbered Grid (approach) → Metric Grid (what you get) → Split (why this works) → Background Statement (investment) → Closing

These are starting points. The content drives the structure, not the other way around.

---

## Animation System

Animations are powered by GSAP 3.12+ with ScrollTrigger. Everything is scroll-driven — elements animate in as the viewer reaches them.

### How Elements Animate In

- **Fade-up** — the default. Elements translate up ~24px and fade from 0 to 1. Trigger: `top 88%` viewport.
- **Stagger** — elements within a section animate sequentially, ~0.12s apart.
- **Scale-in** — gallery cards scale from 0.92 to 1.
- **Clip-path reveal** — split images reveal from left via `inset()` clip-path.
- **Counter** — numbers count from 0 to target over 2.2 seconds.
- **Parallax** — background images shift vertically with scroll, scrubbed at 1.5.

### Timing

| Animation | Duration | Easing |
|-----------|----------|--------|
| Fade-in | 0.9s | power2.out |
| Hero reveal | 1.0–1.4s | power3.out |
| Gallery scale | 1.2s | power2.out |
| Clip-path | 1.4s | power3.inOut |
| Counter | 2.2s | power2.out |
| Smooth scroll | 1.2s | power3.inOut |

---

## Tech Stack

PitchApps can be built two ways:

### Option A: Static HTML/CSS/JS + GSAP

Best for standalone presentations, investor decks, one-offs.

```
app/
├── index.html        # Single page, all sections
├── css/style.css     # CSS variables for theming
├── js/app.js         # GSAP + ScrollTrigger animations
└── images/
```

- No build tools, no bundler, no framework
- GSAP 3.12+ and ScrollTrigger loaded from CDN
- Self-contained and independently deployable
- Deploy with `vercel --prod`

### Option B: Next.js + React Components

Best for proposals embedded in an existing site, password-gated content.

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

- Reusable React components: `PitchList`, `PitchHighlight`, `PitchColumns`, `PitchCallout`, `PitchPrice`, `PitchAccordion`, `PitchGrid`
- Can be wrapped in `PasswordGate` for access control
- CSS Modules for styling
- Deploys with the host Next.js site

**Reference implementation:** Chaos Labs site — `~/Site/chaos-labs-site/src/components/PitchApp.tsx` and proposal pages under `src/app/proposals/`. The **Playbook** proposal (`proposals/playbook/page.tsx`) is a strong example: full section flow, PitchList, PitchHighlight, PitchColumns, PitchCallout, PitchPrice, PitchAccordion, PitchGrid, and PasswordGate.

---

## The Process

### Story First

The most important rule: **find the story before building anything.**

A PitchApp isn't a container for information — it's a vehicle for a narrative. The goal is to find the arc that makes someone lean in, not to organize bullet points into sections.

The process:

1. **Extract the narrative** — from transcripts, notes, decks, conversations. What's the core tension? What's the insight? What's the transformation?
2. **Map narrative to sections** — each section serves a purpose in the arc. If a section doesn't advance the story, cut it.
3. **Build** — choose the right section types, write confident copy, add imagery.
4. **Review** — check visual hierarchy, animation smoothness, responsive behavior, overall polish.

### Common Patterns

**Full pipeline** (from raw materials):
Transcript/notes → Narrative extraction → Section mapping → Copy → Build → Visual QA → Deploy

**Quick build** (content already clear):
Define sections → Build → Review → Deploy

**Proposal from brief**:
Review requirements → Draft sections → Build with React components → Password-gate → Deploy

---

## Responsive Behavior

PitchApps use a mobile-first approach with three breakpoints:

| Breakpoint | Width | What Changes |
|------------|-------|-------------|
| Mobile (base) | < 480px | Single column, stacked layouts, fluid type |
| Tablet | 640px+ | Grids go multi-column, gallery side-by-side |
| Desktop | 768px+ | Split layouts and dual panels go horizontal |

Key responsive patterns:
- Grids collapse from multi-column to single-column on mobile
- Split sections stack vertically (image on top, text below)
- Dual panels stack at 50vh each
- Typography scales fluidly via `clamp()` — no breakpoint jumps

---

## Performance

- **Images:** JPEG, optimized for web. Individual images under 400KB, total under 5MB per PitchApp.
- **Image treatment:** `object-fit: cover` with CSS `opacity` and `filter: saturate()` — no image editing needed.
- **GPU:** Only the hero background image uses `will-change: transform`. GSAP handles GPU promotion for scroll animations internally.
- **Z-index stacking:** Loader (10000) → Film grain (9000) → Navigation (8000) → Content (1–2) → Default (0).
- **Viewport units:** Hero uses `100dvh` (dynamic viewport height) for correct mobile behavior.

---

## Deployment

Each PitchApp deploys as its own Vercel project:

```bash
cd apps/{name}
vercel link       # create or link a Vercel project
vercel --prod     # deploy to production
```

The result is a single URL you can send to anyone. No login, no download, no software required. Just a link.
