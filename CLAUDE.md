# PitchApp

## What Is a PitchApp

A **PitchApp** is a scroll-driven, single-page interactive presentation — a modern, premium alternative to sending a PDF or slide deck.

**Core DNA (all PitchApps share):**
- Scroll-driven navigation with progress indicator
- Section-based structure (numbered, with labels)
- Hero → Sections → Closing arc
- Premium aesthetic, smooth animations
- Mobile + desktop optimized
- Deployed to Vercel

**Use cases:**
- Investor pitch decks (fundraising)
- Client proposals (sales)
- Strategy presentations (consulting)
- Case studies, portfolios, product launches

## Tech Stack Options

PitchApps can be built two ways. Choose based on context:

### Option A: Static HTML/CSS/JS + GSAP

Best for: Standalone presentations, investor decks, one-offs

```
app/
├── index.html      # Single page, all sections
├── css/style.css   # CSS variables for theming
├── js/app.js       # GSAP + ScrollTrigger animations
└── images/
```

**Characteristics:**
- No build tools, no bundler, no framework
- GSAP 3.x + ScrollTrigger from CDN
- Self-contained and independently deployable
- Deploy: `vercel --prod`

**Reference implementations:**
- `apps/onin/` - Investor deck (gold accent, dark theme)
- `apps/shareability/` - Investor deck (entertainment)

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
- `~/Site/chaos-labs-site/src/app/proposals/` — **Playbook** (`proposals/playbook/page.tsx`) is the primary reference: full section flow, all content components (PitchList, PitchHighlight, PitchColumns, PitchCallout, PitchPrice, PitchAccordion, PitchGrid), and PasswordGate

## Visual Principles

All PitchApps should feel:
- **Premium** — generous whitespace, refined typography
- **Confident** — bold statements, not salesy copy
- **Scroll-native** — built for the medium, not adapted from slides
- **Readable** — scannable headlines, short paragraphs

### CSS Theming (Static Option)

All visual theming controlled by CSS custom properties:

```css
:root {
    --color-bg:           #0a0a0a;    /* page background */
    --color-bg-card:      #141414;    /* card surfaces */
    --color-text:         #f0ede8;    /* primary text */
    --color-text-muted:   #9a9388;    /* secondary text */
    --color-accent:       #c8a44e;    /* brand accent */
    --font-display: 'Cormorant Garamond', serif;
    --font-body:    'DM Sans', sans-serif;
}
```

### Animation System (Static Option)

- **Library:** GSAP 3.12+ with ScrollTrigger
- **Fade-in:** Add class `anim-fade` for scroll-triggered fade-up
- **ScrollTrigger start:** `top 88%` for most elements
- **Stagger:** Elements within sections stagger by ~0.12s
- **Parallax:** Background images shift with `scrub: 1.5`
- **Counters:** `data-count`, `data-prefix`, `data-suffix` for animated numbers

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

**For strategy presentations:**
1. Hero (title + hook)
2. POV / Situation
3. System / Architecture
4. Offers / Components
5. Roadmap
6. Risks / Considerations
7. Next Steps

These are starting points, not rigid templates. Let the content drive the structure.

### Step 3: Build

**Static (GSAP):**
1. Copy from `templates/pitchapp-starter/` or reference `apps/` examples
2. Update CSS variables for brand colors
3. Replace section content
4. Add images to `images/`
5. Test locally: `python3 -m http.server 8080`
6. Deploy: `vercel --prod`

**Next.js (React):**
1. Define sections array with id, label, title, content (JSX)
2. Use PitchApp component with PitchList, PitchHighlight, etc.
3. Wrap in PasswordGate if needed
4. Deploy with site

### Step 4: Review

Use `@visual-qa` (global agent) to review the rendered output for:
- Visual hierarchy and readability
- Animation smoothness
- Responsive behavior
- Overall polish

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

### Other Agents

For other pipeline stages, use global agents with PitchApp context:

| Stage | Agent | Notes |
|-------|-------|-------|
| Copy polish | Direct work or @copywriter skill | Read narrative brief, apply to section structure |
| Build | @mvp-builder or @frontend-design | Reference this CLAUDE.md + templates |
| Visual QA | @visual-qa | Check rendered output, animations, responsive |
| Code review | @code-review skill | For complex implementations |

The specialized @copywriter, @pitchapp-developer, and @pitchapp-visual-qa agents in `.claude/agents/` contain domain-specific guidance that can be referenced, but global agents can handle most work when given proper context.

---

## Folder Structure

```
PitchApp/
├── CLAUDE.md                     # this file
├── .claude/
│   └── agents/
│       └── narrative-strategist.md   # Story extraction (the gem)
├── apps/
│   └── {name}/                   # Built PitchApps (static)
├── templates/
│   └── pitchapp-starter/         # Starter template (static)
├── docs/
│   └── CONVENTIONS.md            # Deep reference for static builds
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
5. @visual-qa review
6. Deploy
```

### Quick Build (content already clear)

```
1. Define sections directly
2. Build PitchApp
3. Review and iterate
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

---

## Reference Files

- Static starter template: `templates/pitchapp-starter/`
- Full static conventions: `docs/CONVENTIONS.md`
- Narrative methodology: `.claude/agents/narrative-strategist.md`
- React components: `~/Site/chaos-labs-site/src/components/PitchApp.tsx`
- React reference proposal: `~/Site/chaos-labs-site/src/app/proposals/playbook/page.tsx` (Playbook — full section flow, all content components)