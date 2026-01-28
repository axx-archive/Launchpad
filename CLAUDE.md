# PitchApp Workspace

## What This Is

Multi-app workspace for scroll-driven, GSAP-animated investor pitch decks. Each PitchApp is a standalone static site (HTML + CSS + JS) deployed independently to Vercel.

## Folder Structure

```
PitchApp/
├── CLAUDE.md                     # this file
├── README.md                     # workspace overview
├── .gitignore
├── apps/
│   ├── onin/                     # ONIN PitchApp (live)
│   │   ├── index.html
│   │   ├── css/style.css
│   │   ├── js/app.js
│   │   ├── images/
│   │   └── README.md
│   └── shareability/             # Shareability PitchApp (scaffold)
│       ├── index.html
│       ├── css/style.css
│       ├── js/app.js
│       ├── images/
│       └── README.md
├── templates/
│   └── pitchapp-starter/         # starter template for new apps
│       ├── index.html
│       ├── css/style.css
│       ├── js/app.js
│       ├── images/.gitkeep
│       └── README.md
├── docs/
│   └── CONVENTIONS.md            # full playbook
├── sources/
│   ├── onin/ONIN.pptx            # git-ignored source files
│   └── shareability/.gitkeep
└── tasks/                        # planning artifacts
```

## What Is a PitchApp

A PitchApp is a scroll-driven investor pitch deck built as a static website. Key characteristics:

- **Static HTML/CSS/JS** -- no build step, no bundler, no framework
- **GSAP + ScrollTrigger** -- scroll-triggered animations, parallax, counter animations
- **Single page** -- all sections in one `index.html`, scroll-driven navigation
- **Deployed to Vercel** -- each app is its own Vercel project
- **Self-contained** -- each app has its own CSS, JS, and images; no shared dependencies between apps

## How to Create a New PitchApp

1. Copy `templates/pitchapp-starter/` to `apps/{new-name}/`
2. Update CSS variables in `:root` for brand colors (in `css/style.css`)
3. Update loader wordmark letters and nav logo text (in `index.html`)
4. Replace placeholder section content with real content
5. Add images to `apps/{new-name}/images/`
6. Delete any section types not needed
7. Run locally: `open index.html` or `python3 -m http.server 8080`
8. Deploy: `cd apps/{new-name} && vercel link && vercel --prod`

## Section Types Available

| # | Type | Class | Description |
|---|------|-------|-------------|
| 1 | Hero | `.section-hero` | Full-bleed background image, title reveal, scroll prompt |
| 2 | Text-Centered | `.section-text-centered` | Centered label + headline with italic emphasis |
| 3 | Numbered Grid | `.section-numbered-grid` | 2x2 grid of numbered text blocks |
| 4 | Background Stats | `.section-bg-stats` | Background image, headline, animated counters, callout pills |
| 5 | Metric Grid | `.section-metric-grid` | 3-column large metric cards with summary |
| 6 | Background Statement | `.section-bg-statement` | Background image, centered title/subtitle stack |
| 7 | Card Gallery | `.section-card-gallery` | Large headline + 2-column image card grid |
| 8 | Split Image+Text | `.section-split` | 50/50 image and text with clip-path reveal |
| 9 | List | `.section-list` | Background image, left-aligned list with icons |
| 10 | Dual Panel | `.section-dual-panel` | Two side-by-side image panels with overlay text |
| 11 | Team Grid | `.section-team-grid` | Centered grid of circular photo cards |
| 12 | Summary | `.section-summary` | Numbered text blocks with hover accent |
| 13 | Closing | `.section-closing` | Background image, title echo, back-to-top button |

## CSS Theming

All visual theming is controlled by CSS custom properties in `:root`. To rebrand a PitchApp, change ONLY these values:

```css
:root {
    --color-bg:           #0a0a0a;    /* page background */
    --color-bg-card:      #141414;    /* card surfaces */
    --color-bg-raised:    #1a1a1a;    /* hover surfaces */
    --color-text:         #f0ede8;    /* primary text */
    --color-text-muted:   #9a9388;    /* secondary text */
    --color-accent:       #8a8a8a;    /* primary accent color */
    --color-accent-light: #a0a0a0;    /* accent highlight */
    --color-accent-dim:   #6a6a6a;    /* accent subdued */
    --color-negative:     #8b3a3a;    /* negative indicators */
    --font-display: 'Cormorant Garamond', serif;
    --font-body:    'DM Sans', sans-serif;
}
```

For reference, ONIN uses: `--color-accent: #c8a44e` (gold), `--color-bg: #080808` (black), `--color-text: #f5f2ed` (warm white).

## Animation System

- **Library:** GSAP 3.12.5 + ScrollTrigger, loaded from CDN (`cdnjs.cloudflare.com`)
- **Fade-in:** Add class `anim-fade` to any element for scroll-triggered fade-up animation
- **ScrollTrigger start:** `top 88%` for most elements (element enters viewport at 88% from top)
- **Stagger:** Elements within the same section stagger by `idx * 0.12` seconds
- **Parallax:** Background images shift with `scrub: 1.5` between section top and bottom
- **Counters:** Use `data-count`, `data-prefix`, `data-suffix` attributes for animated number counters
- **Hero reveal:** Timeline sequence -- background zoom, eyebrow, title top, title main, tagline, scroll prompt, nav
- **Loader:** Progress bar tracks image loading, fallback timeout at 5 seconds

## Vercel Deployment

- Each app is its own Vercel project
- `rootDirectory` = `apps/{name}`
- Deploy: `cd apps/{name} && vercel link && vercel --prod`
- Or from workspace root: `vercel --cwd apps/{name} --prod`
- `.vercel/` directories are git-ignored (created by `vercel link`)

## File Conventions

- `index.html` -- single page, all sections
- `css/style.css` -- all styles, CSS variables at top
- `js/app.js` -- all JS, GSAP animations
- `images/` -- image naming: `slide{N}_{ContentType}_{Edit}.jpg`

## Important Rules

- No build tools, bundlers, or preprocessors
- No shared code between apps (duplicate from template, extract later when 3+ apps exist)
- Each app must be self-contained and independently deployable
- Source files (.pptx, .psd) go in `sources/{name}/`, not `apps/`
- See `docs/CONVENTIONS.md` for the full playbook
