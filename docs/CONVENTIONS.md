# PitchApp Conventions Playbook

This document captures all conventions, patterns, and best practices for building PitchApps. It is the authoritative reference for maintaining quality and consistency across all PitchApps in the workspace.

---

## 1. Section Type Catalog

Every PitchApp is composed of sections. These are the 11 content types plus 2 structural bookends (Hero, Closing). Each section is independent and can be used in any order.

### 1.1 Hero (`.section-hero`)

Full-bleed background image with vignette overlay, centered title, and scroll prompt. This is always the first section.

```html
<section class="section section-hero" id="hero" data-section-name="">
    <div class="hero-media">
        <img src="images/hero.jpg" alt="" class="hero-media-img">
        <div class="hero-vignette"></div>
    </div>
    <div class="hero-content">
        <div class="hero-eyebrow" aria-hidden="true">
            <span class="hero-line"></span>
            <span class="hero-eyebrow-text">Context Text</span>
            <span class="hero-line"></span>
        </div>
        <h1 class="hero-title">
            <span class="hero-title-top">Subtitle</span>
            <span class="hero-title-main">Brand</span>
        </h1>
        <p class="hero-tagline">Tagline text</p>
        <div class="hero-scroll-prompt">
            <div class="hero-scroll-line"></div>
            <span>Scroll</span>
        </div>
    </div>
</section>
```

**Key patterns:**
- Background image has `transform: scale(1.08)` which zooms to `scale(1)` on hero reveal
- Vignette uses radial-gradient + linear-gradient for edge darkening
- `data-section-name=""` (empty) so the nav label is blank on the hero
- Hero reveal is a GSAP timeline, not scroll-triggered

### 1.2 Text-Centered (`.section-text-centered`)

Centered label + serif headline with italic emphasis words. Ideal for mission statements or positioning.

```html
<section class="section section-text-centered" id="about" data-section-name="About">
    <div class="text-centered-content">
        <p class="section-label anim-fade">Label</p>
        <h2 class="text-centered-headline anim-fade">
            Statement with <em>emphasized words</em> in accent color
        </h2>
    </div>
</section>
```

**Key patterns:**
- `max-width: 900px` constrains the content
- `<em>` tags render in the accent color via CSS
- Font: display serif, weight 300, size clamp(26px, 4.5vw, 46px)

### 1.3 Numbered Grid (`.section-numbered-grid`)

2x2 grid of numbered text blocks with thin borders (1px gap technique).

```html
<section class="section section-numbered-grid" id="overview" data-section-name="Overview">
    <div class="numbered-grid-inner">
        <p class="section-label anim-fade">Label</p>
        <div class="numbered-grid-pillars">
            <div class="pillar anim-fade">
                <div class="pillar-number">01</div>
                <p class="pillar-text">Text with <strong>bold emphasis</strong></p>
            </div>
            <!-- repeat for 02, 03, 04 -->
        </div>
    </div>
</section>
```

**Key patterns:**
- Grid uses `gap: 1px` with accent-tinted background to create border effect
- Each pillar has `background: var(--color-bg)` so the gap shows through as borders
- Hover changes background to `--color-bg-card`
- Responsive: 1 column on mobile, 2 columns at 640px

### 1.4 Background Stats (`.section-bg-stats`)

Background image with wash overlay, headline, animated counter values, and callout pills.

```html
<section class="section section-bg-stats" id="stats" data-section-name="Metrics">
    <div class="bg-layer">
        <img src="images/bg-stats.jpg" alt="" class="bg-layer-img">
        <div class="bg-layer-wash"></div>
    </div>
    <div class="bg-stats-content">
        <p class="section-label anim-fade">Label</p>
        <h2 class="bg-stats-headline anim-fade">Headline</h2>
        <div class="bg-stats-row">
            <div class="stat-block anim-fade">
                <div class="stat-val" data-count="135" data-prefix="$" data-suffix="M+">$0</div>
                <div class="stat-label">Description</div>
            </div>
        </div>
        <div class="callout-row">
            <div class="callout anim-fade">Normal callout</div>
            <div class="callout callout-accent anim-fade">Accent callout</div>
        </div>
    </div>
</section>
```

**Key patterns:**
- Background layer: absolute image + gradient wash overlay
- Counter animation driven by `data-count`, `data-prefix`, `data-suffix` attributes
- Counters animate from 0 to target with `gsap.to()`, duration 2.2s
- Callout pills use rounded borders (border-radius: 100px)

### 1.5 Metric Grid (`.section-metric-grid`)

3-column grid of large metric values with descriptions, plus summary paragraph.

```html
<section class="section section-metric-grid" id="metrics" data-section-name="Metrics">
    <div class="metric-grid-content">
        <p class="section-label anim-fade">Label</p>
        <div class="metric-grid-row">
            <div class="metric-card anim-fade">
                <div class="metric-val">3x</div>
                <div class="metric-desc">Description<br>with line break</div>
            </div>
            <!-- repeat for 2 more -->
        </div>
        <p class="metric-grid-summary anim-fade">Summary text. <em>Accent emphasis.</em></p>
    </div>
</section>
```

**Key patterns:**
- Uses the same 1px gap border technique as numbered grid
- Metric values use display font, clamp(40px, 7vw, 64px)
- Responsive: 1 column on mobile, 3 columns at 640px

### 1.6 Background Statement (`.section-bg-statement`)

Background image with wash, centered eyebrow/title/subtitle/description stack.

