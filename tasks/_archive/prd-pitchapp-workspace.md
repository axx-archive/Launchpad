# PRD: PitchApp Workspace

## Introduction

Restructure the existing ONIN project into a multi-app workspace that can host N independent PitchApps. A **PitchApp** is a scroll-driven, GSAP-animated investor pitch deck deployed as a static site to Vercel. ONIN (One Night in Nashville) is the first PitchApp; Shareability will be the second. The workspace needs a template, conventions, and documentation so that future PitchApps can be scaffolded quickly by a developer working with Claude Code.

## Goals

- Reorganize the ONIN project into a scalable folder structure that supports multiple independent PitchApps
- Preserve the existing ONIN PitchApp and its Vercel deployment without downtime
- Create a PitchApp starter template that captures the proven patterns from ONIN (section types, GSAP scroll animations, CSS architecture, responsive approach)
- Scaffold an empty Shareability PitchApp from the template, ready for content
- Establish a `CLAUDE.md` at workspace root so every future Claude session understands the PitchApp pattern automatically
- Document conventions in a playbook so new PitchApps are consistent and high-quality
- Initialize git with proper ignoring of large files (.pptx, .vercel)

## User Stories

### US-001: Create workspace folder structure
**Description:** As a developer, I need the project reorganized into a scalable folder layout so that each PitchApp lives in its own directory and shared resources have a clear home.

**Acceptance Criteria:**
- [ ] Root directory contains: `apps/`, `templates/`, `docs/`, `sources/`
- [ ] ONIN app files moved from `/pitch-app/` to `/apps/onin/` (index.html, css/, js/, images/)
- [ ] `ONIN.pptx` moved to `/sources/onin/ONIN.pptx`
- [ ] No files left in the old `/pitch-app/` directory
- [ ] All internal references (image paths, CSS/JS links) still work after the move

### US-002: Initialize git repository
**Description:** As a developer, I need version control initialized before any restructuring so I have a clean history.

**Acceptance Criteria:**
- [ ] Git repo initialized at `/Users/ajhart/Desktop/ONIN`
- [ ] `.gitignore` excludes: `*.pptx`, `.DS_Store`, `node_modules/`, `.vercel/`, `*.psd`, `*.ai`
- [ ] Initial commit captures the current state before restructuring
- [ ] Second commit captures the restructured state
- [ ] No files over 100MB are tracked by git

### US-003: Configure per-app Vercel deployment
**Description:** As a developer, I need each PitchApp to deploy independently to Vercel with its own project and URL.

**Acceptance Criteria:**
- [ ] ONIN continues to deploy from its new location (`/apps/onin/`)
- [ ] Vercel `rootDirectory` setting documented for per-app configuration
- [ ] Each app directory can have its own `.vercel/project.json` (or equivalent config)
- [ ] Deployment instructions documented in the playbook
- [ ] Existing ONIN Vercel deployment is re-linked to the new path (or documented how to do so)

### US-004: Create PitchApp starter template
**Description:** As a developer, I need a blank PitchApp skeleton that includes the proven GSAP scroll patterns, CSS architecture, and section types from ONIN so I can scaffold new PitchApps quickly.

**Acceptance Criteria:**
- [ ] Template exists at `/templates/pitchapp-starter/`
- [ ] Template contains: `index.html`, `css/style.css`, `js/app.js`, `images/.gitkeep`
- [ ] `index.html` includes the base HTML structure with placeholder sections covering the core section types (hero, text-centric, background-image, grid/metric, card gallery, split image+text, list, dual panel, team grid, summary, closing)
- [ ] `style.css` includes the CSS variable system (colors as placeholders, typography, spacing, easing), the responsive grid patterns, the `anim-fade` base class, background-image layer pattern, navigation bar pattern, film grain overlay, and media query breakpoints
- [ ] `app.js` includes the loader, hero reveal timeline, ScrollTrigger fade-in system, parallax pattern, counter animation, navigation scroll behavior, and smooth anchor scrolling -- all wired to the template HTML
- [ ] Template sections use generic naming (e.g., `section-1`, `section-2`) not ONIN-specific names
- [ ] Template includes HTML comments explaining each section type and how to customize it
- [ ] Template works when opened in a browser (loads GSAP from CDN, animations fire)

### US-005: Scaffold Shareability PitchApp
**Description:** As a developer, I need an empty Shareability PitchApp created from the template so that content work can begin immediately.

