# Technical Architecture: PitchApp Workspace

## Overview

This document defines the architecture for restructuring the ONIN project from a single-app directory into a multi-app monorepo workspace called **PitchApp**. The workspace hosts N independent PitchApps (scroll-driven, GSAP-animated investor pitch decks deployed as static sites to Vercel). ONIN is the first app; Shareability will be the second. The design prioritizes fast scaffolding, zero build tooling, and per-app independence.

---

## 1. Final Folder Structure

```
PitchApp/                              # renamed from ONIN
├── CLAUDE.md                          # workspace conventions for Claude Code
├── README.md                          # workspace overview
├── .gitignore                         # workspace-level git ignores
├── .claude/
│   └── settings.local.json            # Claude Code permissions (existing)
├── apps/
│   ├── onin/                          # ONIN PitchApp (migrated from pitch-app/)
│   │   ├── index.html
│   │   ├── css/
│   │   │   └── style.css
│   │   ├── js/
│   │   │   └── app.js
│   │   ├── images/
│   │   │   ├── slide2_Cover_edit_1.jpg
│   │   │   └── ... (21 JPGs)
│   │   └── README.md                  # per-app README
│   └── shareability/                  # scaffolded from template
│       ├── index.html
│       ├── css/
│       │   └── style.css
│       ├── js/
│       │   └── app.js
│       ├── images/
│       │   └── .gitkeep
│       └── README.md
├── templates/
│   └── pitchapp-starter/              # starter template
│       ├── index.html
│       ├── css/
│       │   └── style.css
│       ├── js/
│       │   └── app.js
│       ├── images/
│       │   └── .gitkeep
│       └── README.md                  # template usage instructions
├── docs/
│   └── CONVENTIONS.md                 # PitchApp playbook
├── sources/
│   ├── onin/
│   │   └── ONIN.pptx                 # 385MB source file (git-ignored)
│   └── shareability/
│       └── .gitkeep
└── tasks/
    ├── prd-pitchapp-workspace.md      # this PRD (existing)
    └── architecture-pitchapp-workspace.md  # this document
```

### Key Decisions

**Why `apps/` and not flat directories:** A single parent directory makes glob patterns, scripts, and mental models consistent. `apps/*` always means "a deployable PitchApp."

**Why `sources/` is separate from `apps/`:** Source files (.pptx, .psd, .ai) are large, git-ignored assets that do not deploy. Keeping them outside `apps/` prevents accidental Vercel deploys of 385MB files and makes the gitignore rules cleaner.

**Why `tasks/` stays at root:** The `tasks/` directory contains planning artifacts that are workspace-level concerns, not app-specific.

**No `packages/` or `shared/` directory:** Per the PRD non-goals, there is no shared code extraction. This directory would be premature.

---

## 2. Migration Plan

The migration must preserve the ONIN deployment. Order matters.

### Step 1: Initialize git at the current root (before any moves)

```
cd /Users/ajhart/Desktop/ONIN
git init
```

Create `.gitignore` at root BEFORE the initial commit (details in Section 4).

### Step 2: Initial commit -- capture current state

```
git add -A
git commit -m "Initial commit: ONIN PitchApp before workspace restructure"
```

This gives a clean rollback point.

### Step 3: Create the directory scaffold

```
mkdir -p apps/onin
mkdir -p apps/shareability
mkdir -p templates/pitchapp-starter/images
mkdir -p templates/pitchapp-starter/css
mkdir -p templates/pitchapp-starter/js
mkdir -p docs
mkdir -p sources/onin
mkdir -p sources/shareability
```

### Step 4: Move ONIN app files

```
# Move app files (not .vercel, not .gitignore, not .DS_Store)
mv pitch-app/index.html apps/onin/
mv pitch-app/css apps/onin/
mv pitch-app/js apps/onin/
mv pitch-app/images apps/onin/
```

### Step 5: Move source files