```html
<section class="section section-bg-statement" id="product" data-section-name="Product">
    <div class="bg-layer">
        <img src="images/bg.jpg" alt="" class="bg-layer-img">
        <div class="bg-layer-wash"></div>
    </div>
    <div class="bg-statement-content">
        <p class="section-label anim-fade">Eyebrow</p>
        <h2 class="bg-statement-title anim-fade">Big Title</h2>
        <p class="bg-statement-subtitle anim-fade">Subtitle in accent-light</p>
        <p class="bg-statement-desc anim-fade">Description in muted text</p>
    </div>
</section>
```

**Key patterns:**
- Title uses display font italic, clamp(40px, 9vw, 90px)
- This type is reusable -- ONIN uses it for 4 different sections (The Show, ILM, Location, Little Broadway) with slight content variations
- Background image opacity: 0.25-0.35, filter: saturate(0.7-0.8)

### 1.7 Card Gallery (`.section-card-gallery`)

Large headline, description, and 2-column image card grid with overlay labels.

```html
<section class="section section-card-gallery" id="gallery" data-section-name="Gallery">
    <div class="card-gallery-content">
        <h2 class="card-gallery-headline anim-fade">
            <span class="gallery-line">line one.</span>
            <span class="gallery-line">line two.</span>
        </h2>
        <p class="card-gallery-desc anim-fade">Description text</p>
        <div class="card-gallery-grid">
            <div class="gallery-card anim-fade">
                <img src="images/card.jpg" alt="Label">
                <div class="gallery-card-label">Label</div>
            </div>
        </div>
    </div>
</section>
```

**Key patterns:**
- Cards have `aspect-ratio: 4/3` and `object-fit: cover`
- Hover: image scales to 1.06, filter goes from saturate(0.85) to saturate(1)
- Label overlay uses gradient from transparent to dark at bottom
- Animation: cards scale in from 0.92 with stagger

### 1.8 Split Image+Text (`.section-split`)

50/50 layout with image on one side, text on the other. Image reveals with clip-path animation.

```html
<section class="section section-split" id="feature" data-section-name="Feature">
    <div class="split-layout">
        <div class="split-img-wrap anim-fade">
            <img src="images/feature.jpg" alt="Feature">
        </div>
        <div class="split-text">
            <p class="section-label anim-fade">Label</p>
            <h2 class="split-headline anim-fade">Headline<br><em>Emphasis</em></h2>
            <p class="split-desc anim-fade">Description</p>
            <p class="split-subdesc anim-fade">More detail</p>
        </div>
    </div>
</section>
```

**Key patterns:**
- `padding: 0` on the section (full-bleed image)
- Flexbox row on desktop (768px+), column on mobile
- Image uses `position: absolute; inset: 0` to fill its container
- Clip-path animation: `inset(0 100% 0 0)` to `none`
- To swap sides: reorder the child divs in HTML

### 1.9 List (`.section-list`)

Background image with left-aligned list items. Items slide in from the left.

```html
<section class="section section-list" id="list" data-section-name="Points">
    <div class="bg-layer">
        <img src="images/bg-list.jpg" alt="" class="bg-layer-img bg-layer-img-dim">
        <div class="bg-layer-wash bg-layer-wash-left"></div>
    </div>
    <div class="list-content">
        <p class="section-label anim-fade">Label</p>
        <h2 class="list-headline anim-fade">Headline</h2>
        <ul class="list-items">
            <li class="list-item anim-fade">
                <span class="list-icon-x" aria-label="limitation">&#10005;</span> Item text
            </li>
            <li class="list-item list-item-accent anim-fade">
                <span class="list-icon-arrow">&rarr;</span> Positive conclusion
            </li>
        </ul>
    </div>
</section>
```

**Key patterns:**
- Background wash: left-to-right gradient (dark on left for text readability)
- List items have subtle border and hover-translate effect
- `.list-icon-x` for negative items (red-muted circle), `.list-icon-arrow` for positive
- `.list-item-accent` highlights the positive takeaway

### 1.10 Dual Panel (`.section-dual-panel`)

Two side-by-side image panels with overlay text. Great for contrasts.

```html
<section class="section section-dual-panel" id="contrast" data-section-name="Contrast">
    <div class="dual-panel-row">
        <div class="dual-panel dual-panel-left anim-fade">
            <img src="images/left.jpg" alt="Left">
            <div class="dual-panel-wash dual-panel-wash-light"></div>
            <div class="dual-panel-text">
                <h3>Left<br>headline</h3>
            </div>
        </div>
        <div class="dual-panel dual-panel-right anim-fade">
            <img src="images/right.jpg" alt="Right">
            <div class="dual-panel-wash dual-panel-wash-dark"></div>
            <div class="dual-panel-text">
                <h3>Right<br>headline</h3>
            </div>
        </div>
    </div>
</section>
```

**Key patterns:**
- `padding: 0` on section, `min-height: 100vh` on panel row
- Each panel is `flex: 1`, stacks vertically on mobile (50vh each), side-by-side on desktop
- Hover: image scales to 1.05
- Different wash gradients per panel for visual variety

### 1.11 Team Grid (`.section-team-grid`)

Centered grid of circular photo cards with name and role.

```html
<section class="section section-team-grid" id="team" data-section-name="Team">
    <div class="team-grid-content">
        <p class="section-label anim-fade">Label</p>
        <h2 class="team-grid-headline anim-fade">Headline</h2>
        <div class="team-grid">
            <div class="team-card anim-fade">
                <div class="team-photo">
                    <img src="images/person.jpg" alt="Name">
                </div>
                <h4 class="team-name">Full Name</h4>
                <p class="team-role">Title, Organization</p>
            </div>
            <!-- For placeholder without photo: -->
            <div class="team-card anim-fade">
                <div class="team-photo team-photo-placeholder">
                    <span>AB</span>
                </div>
                <h4 class="team-name">Full Name</h4>
                <p class="team-role">Title, Organization</p>
            </div>
        </div>
    </div>
</section>
```

