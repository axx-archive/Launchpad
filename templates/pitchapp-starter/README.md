# PitchApp Starter Template

This is the starter template for creating new PitchApps. It includes all 13 section types, the full GSAP animation system, and a CSS variable theming system.

## Quick Start

1. Copy this entire directory to `apps/{your-app-name}/`
2. Open `css/style.css` and update the `:root` CSS variables with your brand colors
3. Update the loader wordmark and nav logo text in `index.html`
4. Replace placeholder content in each section
5. Add your images to the `images/` directory
6. Delete any section types you do not need
7. Open `index.html` in a browser to preview

## How to Customize

### Brand Colors (css/style.css)

Change only the `:root` variables at the top of the CSS file:

```css
:root {
    --color-accent:       #your-brand-color;
    --color-accent-light: #lighter-variant;
    --color-accent-dim:   #darker-variant;
    --color-bg:           #0a0a0a;
    --color-text:         #f0ede8;
    /* ... */
}
```

### Fonts

Update the Google Fonts `<link>` tag in `index.html` and the `--font-display` / `--font-body` variables in CSS.

### Sections

Each section has an HTML comment explaining its purpose and how to customize it. Pick the sections you need and delete the rest. Sections are independent and can be reordered freely.

## Section Types

| Section | Class | Purpose |
|---------|-------|---------|
| Hero | `.section-hero` | Full-bleed opening with title reveal |
| Text-Centered | `.section-text-centered` | Mission statement or positioning |
| Numbered Grid | `.section-numbered-grid` | Key pillars or principles |
| Background Stats | `.section-bg-stats` | Metrics with animated counters |
| Metric Grid | `.section-metric-grid` | 3-column large metric cards |
| Background Statement | `.section-bg-statement` | Big proclamation over background |
| Card Gallery | `.section-card-gallery` | 2-column image card grid |
| Split Image+Text | `.section-split` | 50/50 image and text |
| List | `.section-list` | Background image with list items |
| Dual Panel | `.section-dual-panel` | Two side-by-side image panels |
| Team Grid | `.section-team-grid` | Team member photo cards |
| Summary | `.section-summary` | Numbered recap blocks |
| Closing | `.section-closing` | Title echo and back-to-top |

## Animation System

- Add the `anim-fade` class to any element for automatic scroll-triggered fade-in
- Use `data-count`, `data-prefix`, `data-suffix` attributes on elements for animated counters
- Background images get automatic parallax scrolling
- Gallery cards scale in, list items slide from left, summary blocks alternate sides

## Local Development

```bash
open index.html
# or serve with a local server:
python3 -m http.server 8080
```

## Deploy

```bash
cd apps/{your-app-name}
vercel link
vercel --prod
```