```
mv ONIN.pptx sources/onin/
```

### Step 6: Clean up old directories

```
rm -rf pitch-app/
```

The old `.vercel/` directory inside `pitch-app/` gets removed with it. This is intentional -- the Vercel project will be re-linked to the new path (see Section 3).

### Step 7: Create all new files

Create in this order:
1. Root `.gitignore` (already created in Step 1)
2. Root `CLAUDE.md`
3. Root `README.md`
4. `docs/CONVENTIONS.md`
5. `templates/pitchapp-starter/` files (index.html, style.css, app.js, README.md)
6. `apps/onin/README.md`
7. `apps/shareability/` files (copied from template, customized)

### Step 8: Commit the restructure

```
git add -A
git commit -m "Restructure into multi-app PitchApp workspace"
```

### Step 9: Re-link Vercel for ONIN

See Section 3 for details.

### Step 10: Rename the root folder

See Section 8 for details. This happens last because it is a filesystem operation outside of git.

### Verification Checklist

After migration, verify:
- [ ] `apps/onin/index.html` opens in a browser and all images load
- [ ] All 21 images are present in `apps/onin/images/`
- [ ] CSS and JS paths in `index.html` still resolve (they are relative: `css/style.css`, `js/app.js`)
- [ ] No files remain in the old `pitch-app/` directory
- [ ] `ONIN.pptx` is in `sources/onin/` and git-ignored
- [ ] `git status` shows a clean working tree after commit

---

## 3. Vercel Strategy

### Current State

ONIN is deployed as Vercel project `pitch-app` (project ID: `prj_Njeg9xgCotUYTr3lkDfQmzNg3kp4`, org: `team_aTzjsSTYgGK7CNM2avw0kjhx`). The Vercel project was linked when the root was `pitch-app/` itself.

### Per-App Deployment Model

Each PitchApp is its own Vercel project with `rootDirectory` pointing to its `apps/{name}/` path.

**ONIN re-linking procedure:**

Option A -- Re-link via CLI (recommended):
```
cd apps/onin
vercel link
# Select the existing "pitch-app" project when prompted
# OR create a new project named "onin-pitchapp"
```

This creates a new `.vercel/project.json` inside `apps/onin/`. That file is git-ignored.

Option B -- Vercel Dashboard:
1. Go to vercel.com > project "pitch-app" > Settings > General
2. Set "Root Directory" to `apps/onin`
3. Redeploy

**Recommendation: Option A.** It is more explicit, keeps the project link local, and works the same way for every future PitchApp.

**Shareability setup (when ready for deployment):**
```
cd apps/shareability
vercel link
# Create new project "shareability-pitchapp"
```

### Vercel Configuration per App

Each app directory gets its own `.vercel/project.json` (created by `vercel link`). This file is git-ignored. No `vercel.json` is needed because PitchApps are zero-config static sites -- Vercel auto-detects `index.html` and serves it.

If a `vercel.json` is ever needed (e.g., for redirects or headers), it goes inside the app directory:

```
apps/onin/vercel.json       # optional, per-app
apps/shareability/vercel.json  # optional, per-app
```

### Deploy Commands

From any app directory:
```
cd apps/onin
vercel           # preview deploy
vercel --prod    # production deploy
```

Or from workspace root with the `--cwd` flag:
```
vercel --cwd apps/onin --prod
```

---

## 4. Git Strategy

### .gitignore (workspace root)

```gitignore
# === OS ===
.DS_Store
Thumbs.db

# === Source files (too large for git) ===
*.pptx
*.psd
*.ai
*.sketch

# === Vercel ===
.vercel/

# === Dependencies (future-proofing) ===
node_modules/

# === Editor ===
.idea/
.vscode/
*.swp
*.swo
```

**Important notes:**

1. The `*.pptx` rule catches `sources/onin/ONIN.pptx` (385MB). This file MUST NOT be tracked. Git LFS is not needed because source files do not require version history -- they are reference materials, not code.