**Key patterns:**
- Photos: 120x120px, circular (border-radius: 50%)
- Placeholder: initials in accent-dim color on card background
- Hover: border color intensifies on the photo circle
- Responsive: 1 column on mobile, 3 columns at 640px

### 1.12 Summary (`.section-summary`)

Numbered text blocks in a vertical list with left-border hover accent.

```html
<section class="section section-summary" id="summary" data-section-name="Summary">
    <div class="summary-content">
        <p class="section-label anim-fade">In Summary</p>
        <div class="summary-blocks">
            <div class="summary-block anim-fade">
                <span class="summary-num">01</span>
                <p>Summary point text</p>
            </div>
            <!-- repeat -->
        </div>
    </div>
</section>
```

**Key patterns:**
- Blocks stacked with 2px gap
- Left border transitions from transparent to accent on hover
- Background transitions from card to raised on hover
- Animation: alternating slide from left/right

### 1.13 Closing (`.section-closing`)

Background image with centered title echo and back-to-top button. Always the last section.

```html
<section class="section section-closing" id="closing" data-section-name="">
    <div class="bg-layer">
        <img src="images/hero.jpg" alt="" class="bg-layer-img bg-layer-img-dim">
        <div class="bg-layer-wash bg-layer-wash-closing"></div>
    </div>
    <div class="closing-content">
        <div class="closing-eyebrow anim-fade">
            <span class="closing-line"></span>
        </div>
        <h2 class="closing-title anim-fade">
            <span class="closing-title-top">Subtitle</span>
            <span class="closing-title-main">Brand</span>
        </h2>
        <p class="closing-tagline anim-fade">Tagline</p>
        <a href="#hero" class="closing-btn anim-fade">Back to Top</a>
    </div>
</section>
```

**Key patterns:**
- `min-height: 80vh` (slightly shorter than other sections)
- Reuses the hero image or a different closing image
- Back-to-top button uses smooth scroll via GSAP
- Closing wash gradient: dark at top, fading down (inverse of hero)

---

## 2. CSS Architecture

### 2.1 Variable System

All theming is in `:root` CSS custom properties. See CLAUDE.md for the full variable list.

**Naming convention:**
- `--color-bg` / `--color-bg-card` / `--color-bg-raised` -- background surfaces (darkest to lightest)
- `--color-text` / `--color-text-muted` -- text hierarchy
- `--color-accent` / `--color-accent-light` / `--color-accent-dim` -- brand accent variations
- `--color-negative` -- error/limitation indicators
- `--font-display` / `--font-body` -- typography
- `--section-pad` / `--container` / `--gutter` -- spacing
- `--ease-out` / `--ease-smooth` -- easing curves

### 2.2 Responsive Strategy

Three breakpoints, mobile-first:

| Breakpoint | Width | What Changes |
|------------|-------|-------------|
| Small | `max-width: 480px` | Stats stack vertically, location neighbors stack |
| Medium | `min-width: 640px` | Grids go to multi-column (2x2, 3-col), gallery goes 2-col |
| Large | `min-width: 768px` | Split layouts go side-by-side, dual panels go horizontal |

### 2.3 Background Image Layer Pattern

Used by every section with a background image:

```css
.bg-layer {
    position: absolute;
    inset: 0;
}

.bg-layer-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.25;          /* adjust per section: 0.15 to 0.35 */
    filter: saturate(0.7);  /* desaturate for cinematic feel */
}

.bg-layer-wash {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(bg,0.7) 0%, rgba(bg,0.9) 60%, var(--color-bg) 100%);
}
```

### 2.4 Typography with clamp()

All major text sizes use CSS `clamp()` for fluid responsive scaling:

```css
/* Hero title main */
font-size: clamp(64px, 16vw, 160px);

/* Section headlines */
font-size: clamp(26px, 4.5vw, 46px);

/* Big statement titles */
font-size: clamp(40px, 9vw, 90px);

/* Metric values */
font-size: clamp(40px, 7vw, 64px);

/* Body text */
font-size: clamp(14px, 2vw, 17px);
```

Pattern: `clamp(mobile-min, fluid-vw, desktop-max)`

---

## 3. Animation Conventions

### 3.1 ScrollTrigger Positions

| Animation | Start | End | Scrub |
|-----------|-------|-----|-------|
| Fade-in (`.anim-fade`) | `top 88%` | N/A (once) | No |
| Gallery card scale-in | `top 85%` | N/A (once) | No |
| List item slide | `top 78%` | N/A (once) | No |
| Dual panel scale | `top 82%` | N/A (once) | No |
| Counter animation | `top 82%` | N/A (once) | No |
| Background parallax | `top bottom` | `bottom top` | `1.5` |
| Content lift | `top bottom` | `top 40%` | `1.5` |
| Split clip-path | `top 75%` | N/A (once) | No |

### 3.2 Stagger Timing

- Within a section: `idx * 0.12` seconds delay per element
- Gallery cards: `i * 0.15` seconds
- List items: `i * 0.12` seconds
- Dual panels: `i * 0.2` seconds
- Summary blocks: `i * 0.1` seconds

### 3.3 Easing

- Fade-in: `power2.out`
- Hero reveal: `power3.out` (default), `power2.out` (image zoom)
- Clip-path: `power3.inOut`
- Smooth scroll: `power3.inOut`
- CSS transitions: `var(--ease-out)` or `var(--ease-smooth)`

### 3.4 Duration

- Fade-in: `0.9s`
- Hero elements: `1.0s` to `1.4s`
- Gallery scale: `1.2s`
- List slide: `0.7s`
- Dual panel: `1.4s`
- Summary slide: `0.8s`
- Clip-path reveal: `1.4s`
- Counter: `2.2s`
- Smooth scroll: `1.2s`