**Acceptance Criteria:**
- [ ] Shareability app exists at `/apps/shareability/`
- [ ] Copied from the starter template with section names updated to Shareability-generic placeholders
- [ ] CSS color variables updated to a neutral placeholder palette (not ONIN's gold/black)
- [ ] Font choices set to the same defaults (Cormorant Garamond + DM Sans) but noted as customizable
- [ ] Loads and runs in a browser with placeholder content
- [ ] Has its own `images/` directory with `.gitkeep`

### US-006: Create CLAUDE.md workspace config
**Description:** As a developer working with Claude Code, I need a `CLAUDE.md` at the workspace root so that every future Claude session automatically understands the PitchApp workspace conventions.

**Acceptance Criteria:**
- [ ] `CLAUDE.md` exists at workspace root `/Users/ajhart/Desktop/ONIN/CLAUDE.md`
- [ ] Describes what a PitchApp is (scroll-driven GSAP investor pitch deck, static HTML/CSS/JS)
- [ ] Documents the folder structure and where things live
- [ ] Explains how to create a new PitchApp (copy template, rename, customize)
- [ ] Lists the core section types available in the template
- [ ] Notes the CSS variable system and how to theme a new PitchApp
- [ ] Documents the animation system (GSAP + ScrollTrigger, anim-fade class, scroll triggers)
- [ ] Notes Vercel deployment conventions (separate project per app, rootDirectory config)
- [ ] References the playbook at `/docs/CONVENTIONS.md` for deeper detail

### US-007: Write PitchApp conventions playbook
**Description:** As a developer, I need a written playbook that captures all the learnings from ONIN so that future PitchApps maintain quality and consistency.

**Acceptance Criteria:**
- [ ] Playbook exists at `/docs/CONVENTIONS.md`
- [ ] Covers: section type catalog (with HTML patterns for each of the 11 section types)
- [ ] Covers: CSS architecture (variable naming, responsive strategy, background-image layer pattern, typography with clamp())
- [ ] Covers: animation conventions (ScrollTrigger start positions, stagger timing, easing choices, parallax scrub values)
- [ ] Covers: image naming convention (`slide{N}_{ContentType}_{Edit}.jpg`)
- [ ] Covers: file structure per PitchApp (index.html, css/style.css, js/app.js, images/)
- [ ] Covers: Vercel deployment checklist (create project, set rootDirectory, deploy, verify)
- [ ] Covers: responsive breakpoints (480px, 640px, 768px) and what changes at each
- [ ] Covers: performance notes (z-index stacking, min-height patterns, image optimization)

### US-008: Create workspace README
**Description:** As anyone opening this project, I need a root README that explains what this workspace is and how it's organized.

**Acceptance Criteria:**
- [ ] `README.md` exists at workspace root
- [ ] Explains this is the PitchApp workspace
- [ ] Lists all current PitchApps (ONIN, Shareability) with their status and deploy URLs
- [ ] Documents the folder structure
- [ ] Explains how to add a new PitchApp (step-by-step)
- [ ] Links to `/docs/CONVENTIONS.md` for the full playbook

## Functional Requirements

- FR-1: The workspace root directory must contain `apps/`, `templates/`, `docs/`, `sources/` directories
- FR-2: Each PitchApp must live in its own directory under `apps/{app-name}/`
- FR-3: Each PitchApp must be a self-contained static site (HTML + CSS + JS + images) deployable independently
- FR-4: The starter template at `templates/pitchapp-starter/` must include all 11 section type patterns from ONIN with generic naming
- FR-5: The template CSS must use CSS custom properties for all colors, fonts, and spacing so theming requires only changing variable values
- FR-6: The template JS must include the full GSAP animation system (loader, hero reveal, scroll fade-ins, parallax, counters, navigation) wired to generic section selectors
- FR-7: Source files (.pptx, .psd, etc.) must live in `sources/{app-name}/` and be git-ignored
- FR-8: `.gitignore` must exclude: `*.pptx`, `*.psd`, `*.ai`, `.DS_Store`, `node_modules/`, `.vercel/`
- FR-9: `CLAUDE.md` must be present at workspace root and accurately describe the workspace conventions
- FR-10: Each PitchApp's Vercel deployment must use the `rootDirectory` setting pointing to its `apps/{name}/` path
- FR-11: The conventions playbook must document all 11 section types with their HTML structure patterns

## Non-Goals

- No shared JavaScript library or npm package extracted from PitchApp patterns (premature with only 2 apps; duplicate-first, extract when a third app arrives)
- No build tooling, bundlers, or preprocessors (PitchApps are vanilla HTML/CSS/JS)
- No shared component system or runtime imports between PitchApps
- No CI/CD pipeline (manual Vercel deploys are sufficient)
- No content creation for Shareability (this PRD covers structure only, not content)
- No custom domain setup (Vercel default URLs are fine for now)
- No portfolio landing page linking all PitchApps together

## Design Considerations

- Each PitchApp will have its own visual identity (colors, fonts, imagery) so the template must make theming obvious through CSS variables
- The 11 section types from ONIN represent a proven pattern library; the template should include all of them as a menu to pick from, not a rigid sequence
- Future PitchApps will evolve the format, so the template is a starting point, not a constraint
- The film grain overlay, navigation bar, and loader are structural elements that should be in every PitchApp template

## Technical Considerations

- **Vercel migration risk:** Moving ONIN from `/pitch-app/` to `/apps/onin/` will break the existing Vercel project link. The project must be re-linked with `vercel link` or the `rootDirectory` updated in the Vercel dashboard. This should be done carefully to avoid downtime.
- **Large file handling:** `ONIN.pptx` is 385MB and cannot be tracked by git. It must be git-ignored. Git LFS is not necessary since source files don't need version control.
- **GSAP CDN dependency:** All PitchApps load GSAP 3.12.5 and ScrollTrigger from CDN (`cdnjs.cloudflare.com`). The template should pin this version.
- **No build step:** PitchApps are static sites with no build process. They work by opening `index.html` directly or deploying to any static host.
- **Font loading:** Google Fonts loaded via `<link>` tags in HTML head. Each PitchApp can choose its own fonts.

## Success Metrics

- A new PitchApp can be scaffolded from the template and running in a browser within a single Claude Code session
- The CLAUDE.md is sufficient for a fresh Claude session to understand the workspace without additional context
- ONIN continues to work identically after the restructure (no visual or functional regression)
- The conventions playbook covers enough detail that a PitchApp built from it matches the quality level of ONIN

## Resolved Decisions

1. **Rename root folder:** Yes -- rename from `ONIN` to `PitchApp` (or `PitchApps`). The workspace is no longer a single project.
2. **Per-app README:** Yes -- each PitchApp gets its own `README.md` with brand colors, deploy URL, and content source notes.
3. **Shared code extraction:** Not now. Each app gets its own copy from the template. Extract into a shared file only when copy-paste duplication starts causing bugs (e.g., fixing an animation in one app but forgetting the others). No fixed threshold -- use judgment.