2. The `.vercel/` rule catches `apps/onin/.vercel/`, `apps/shareability/.vercel/`, and the old `pitch-app/.vercel/`. Using a directory pattern (with trailing slash) ensures it matches at any depth.

3. No app-level `.gitignore` files. The workspace root `.gitignore` covers everything. The old `pitch-app/.gitignore` is deleted during migration.

### Commit Strategy

| Commit | Contents | Purpose |
|--------|----------|---------|
| 1 | Current state as-is (with root .gitignore already in place) | Clean baseline for rollback |
| 2 | Restructured workspace (all moves, new files, template, docs) | The restructure itself |

Two commits is sufficient. More granular commits (one per file move) add noise without value for a restructure.

### Git LFS

**Not needed.** The only large file is `ONIN.pptx` (385MB), which is git-ignored. Images are all under 400KB each (total ~4MB for 21 files). If future PitchApps include video files or high-res images over 100MB, revisit this decision.

### Repository Hosting

No remote repository exists. The PRD does not require one. Git is initialized locally for version history. When ready to push to GitHub/GitLab, the user can add a remote.

---

## 5. Template Design

The template at `/templates/pitchapp-starter/` captures the proven patterns from ONIN but strips all brand-specific content.

### What Gets Genericized

| ONIN Element | Template Equivalent |
|-------------|---------------------|
| Brand name "ONIN" | `{{BRAND}}` placeholder in loader/nav |
| Gold/black color palette | Neutral placeholder palette in CSS variables |
| "One Night in Nashville" title | `{{Title}}` / `{{Subtitle}}` placeholder text |
| ONIN-specific section names (`who-section`, `abba-section`) | Generic names (`section-text-centered`, `section-bg-stats`) |
| Specific content text | Lorem-style placeholder descriptions |
| ONIN images | No images (empty `images/` with `.gitkeep`) |
| 17 sections | All 11 section types included as a catalog (some ONIN sections share a type) |

### What Stays As-Is

These are structural patterns, not brand-specific:

- GSAP 3.12.5 + ScrollTrigger CDN links (pinned version)
- Google Fonts preconnect pattern (with placeholder font choices)
- Film grain overlay
- Loader with progress bar
- Navigation with scroll progress + section label
- `anim-fade` class and animation system
- ScrollTrigger configuration (start positions, scrub values)
- Background-image layer pattern (img + wash div)
- CSS custom property system structure
- Responsive breakpoints (480px, 640px, 768px)
- Section base class and min-height: 100vh pattern
- Scrollbar and selection styling

### Template Section Type Catalog

The template includes one example of each of the 11 section types identified from ONIN. These serve as a menu -- a new PitchApp picks the sections it needs and deletes the rest.

| # | Section Type | ONIN Source | Template Class | Description |
|---|-------------|-------------|----------------|-------------|
| 1 | Hero | Section 1 (Hero) | `.section-hero` | Full-bleed background image, vignette, centered title, scroll prompt |
| 2 | Text-Centered | Section 2 (Who We Are) | `.section-text-centered` | Dark background, centered label + headline with italic emphasis |
| 3 | Numbered Grid | Section 3 (Overview) | `.section-numbered-grid` | 2x2 grid of numbered text blocks with borders |
| 4 | Background Stats | Section 4 (ABBA Voyage) | `.section-bg-stats` | Background image + wash, headline, animated counters, callout pills |
| 5 | Metric Grid | Section 5 (Why Country) | `.section-metric-grid` | Dark background, 3-column metric cards, summary text |
| 6 | Background Statement | Section 6 (The Show) | `.section-bg-statement` | Background image + wash, centered eyebrow/title/subtitle stack |
| 7 | Card Gallery | Section 7 (Biggest Stars) | `.section-card-gallery` | Large headline, description, 2-column image card grid with labels |
| 8 | Split Image+Text | Sections 9, 14 (Venue, Ernest) | `.section-split` | 50/50 image and text side-by-side, clip-path reveal animation |
| 9 | List | Section 10 (Limitations) | `.section-list` | Background image, left-aligned list items with icons, slide-in animation |
| 10 | Dual Panel | Section 13 (Day & Night) | `.section-dual-panel` | Two side-by-side image panels with overlay text |
| 11 | Team Grid | Section 15 (The Team) | `.section-team-grid` | Centered grid of photo cards with name/role |
| 12 | Summary | Section 16 (Summary) | `.section-summary` | Numbered text blocks with left-border hover accent |
| 13 | Closing | Section 17 (Closing) | `.section-closing` | Background image, centered title echo, back-to-top button |