### 3.5 Parallax

- Background images: `y: '15%'`, scrub 1.5
- Content lift: `y: 24`, scrub 1.5 (from section top-bottom to section top-40%)

---

## 4. Image Naming Convention

```
slide{N}_{ContentType}_{Edit}.jpg
```

- `{N}` -- slide number from the source PowerPoint
- `{ContentType}` -- descriptive name (e.g., `Cover`, `Show`, `Hero`, `ABBA_Voyage`)
- `{Edit}` -- edit version (e.g., `edit_1`, `edit_12`)

Example: `slide6_Show_edit_2.jpg`

For new PitchApps without a PowerPoint source, use descriptive names:
```
hero.jpg
bg-stats.jpg
feature-split.jpg
team-member-name.jpg
```

---

## 5. File Structure Per PitchApp

Every PitchApp follows this exact structure:

```
apps/{name}/
├── index.html          # single page, all sections
├── css/
│   └── style.css       # all styles, CSS variables at top
├── js/
│   └── app.js          # all JS, GSAP animations
├── images/
│   ├── hero.jpg
│   ├── ...
│   └── .gitkeep        # if no images yet
└── README.md           # per-app metadata
```

No additional files, no subdirectories beyond these. Keep it flat and simple.

---

## 6. Vercel Deployment Checklist

For a new PitchApp:

1. Ensure the app works locally (`open index.html` or local server)
2. Navigate to the app directory: `cd apps/{name}`
3. Link to Vercel: `vercel link`
   - Create a new project (e.g., `{name}-pitchapp`)
   - Or link to an existing project
4. Preview deploy: `vercel`
5. Verify the preview URL works correctly
6. Production deploy: `vercel --prod`
7. Update the app's `README.md` with the deploy URL

For an existing PitchApp after the restructure:
1. Navigate to the app: `cd apps/{name}`
2. Re-link: `vercel link` (select existing project)
3. The `rootDirectory` is now `apps/{name}`
4. Redeploy: `vercel --prod`

---

## 7. Responsive Breakpoints

| Breakpoint | CSS | Behavior |
|------------|-----|----------|
| Mobile (default) | No media query | Single column, stacked layouts, fluid typography |
| Small tablet | `max-width: 480px` | Stats and neighbors stack vertically |
| Tablet | `min-width: 640px` | Grids go multi-column (2x2, 3-col), gallery side-by-side |
| Desktop | `min-width: 768px` | Split layouts and dual panels go horizontal |

Mobile-first approach: base styles are mobile, media queries add complexity for larger screens.

---

## 8. Performance Notes

### Z-Index Stacking

| Layer | Z-Index | Element |
|-------|---------|---------|
| Loader | 10000 | `.loader` |
| Film grain | 9000 | `.grain-overlay` |
| Navigation | 8000 | `.nav` |
| Section content | 1-2 | `.bg-layer-wash` (1), overlay text (2) |
| Default | 0 | Everything else |

### Min-Height Patterns

- Most sections: `min-height: 100vh`
- Hero: `min-height: 100vh` + `min-height: 100dvh` (dynamic viewport on mobile)
- Closing: `min-height: 80vh`
- Split panels on mobile: `min-height: 45vh` (image), no min (text)
- Dual panels on mobile: `min-height: 50vh` each

### Image Optimization

- All images should be JPEG, optimized for web
- Keep individual images under 400KB
- Total image weight per PitchApp: aim for under 5MB
- Use `object-fit: cover` and `object-position` for consistent framing
- Apply `filter: saturate(0.7-0.9)` in CSS for cinematic consistency
- Background images use `opacity: 0.15-0.35` with wash overlays

### Will-Change

Only use `will-change: transform` on the hero background image (animated on load). Do not add `will-change` to scroll-animated elements -- GSAP handles GPU promotion internally.

---

## 9. Known Gotchas

Hard-won patterns from production PitchApps. Violating these causes real bugs.

### 9.1 GSAP Bugs

| Bug | Symptom | Root Cause | Fix |
|-----|---------|------------|-----|
| ScrollToPlugin silent failure | Smooth scroll links do nothing, no error | Plugin loaded but not registered | `gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)` — register ALL plugins |
| Flash of unstyled content (FOUC) | Elements appear at full opacity, then snap to animated state | `gsap.from()` sets inline styles after paint | Use `gsap.to()` with CSS defaults: `opacity: 0; transform: scale(0.94)` in stylesheet, animate TO visible |
| Double-scroll jank | Scrolling feels jerky, overshoots targets | CSS `scroll-behavior: smooth` fights GSAP `scrollTo` | Never use `scroll-behavior: smooth` alongside GSAP — remove from `html` selector |
| Animation hits wrong element | Background effect animates in two sections | Unscoped selector like `.hero-grid-bg` when class reused | Scope selectors: `.section-hero .hero-grid-bg` not `.hero-grid-bg` |
| Terminal text overflows | Horizontal scrollbar on mobile, text cut off | `white-space: nowrap` on terminal lines | Add `max-height: 320px; overflow-y: auto` to terminal body, `white-space: pre-wrap` at mobile breakpoints |

### 9.2 Mobile Patterns

| Pattern | Why | Implementation |
|---------|-----|----------------|
| Touch detection | `pointer: coarse` is more reliable than user agent | `window.matchMedia('(pointer: coarse)').matches` |
| Fresh dimensions | Cached `offsetWidth/Height` breaks on rotation | Read inside animation callbacks, never at init |
| Tap-to-move | Interactive elements need touch equivalent | `touchstart` with `{ passive: true }`, kill current tweens, animate to touch position |
| Ambient drift | Cursor-follow effects need mobile fallback | Random position loop with `sine.inOut` easing, 1.5-3s per move |
| Terminal wrap | Monospace lines overflow on narrow screens | `pre-wrap` instead of `nowrap` at `max-width: 480px` |

