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