Note: 13 sections in the template (not 11) because Hero and Closing are structural bookends that every PitchApp needs, plus the 11 content section types.

### Template CSS Variable System

The template CSS uses this variable block at the top. A new PitchApp customizes ONLY these values to rebrand:

```css
:root {
    /* === BRAND COLORS === */
    --color-bg:        #0a0a0a;       /* page background */
    --color-bg-card:   #141414;       /* card/elevated surfaces */
    --color-bg-raised: #1a1a1a;       /* hover/active surfaces */
    --color-text:      #f0ede8;       /* primary text */
    --color-text-muted:#9a9388;       /* secondary text */
    --color-accent:    #8a8a8a;       /* primary accent (ONIN: gold #c8a44e) */
    --color-accent-light: #a0a0a0;   /* accent highlight */
    --color-accent-dim:#6a6a6a;       /* accent subdued */
    --color-negative:  #8b3a3a;       /* negative/limitation indicators */

    /* === TYPOGRAPHY === */
    --font-display: 'Cormorant Garamond', serif;
    --font-body:    'DM Sans', sans-serif;

    /* === SPACING === */
    --section-pad: clamp(100px, 14vh, 160px);
    --container:   1080px;
    --gutter:      clamp(24px, 5vw, 64px);

    /* === EASING === */
    --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
    --ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

The naming changes from ONIN's `--gold`, `--black` etc. to semantic names (`--color-accent`, `--color-bg`) so each app can define its own palette without the names being misleading.

### Template JS Structure

The template `app.js` includes these functions, wired to generic selectors:

1. `initLoader()` -- image progress bar, fallback timeout
2. `revealHero()` -- hero entrance timeline
3. `initScrollAnimations()` -- `.anim-fade` elements, parallax on bg images, card scale-ins, list slide-ins, panel reveals, summary alternating slides, clip-path reveals
4. `initNavigation()` -- scroll progress bar, section label updates, nav background on scroll
5. `initCounters()` -- `[data-count]` attribute-driven counter animations
6. `initParallax()` -- subtle content lift on sections
7. Smooth scroll for `a[href^="#"]` links

Selectors in the template JS use the generic class names (`.section-hero`, `.section-bg-stats`, etc.) instead of ONIN-specific names.

---

## 6. CLAUDE.md Structure

The `CLAUDE.md` at workspace root needs these sections:

```markdown
# PitchApp Workspace

## What This Is
[1-2 sentences: multi-app workspace for scroll-driven GSAP investor pitch decks]

## Folder Structure
[Tree diagram matching Section 1 of this document]

## What Is a PitchApp
[Definition: static HTML/CSS/JS, GSAP + ScrollTrigger, deployed to Vercel]
[No build step, no bundler, no framework -- vanilla only]

## How to Create a New PitchApp
1. Copy templates/pitchapp-starter/ to apps/{new-name}/
2. Update CSS variables in :root for brand colors
3. Update loader wordmark and nav logo text
4. Replace placeholder section content
5. Add images to apps/{new-name}/images/
6. Delete any section types not needed
7. Run locally: open index.html in browser (or python3 -m http.server)
8. Deploy: cd apps/{new-name} && vercel link && vercel --prod