### 9.3 Deployment Gotchas

| Issue | Symptom | Fix |
|-------|---------|-----|
| Wrong link preview | Old/wrong title shows when sharing URL | Update `<title>`, `og:title`, `og:description`, `twitter:card`, `twitter:title`, `twitter:description` |
| Missing OG image | Link shows no preview image | Add `og:image` meta tag with absolute URL to a preview image |
| Vercel caching | Old version shows after deploy | Append `?v=2` or clear CDN cache; verify with `vercel inspect` |

### 9.4 CSS Alignment

- **Page-edge elements** (copyright, nav labels): Use `right: var(--gutter)` with `position: absolute` — matches nav padding
- **Content containers**: Use `max-width: var(--container)` with `margin: 0 auto`
- **Don't mix these**: An element inside a container can't reach the page edge — position it relative to the section instead

---

## 10. Custom Section Types

The 13 standard section types (sections 1.1–1.13 above) don't cover every PitchApp. Custom sections are encouraged when the content demands it.

### 10.1 Product Grid

**Use for:** Product suites, tool showcases, feature overviews

```html
<section class="section section-products" id="products" data-section-name="Tools">
    <div class="products-content">
        <p class="section-label anim-fade">Our Tools</p>
        <div class="product-grid product-grid-main">
            <div class="product-card" data-product="product-name">
                <div class="product-card-header product-gradient-name">
                    <div class="product-card-status">
                        <span class="status-dot status-dot-live"></span>
                        <span class="status-text">Live</span>
                    </div>
                    <div class="product-card-icon">
                        <!-- SVG icon -->
                    </div>
                </div>
                <div class="product-card-body">
                    <h3 class="product-name">Product Name</h3>
                    <p class="product-logline">One-line description.</p>
                    <div class="product-meta">
                        <span class="product-version"><span class="meta-label">v</span>0.1.0</span>
                        <span class="product-updated">Feb 2026</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>
```

**Key patterns:**
- Grid: `display: grid; grid-template-columns: repeat(3, 1fr)` at 900px+, 2-col at 640px, 1-col mobile
- Cards start at `opacity: 0; transform: scale(0.94)` in CSS, animated to visible with `gsap.to()` (NOT `gsap.from()`)
- Status dots: `.status-dot-live` (green pulse), `.status-dot-dev` (amber)
- Gradient headers: per-product CSS custom properties
- Card tilt on mousemove: `rotateY: x * 4, rotateX: -y * 4` with `transformPerspective: 800`
- Clickable cards: wrap in `<a>` with class `product-card-link`

**Reference:** `apps/bonfire/`

### 10.2 Terminal Typing

**Use for:** Team introductions, system status, technical credibility

```html
<div class="terminal" id="terminal">
    <div class="terminal-chrome">
        <div class="terminal-dots">
            <span class="terminal-dot terminal-dot-red"></span>
            <span class="terminal-dot terminal-dot-yellow"></span>
            <span class="terminal-dot terminal-dot-green"></span>
        </div>
        <span class="terminal-title">session title</span>
    </div>
    <div class="terminal-body" id="terminalBody">
        <!-- Lines typed in by JS -->
    </div>
</div>
```

**Key patterns:**
- ScrollTrigger-fired: types when terminal scrolls into view (`start: 'top 80%'`, `once: true`)
- Character-by-character typing: commands at 35ms/char, output at 18ms/char
- Line types: `cmd` (with `$ ` prompt), `output`, `success` (green checkmarks), `highlight` (accent color)
- Auto-scroll: `container.scrollTop = container.scrollHeight` inside each `typeChar()` call
- Blinking cursor on final line
- Terminal body: `max-height: 320px; overflow-y: auto` to prevent page stretch
- Mobile: `white-space: pre-wrap` at 480px breakpoint

**Reference:** `apps/bonfire/js/app.js` — `initTerminal()` and `typeLines()` functions

### 10.3 CSS-Only Flame Loader

**Use for:** Branded loading screens without external dependencies

```html
<div class="loader-flame">
    <div class="flame flame-main"></div>
    <div class="flame flame-inner"></div>
    <div class="flame flame-core"></div>
    <div class="ember ember-1"></div>
    <div class="ember ember-2"></div>
    <div class="ember ember-3"></div>
</div>
```

**Key patterns:**
- Three layered flame shapes: main (largest, semi-transparent), inner (medium, brighter), core (smallest, white-hot)
- Rising ember particles with randomized animation delays
- `@keyframes flicker`: varies height, width, and border-radius for organic movement
- `@keyframes rise`: translates Y upward with fade-out and slight X drift
- Warm color progression: `--color-accent` → `--color-accent-light` → white at core
- Glow effect via `box-shadow` with accent color

**Reference:** `apps/bonfire/css/style.css` — `.loader-flame` section

### 10.4 Abstract Grid Hero

**Use for:** Tech/OS aesthetic, no-image hero sections

```html
<section class="section section-hero" id="hero">
    <div class="hero-grid-bg"></div>
    <div class="hero-glow"></div>
    <div class="hero-content">
        <!-- Title, tagline, scroll prompt -->
    </div>
</section>
```

**Key patterns:**
- Grid background: CSS `background-image` with `linear-gradient` lines creating a subtle grid pattern
- Cursor-following glow: radial gradient that tracks mouse position via GSAP
- Mobile glow: ambient drift loop + tap-to-move via `touchstart`
- No `<img>` tags needed — pure CSS atmosphere