## Section Types Available
[Table of 11 types with one-line descriptions]

## CSS Theming
[List the CSS variables and what each controls]
[Note: change ONLY the :root variables to rebrand]

## Animation System
[GSAP 3.12.5 + ScrollTrigger from CDN]
[anim-fade class: add to any element for scroll-triggered fade-in]
[ScrollTrigger start: 'top 88%' for most elements]
[Parallax: scrub 1.5 on background images]
[Counters: data-count, data-prefix, data-suffix attributes]

## Vercel Deployment
[Each app is its own Vercel project]
[rootDirectory = apps/{name}]
[vercel link inside app dir, then vercel --prod]

## File Conventions
[index.html -- single page, all sections]
[css/style.css -- all styles, CSS variables at top]
[js/app.js -- all JS, GSAP animations]
[images/ -- slide{N}_{ContentType}_{Edit}.jpg naming]

## Important Rules
- No build tools, bundlers, or preprocessors
- No shared code between apps (duplicate, extract later)
- Each app must be self-contained and independently deployable
- Source files (.pptx, .psd) go in sources/{name}/, not apps/
- See docs/CONVENTIONS.md for the full playbook
```

### .claude/settings.local.json Update

The existing permissions reference `pitch-app/` in paths. After migration, update to:

```json
{
  "permissions": {
    "allow": [
      "Bash(python3:*)",
      "Bash(pip3 install:*)",
      "Bash(open http://localhost:*)",
      "Bash(vercel:*)",
      "Bash(tree:*)",
      "Bash(git:*)"
    ]
  }
}
```

The old path-specific permissions (`if [ -f "/Users/ajhart/Desktop/ONIN/pitch-app/$f" ]`, `while read f`, etc.) are artifacts of a previous session and should be cleaned up.

---

## 7. Per-App README Structure

Each app at `apps/{name}/README.md` follows this template:

```markdown
# {App Name} PitchApp

## Status
[Draft / Live / Archived]

## Deploy URL
[Vercel URL or "Not yet deployed"]

## Brand Identity
| Element | Value |
|---------|-------|
| Primary Accent | {hex color} |
| Background | {hex color} |
| Display Font | {font name} |
| Body Font | {font name} |

## Content Source
[What .pptx or source material this was built from]
[Location: sources/{name}/]

## Sections
[Numbered list of sections in this PitchApp with their types]

## Local Development
```
open index.html
# or
python3 -m http.server 8080
```

## Deploy
```
vercel --prod
```
```

### ONIN README Specifics

```markdown
# ONIN PitchApp -- One Night in Nashville

## Status
Live

## Deploy URL
https://pitch-app-eight.vercel.app (or current URL)

## Brand Identity
| Element | Value |
|---------|-------|
| Primary Accent | #c8a44e (gold) |
| Accent Light | #dfc06a |
| Accent Dim | #8b7235 |
| Background | #080808 |
| Text | #f5f2ed |
| Display Font | Cormorant Garamond |
| Body Font | DM Sans |

## Content Source
Source: sources/onin/ONIN.pptx (385MB, git-ignored)