**Reference:** `apps/bonfire/`

### 10.5 Light Section System

**Origin:** Shareability
**Use for:** Breaking visual monotony in long PitchApps, content that benefits from a clean/bright feel (capabilities, process, case studies)

Add `.section-light` class alongside the section class to switch any section to a light background.

```html
<section class="section section-mission section-light" id="mission" data-section-name="Who We Are">
    <!-- Same content structure as the dark version -->
</section>
```

**Key patterns:**
- Define light palette in `:root`: `--color-bg-light`, `--color-bg-card-light`, `--color-text-light`, `--color-text-muted-light`
- `.section-light` sets `background: var(--color-bg-light)`
- Override all child typography: headlines, body, muted text, labels, card backgrounds
- Override card borders: use `rgba(accent, 0.08)` instead of dark-mode opacity values
- Nav must adapt: add `.nav-light` class when scrolled past a light section, switching backdrop, logo, and label colors
- Nav color switching is done in `initNavigation()` — detect light sections on scroll and toggle `.nav-light` on the nav element

**CSS variables for light palette:**
```css
:root {
    --color-bg-light:         #f5f4f0;
    --color-bg-card-light:    #ffffff;
    --color-text-light:       #1a1a2e;
    --color-text-muted-light: #6b6b80;
}
```

**Nav adaptation:**
```css
.nav.nav-light.scrolled {
    background: rgba(245, 244, 240, 0.92);
}
.nav.nav-light .nav-logo { color: #2563eb; }
.nav.nav-light .nav-section-label { color: var(--color-text-muted-light); }
```

**Reference:** `apps/shareability/css/style.css` — full light section overrides for grids, cards, metrics, and clients

### 10.6 Video Hero

**Origin:** Shareability
**Use for:** Brands with sizzle reels, dynamic content, social/entertainment companies

```html
<section class="section section-hero" id="hero">
    <video class="hero-video-bg" autoplay muted loop playsinline aria-hidden="true">
        <source src="images/sizzle-bg.mp4" type="video/mp4">
    </video>
    <div class="hero-video-overlay" aria-hidden="true"></div>
    <div class="hero-dots-bg" aria-hidden="true"></div>
    <div class="hero-content">
        <!-- Title, tagline, scroll prompt -->
    </div>
</section>
```

**Key patterns:**
- Video element: `position: absolute; inset: 0; object-fit: cover; opacity: 0.18; filter: saturate(0.4) brightness(0.7)`
- Overlay: radial-gradient from transparent center to `var(--color-bg)` at edges — creates a "window" effect
- `autoplay muted loop playsinline` — all four attributes required for auto-play on mobile
- Can be combined with dot matrix background and feed fragments for layered depth
- Also works in the closing section to echo the hero
- Keep video files small (10-30s loops, compressed mp4, under 5MB)

**Reference:** `apps/shareability/`

### 10.7 Character Decode Animation

**Origin:** Shareability
**Use for:** Hero titles, section headlines, email addresses — any text that should feel "decoded" or "tuned in"

```html
<span class="hero-title-main">
    <span class="char">S</span><span class="char">H</span><span class="char">A</span>
    <!-- one <span class="char"> per character -->
</span>
```

**Key patterns:**
- Wrap each character in `<span class="char">` in the HTML
- On trigger, rapidly cycle through random glyphs (`!@#$%&*QWXZ01?/><{}[]|`) before resolving to the target character
- Later characters take more cycles to resolve (cascading left-to-right lock-in)
- On lock: flash accent color, then fade to text color (`gsap.fromTo` color transition)
- Reusable: `initScrollDecode(elementId, targetText)` for scroll-triggered versions on any element
- Email decode variant: characters fade in first, then decode left-to-right
- `prefers-reduced-motion`: skip animation, show text immediately

**Reference:** `apps/shareability/js/app.js` — `decodeTitle()` and `initScrollDecode()`

### 10.8 Feed Fragments

**Origin:** Shareability
**Use for:** Social media, content-forward brands — abstract floating content shapes in the hero background

```html
<div class="hero-feed-container" aria-hidden="true">
    <!-- Fragments created dynamically by JS -->
</div>
```

**Key patterns:**
- Container: absolute, fills hero, `overflow: hidden`, masked with radial gradient (fade at edges)
- JS creates 22 (mobile) to 38 (desktop) fragment elements with randomized sizes and positions
- Fragment templates: tweet shapes, video landscape/portrait, square posts, reaction bars, avatars (circles)
- Dead zone: no fragments within 200px of center (keeps title readable)
- Continuous upward drift: `gsap.to()` with `repeat: -1` and `modifiers` for wrapping
- Subtle horizontal wobble: separate tween with `yoyo: true`
- Lens effect (desktop): GSAP ticker reads mouse position, brightens nearby fragments proportionally
- Lens effect (mobile): tap-to-brighten within radius, then fade back
- Scroll exit: entire container fades out and shifts up as user scrolls past hero
- `prefers-reduced-motion`: `display: none` on all fragments
- Performance: ticker paused via ScrollTrigger when hero is out of viewport

**Reference:** `apps/shareability/js/app.js` — `createFragments()`, `startDrift()`, `initLensEffect()`

### 10.9 Equation/Formula Cards

**Origin:** Shareability
**Use for:** "Our approach" sections, showing how inputs combine to create outcomes

```html
<div class="equation">
    <div class="equation-card equation-card-data equation-card-flippable anim-fade">
        <div class="equation-card-inner">
            <div class="equation-card-front">
                <div class="equation-card-header"><!-- SVG icon --></div>
                <h3>Card Title</h3>
                <p>Card description</p>
            </div>
            <div class="equation-card-back equation-card-back-science">
                <span>Label</span>
            </div>
        </div>
    </div>
    <div class="equation-op anim-fade">+</div>
    <!-- More cards and operators -->
</div>
```