## Sections
1. Hero -- full-bleed background, title reveal
2. Who We Are -- centered text with italic emphasis
3. Overview -- 2x2 numbered pillar grid
4. Why We're Here -- ABBA Voyage stats with counters
5. Why Country -- 3-column metric grid
6. The Show -- background statement
7. Biggest Stars -- card gallery
8. Technology (ILM) -- background statement
9. The Venue -- split image + text
10. ABBA Limitations -- list with icons
11. The Location -- background with big stat
12. Little Broadway -- background statement
13. Day & Night -- dual panel
14. Creative Director -- split image + text
15. The Team -- team grid
16. Summary -- numbered blocks
17. Closing -- title echo + back to top
```

---

## 8. Folder Rename Approach

### The Rename: ONIN -> PitchApp

The root folder rename from `/Users/ajhart/Desktop/ONIN` to `/Users/ajhart/Desktop/PitchApp` is a filesystem operation that happens AFTER the git restructure is committed.

### Procedure

```bash
# 1. Close any editors or terminals with cwd inside ONIN
# 2. From the parent directory:
cd /Users/ajhart/Desktop
mv ONIN PitchApp
```

### What It Affects

| Concern | Impact | Action Needed |
|---------|--------|---------------|
| Git history | None. Git tracks relative paths. The repo moves with the folder. | None |
| Vercel links | `.vercel/` is git-ignored and will be re-created by `vercel link` after the move | Re-run `vercel link` inside the new path |
| `.claude/settings.local.json` | The old hardcoded path `/Users/ajhart/Desktop/ONIN/pitch-app/$f` will break | Already cleaned up in migration (Section 6) |
| Terminal sessions | Any shell with cwd in the old path will break | cd to new path |
| Finder bookmarks | May point to old path | Update manually |

### Timing

Do this as the VERY LAST step, after:
1. Git is initialized and committed
2. All files are restructured into the new layout
3. Vercel is re-linked and tested
4. All new files (CLAUDE.md, README, etc.) are written

Renaming first would invalidate the PRD paths, complicate the migration, and confuse any in-progress Claude sessions.

---

## 9. Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ONIN images break after move | Low | High (visual regression) | All paths in index.html are relative (`images/`, `css/`, `js/`) so they survive the move. Verify with browser test. |
| Vercel deploy breaks during migration | Medium | Medium (temporary downtime) | The existing Vercel deployment is already live. It will not break until we re-deploy. We re-link BEFORE redeploying. |
| `ONIN.pptx` accidentally committed to git | Medium | High (385MB in git history forever) | `.gitignore` is created BEFORE `git add`. Verify with `git status` before committing. |
| Template diverges from ONIN quality | Low | Medium (new PitchApps feel "off") | Template is derived directly from ONIN code. CONVENTIONS.md documents the details. |
| Root folder rename breaks Vercel link | Low | Low | `.vercel/` is re-created with `vercel link`. This is a 10-second operation. |

---

## 10. Implementation Order for Developer Agent

The developer agent should implement in this exact order:

### Phase A: Git Setup (US-002)
1. Create root `.gitignore`
2. `git init`
3. `git add -A` and verify `ONIN.pptx` is NOT staged
4. Initial commit

### Phase B: Restructure (US-001)
5. Create directory scaffold (`apps/`, `templates/`, `docs/`, `sources/`)
6. Move ONIN files from `pitch-app/` to `apps/onin/`
7. Move `ONIN.pptx` to `sources/onin/`
8. Remove old `pitch-app/` directory
9. Verify ONIN loads in browser (relative paths still work)
10. Commit restructure

### Phase C: Template (US-004)
11. Create `templates/pitchapp-starter/index.html` (generic sections)
12. Create `templates/pitchapp-starter/css/style.css` (semantic variables)
13. Create `templates/pitchapp-starter/js/app.js` (generic selectors)
14. Create `templates/pitchapp-starter/images/.gitkeep`
15. Create `templates/pitchapp-starter/README.md`
16. Verify template loads in browser

### Phase D: Shareability Scaffold (US-005)
17. Copy template to `apps/shareability/`
18. Update CSS color variables to a neutral alternate palette
19. Update placeholder text references
20. Create `apps/shareability/images/.gitkeep`
21. Create `apps/shareability/README.md`
22. Verify Shareability loads in browser

### Phase E: Documentation (US-006, US-007, US-008)
23. Create root `CLAUDE.md`
24. Create `docs/CONVENTIONS.md`
25. Create root `README.md`
26. Create `apps/onin/README.md`
27. Update `.claude/settings.local.json` (clean up old paths)
28. Commit all documentation

### Phase F: Vercel Re-linking (US-003)
29. `cd apps/onin && vercel link` (re-link to existing project)
30. Test deploy with `vercel` (preview)
31. Document the process in CONVENTIONS.md
32. Commit any generated config changes

### Phase G: Folder Rename
33. Close editors/terminals
34. `mv /Users/ajhart/Desktop/ONIN /Users/ajhart/Desktop/PitchApp`
35. Re-open in new location
36. Final verification

---

## 11. Open Questions for User

### Q1: Vercel Project Naming

When re-linking ONIN to Vercel, should we:

A) **Keep the existing project name "pitch-app"** -- no URL change, no dashboard disruption, but the name does not match the new structure
B) **Rename to "onin-pitchapp"** -- clearer naming convention, but creates a new Vercel URL and dashboard entry

**Recommendation: A (keep "pitch-app").** Renaming means a new deployment URL. Unless you want to share a fresh URL, keeping the existing project avoids disruption. You can rename later in the Vercel dashboard without redeploying.

### Q2: Template Section Count

The PRD says "11 section types." ONIN actually has 17 sections, but several reuse the same layout type (e.g., sections 6, 8, 11, 12 all use the "background statement" pattern, and sections 9 and 14 both use "split image+text"). Should the template:

A) **Include exactly one of each type (13 sections total: 11 content types + hero + closing)** -- smaller template, less to delete
B) **Include one of each type plus a second "split image+text" and "background statement" to show variation** -- more complete but longer

**Recommendation: A.** One of each is cleaner. The CONVENTIONS.md playbook can document variations for types that have them.

### Q3: Template Font Choice

The template defaults to the same fonts as ONIN (Cormorant Garamond + DM Sans). Should we:

A) **Keep these fonts as template defaults** -- they are proven to work well together for pitch decks
B) **Use system fonts as placeholder** -- forces each new PitchApp to make a deliberate font choice

**Recommendation: A.** These fonts are a strong default. The CSS variable system and README make it obvious how to change them. Starting with working fonts means the template looks polished from the first browser test.

---

## 12. Complexity Estimates

| Work Item | Complexity | Estimated Effort | Notes |
|-----------|------------|------------------|-------|
| Git setup + .gitignore | Simple | 15 min | Straightforward, just be careful with ONIN.pptx |
| Directory restructure + file moves | Simple | 20 min | All mv commands, verify relative paths |
| Template index.html | Medium | 1-2 hours | Genericize 17 ONIN sections into 13 template sections |
| Template style.css | Medium | 1-2 hours | Rename all class names, restructure variables |
| Template app.js | Medium | 1 hour | Update selectors to match template classes |
| Shareability scaffold | Simple | 20 min | Copy template, change color variables |
| CLAUDE.md | Simple | 30 min | Structured document, content defined in Section 6 |
| CONVENTIONS.md | Complex | 2-3 hours | Comprehensive playbook with HTML patterns for each type |
| Root README.md | Simple | 20 min | Overview document |
| Per-app READMEs | Simple | 15 min each | Templated format |
| Vercel re-linking | Simple | 15 min | CLI commands, verify deploy |
| Folder rename | Simple | 5 min | Single mv command |

**Total estimated effort: 7-10 hours** for a developer working with Claude Code.

---

## Appendix A: ONIN Section-to-Type Mapping

For reference when building the template and conventions:

| ONIN Section | # | Type | Key CSS Pattern |
|-------------|---|------|-----------------|
| Hero | 1 | Hero | Full-bleed image, vignette gradient, centered flex column |
| Who We Are | 2 | Text-Centered | max-width container, centered label + serif headline |
| Overview | 3 | Numbered Grid | CSS Grid 2x2, 1px gap trick for borders, numbered items |
| ABBA Voyage | 4 | Background Stats | Absolute bg image + wash, counter animation, callout pills |
| Why Country | 5 | Metric Grid | CSS Grid 3-col, large display numbers, summary paragraph |
| The Show | 6 | Background Statement | Absolute bg image + wash, centered title stack |
| Biggest Stars | 7 | Card Gallery | 2-col image grid, aspect-ratio cards, overlay labels |
| ILM | 8 | Background Statement | (same pattern as The Show) |
| The Venue | 9 | Split Image+Text | Flexbox row, clip-path reveal on image, text column |
| Limitations | 10 | List | Bg image, flex-column list, icon + text items, slide-in |
| Location | 11 | Background Statement | (same pattern, adds big stat + neighbor pills) |
| Little Broadway | 12 | Background Statement | (same pattern, adds italic em in headline) |
| Day & Night | 13 | Dual Panel | Flexbox row, two image panels, overlay text, hover scale |
| Ernest | 14 | Split Image+Text | (same pattern as Venue, different image side) |
| The Team | 15 | Team Grid | CSS Grid 3-col, circular photos, name/role text |
| Summary | 16 | Summary | Flex column, numbered blocks, left-border hover accent |
| Closing | 17 | Closing | Bg image, centered title echo, CTA button |

## Appendix B: CSS Variable Mapping (ONIN to Template)

| ONIN Variable | Template Variable | ONIN Value |
|--------------|-------------------|------------|
| `--black` | `--color-bg` | `#080808` |
| `--black-card` | `--color-bg-card` | `#0f0f0f` |
| `--black-elevated` | `--color-bg-raised` | `#161616` |
| `--white` | `--color-text` | `#f5f2ed` |
| `--white-muted` | `--color-text-muted` | `#a89f94` |
| `--gold` | `--color-accent` | `#c8a44e` |
| `--gold-light` | `--color-accent-light` | `#dfc06a` |
| `--gold-dim` | `--color-accent-dim` | `#8b7235` |
| `--amber` | (removed) | `#d4a853` |
| `--copper` | (removed) | `#b87333` |
| `--burgundy` | (removed) | `#5c1a2a` |
| `--red-muted` | `--color-negative` | `#8b3a3a` |