**Key patterns:**
- Flexbox row with cards separated by operator symbols (`+`, `=`)
- Cards use CSS `perspective: 1000px` and `transform-style: preserve-3d` for 3D flip on hover
- Front and back faces use `backface-visibility: hidden`
- Each card type gets a distinct gradient header and accent color
- Back face: solid gradient with large label text (e.g., "Science", "Art")
- Cards also have subtle tilt on mousemove (same `transformPerspective: 800` pattern)
- Mobile: cards stack vertically, operators rotate to fit vertical flow

**Reference:** `apps/shareability/css/style.css` — `.equation-card-flippable` section

### 10.10 Signal Path Flowchart

**Origin:** Shareability
**Use for:** Process visualization, multi-step workflows, pipeline demonstrations

```html
<div class="signal-path" id="signalPath">
    <svg class="signal-svg" id="signalSvg" aria-hidden="true"></svg>
    <div class="signal-stages">
        <div class="signal-stage" data-stage="1">
            <div class="signal-node"><span>01</span></div>
            <h3 class="signal-title">Stage Title</h3>
            <p class="signal-desc">Description</p>
            <div class="signal-tags">
                <span class="signal-tag">Tag</span>
            </div>
        </div>
        <!-- More stages -->
    </div>
</div>
```

**Key patterns:**
- 4-column grid of stages with numbered circle nodes
- SVG connecting path drawn dynamically based on node positions (uses double `requestAnimationFrame` to ensure layout is settled)
- Path uses cubic bezier curves between node centers
- SVG gradient: color progression from blue to green across stages
- Ghost path (faint preview) + animated path that draws itself (`strokeDashoffset` animation)
- Nodes bloom sequentially with `back.out(1.7)` easing, followed by title, description, and tags
- Stage 4 node gets a green glow pulse on completion
- Mobile: vertical timeline layout with a left-side line, SVG hidden
- Progressive enhancement: content visible by default in CSS, JS hides it for animation reveal

**Reference:** `apps/shareability/js/app.js` — `initFlowchart()`

### 10.11 Case Study Cards with 3D Flip

**Origin:** Shareability
**Use for:** Portfolio pieces, campaign results, project showcases

```html
<div class="case-card-container anim-fade" tabindex="0" role="button" aria-label="View campaign image">
    <div class="case-card">
        <div class="case-card-front">
            <div class="case-number">01</div>
            <h3 class="case-title">Project Title</h3>
            <p class="case-desc">Description</p>
            <div class="case-stats">
                <div class="case-stat">
                    <span class="case-stat-val">103M+</span>
                    <span class="case-stat-label">Views</span>
                </div>
            </div>
        </div>
        <div class="case-card-back">
            <img src="images/project.jpg" alt="Project" loading="lazy">
            <div class="case-card-back-overlay">
                <h4>Project Title</h4>
                <span>Key Metric</span>
            </div>
        </div>
    </div>
</div>
```

**Key patterns:**
- CSS 3D flip with `perspective: 1000px` and `transform-style: preserve-3d`
- Front: numbered card with title, description, and stat row
- Back: full-bleed image with gradient overlay at bottom for text
- Hover (desktop): flips to reveal image
- Tap (mobile): JS toggles `.flipped` class on click
- Focus: `:focus-within` also triggers flip (keyboard accessible)
- `tabindex="0"` and `role="button"` for accessibility
- 4-column grid on desktop, 2-column on tablet, 1-column on mobile

**Reference:** `apps/shareability/css/style.css` and `js/app.js` — `initCardFlip()`

### 10.12 Client Logo Wall with Magnetic Repulsion

**Origin:** Shareability
**Use for:** "Trusted by" sections, client lists — text-based alternative to logo images

```html
<div class="client-wall" id="clientWall">
    <span class="client-name anim-fade">Client Name</span>
    <!-- More client names -->
</div>
```

**Key patterns:**
- Flexbox wrap layout with large display font names
- Desktop: magnetic repulsion from cursor — names push away within a radius (150px) with configurable strength (35px max displacement)
- Uses GSAP ticker for 60fps cursor tracking with lerped displacement
- On `mouseleave`: spring back to origin with `elastic.out(1, 0.5)` easing
- Mobile: gentle scroll-linked wobble using `ScrollTrigger.onUpdate` with sine-wave offsets
- Performance: ticker paused via ScrollTrigger when wall is out of viewport
- Names start muted (`opacity: 0.55`), brighten on hover

**Reference:** `apps/shareability/js/app.js` — `initClientWall()`

### 10.13 Contact Overlay Modal

**Origin:** Shareability
**Use for:** CTA interactions, contact forms, gated content reveals

```html
<div class="contact-overlay" id="contactOverlay" aria-hidden="true">
    <div class="contact-backdrop" id="contactBackdrop"></div>
    <div class="contact-modal" role="dialog" aria-label="Contact us">
        <button class="contact-close" id="contactClose" aria-label="Close">&times;</button>
        <h3>Modal Title</h3>
        <!-- Form or content -->
    </div>
</div>
```

**Key patterns:**
- Fixed overlay with backdrop blur (`backdrop-filter: blur(16px)`)
- Modal slides up and scales in on open
- Close on: close button, backdrop click, Escape key
- `aria-hidden` toggled for screen readers
- `document.body.style.overflow = 'hidden'` when open to prevent background scroll

**Reference:** `apps/shareability/css/style.css` and `js/app.js` — `initContactOverlay()`

---