Note: `--amber`, `--copper`, and `--burgundy` are defined in ONIN's CSS but never used in the current stylesheet. They are omitted from the template. ONIN's `apps/onin/css/style.css` keeps its original variable names -- the template uses the semantic names for new apps only.

## Appendix C: Image Audit

Images referenced in `index.html` vs. images in the `images/` directory:

**Referenced in HTML (13 unique files):**
- `slide2_Cover_edit_1.jpg` (hero + closing)
- `slide4_ABBA_Voyage_edit_12.jpg`
- `slide6_Show_edit_2.jpg`
- `slide8_ONIN_Cash_&_Combs_2_-_edit.jpg`
- `slide8_ONIN_Shania_and_Lainey.jpg`
- `slide9_ABBA_Voyage_edit_14.jpg`
- `slide10_Show_edit_1.jpg`
- `slide11_ABBA_Voyage_edit_10.jpg`
- `slide12_Overview_edit_1.jpg`
- `slide14_Hero_edit_1.jpg`
- `slide16_Hero_edit_4.jpg`
- `slide18_Rowdy_edit_2.jpg`
- `slide19_Picture_7.jpg`
- `slide20_Untitled_design_(5).jpg`
- `slide20_Tim_Staples_headshot_edit_2.jpg`

**In directory but NOT referenced (6 files):**
- `slide10_Show_edit_9.jpg`
- `slide11_Line_Line.jpg`
- `slide4_Line_Line.jpg`
- `slide17_Hero_edit_4.jpg`
- `slide24_Cover_edit_1.jpg`
- `slide9_ABBA_Voyage_edit_12.jpg`

These 6 unreferenced images can be left in `apps/onin/images/` for now (they are small, under 350KB each). The developer could optionally remove them to reduce the deploy size, but it is not critical.