## 11. Hero Archetypes

Three proven hero types exist across completed builds. The hero is the biggest creative decision per PitchApp.

### 11.1 Cinematic Photo Hero

**Best for:** Investor decks, entertainment, real estate — brands with strong visual assets

```html
<section class="section section-hero">
    <div class="hero-media">
        <img src="images/hero.jpg" alt="" class="hero-media-img">
        <div class="hero-vignette"></div>
    </div>
    <div class="hero-content"><!-- title --></div>
</section>
```

- Background image with `opacity: 0.25-0.35`, `filter: saturate(0.7-0.8)`
- Vignette: radial-gradient darkening edges
- Image zooms from `scale(1.08)` to `scale(1)` on reveal
- Parallax: subtle Y shift on scroll

**Reference:** `templates/pitchapp-starter/`, ONIN-era builds

### 11.2 Abstract Grid Hero

**Best for:** Tech companies, venture studios, developer tools — no images needed

```html
<section class="section section-hero">
    <div class="hero-grid-bg"></div>
    <div class="hero-glow"></div>
    <div class="hero-content"><!-- title --></div>
</section>
```

- CSS grid background: `linear-gradient` lines at ~60px intervals
- Masked with radial gradient so grid fades at edges
- Cursor-following glow: radial gradient tracks mouse position
- Mobile: ambient drift loop + tap-to-move

**Reference:** `apps/bonfire/`

### 11.3 Video + Content Hero

**Best for:** Social media, entertainment, content-forward brands with sizzle reels

```html
<section class="section section-hero">
    <video class="hero-video-bg" autoplay muted loop playsinline aria-hidden="true">
        <source src="images/sizzle.mp4" type="video/mp4">
    </video>
    <div class="hero-video-overlay"></div>
    <div class="hero-dots-bg"></div>
    <div class="hero-feed-container"></div>
    <div class="hero-glow"></div>
    <div class="hero-content"><!-- title --></div>
</section>
```

- Layered: video, then overlay, then dot matrix, then feed fragments, then glow, then content
- Video dimmed to 18% opacity with desaturation
- Feed fragments add floating social media shapes
- Dot matrix adds subtle texture
- Character decode on title text

**Reference:** `apps/shareability/`

---

## 12. Typography Presets

The default pairing (Cormorant Garamond + DM Sans) is not the only option. Choose based on brand personality.

### 12.1 Classical (Default)

```css
--font-display: 'Cormorant Garamond', serif;
--font-body:    'DM Sans', sans-serif;
--font-mono:    'JetBrains Mono', monospace;
```

**Character:** Elegant, traditional, premium. Best for investor decks, luxury brands, entertainment.
**Reference:** `apps/bonfire/`, `apps/onin/`

### 12.2 Modern

```css
--font-display: 'Space Grotesk', sans-serif;
--font-body:    'Inter', sans-serif;
--font-mono:    'JetBrains Mono', monospace;
```

**Character:** Clean, technical, forward-looking. Best for tech companies, agencies, social/digital brands.
**Reference:** `apps/shareability/`

### 12.3 Guidelines

- Display font is for headlines, hero titles, big statements, metric values
- Body font is for paragraphs, descriptions, navigation labels
- Mono font is for section labels, version numbers, technical accents, terminal text
- All sizes use `clamp()` — never fixed pixel values for major text
- When using a sans-serif display font, increase `font-weight` (500-700 vs 300-400 for serif)

---

## 13. Accessibility Patterns

### 13.1 prefers-reduced-motion

All PitchApps must respect the user's motion preference.

**CSS approach:**
```css
@media (prefers-reduced-motion: reduce) {
    .anim-fade { opacity: 1 !important; transform: none !important; }
    .hero-scroll-line { animation: none; }
    /* Disable any looping animations */
}
```

**JS approach:**
```js
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) {
    // Skip timeline, gsap.set() everything to final state
    gsap.set('.hero-title-main', { opacity: 1, y: 0, scale: 1 });
    // Still init navigation and counters (functional, not decorative)
    return;
}
```

**Rules:**
- Check at the start of `revealHero()` — if reduced motion, `gsap.set()` all elements to visible and return early
- Disable looping CSS animations (`animation: none`)
- Disable feed fragments, particle effects, continuous drift
- Keep functional interactions (scroll, navigation, counter values)
- Never use `!important` in JS — use `gsap.set()` instead

**Reference:** `apps/shareability/js/app.js` — `revealHero()` reduced motion block, `apps/shareability/css/style.css` — `@media (prefers-reduced-motion: reduce)`

### 13.2 Progressive Enhancement

Content should be visible even if JavaScript fails to load.

```css
/* Default: content hidden for animation */
.anim-fade {
    opacity: 0;
    transform: translateY(32px);
}

/* If JS fails, show everything */
body:not(.js-loaded) .anim-fade {
    opacity: 1;
    transform: none;
}
```

```js
// First line in DOMContentLoaded
document.body.classList.add('js-loaded');
```

**Rules:**
- Add `js-loaded` class to body at init
- Use `body:not(.js-loaded)` to show all content when JS fails
- Signal path nodes/text should be visible by default in CSS, hidden by JS for animation
- Never rely solely on JS for content visibility

### 13.3 Structural Accessibility

- `<a href="#main" class="skip-link">Skip to content</a>` — always first element in `<body>`
- `<main id="main">` wraps all section content
- `<nav aria-label="Main navigation">` on the fixed nav
- `aria-hidden="true"` on decorative elements (grain overlay, video backgrounds, glows, grids)
- `:focus-visible` outline on interactive elements (2px solid accent, 3px offset)
- `tabindex="0"` and `role="button"` on clickable non-button elements (e.g., flip cards)
