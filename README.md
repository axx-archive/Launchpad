# PitchApp

A workspace for building scroll-driven, single-page interactive presentations — a modern alternative to sending a PDF or slide deck. Each PitchApp is a standalone static site deployed independently to Vercel.

**Launchpad Portal** (`apps/portal/`) is the private operations layer — a members-only dashboard where clients track their PitchApp projects, preview builds, and request changes through Scout (AI assistant).

---

## How to Use This

You don't need to memorize anything in this repo. Just talk to Claude and the system handles the rest.

### Starting a new PitchApp

Just describe what you need:

> "Build me a pitch app for [company]. Here's a transcript / here are the details."

Claude reads `CLAUDE.md` automatically and knows the full system — how to structure sections, which agents to use, the animation conventions, deployment process, everything.

**Want the designer to surprise you?** Just describe the company and let Claude get creative with the aesthetic. This tends to produce the best brand results.

**Already have specific brand guidelines?** Use `/pitchapp new <name>` to fast-track setup with your exact colors and fonts. This is a shortcut for when you know what you want — skip it when you'd rather see what Claude comes up with.

### Building from a Launchpad mission

When a client submits a project through the Launchpad Portal:

```
/pitchapp pull              # Pull mission data + uploaded docs from Launchpad
@narrative-strategist       # Extract the story from their materials
/pitchapp new <name>        # Scaffold the PitchApp
... build sections ...
vercel --prod               # Deploy
/pitchapp push              # Push URL to Launchpad — client sees it in their portal
```

### Revising from Scout feedback

When a client requests changes through Scout (the AI assistant in the portal):

```
/pitchapp brief             # Pull edit briefs from Scout
... apply changes ...
vercel --prod               # Redeploy
/pitchapp push              # Push updated URL, back to review
```

### Reviewing a PitchApp

When you want a comprehensive review from multiple angles:

> `/pitchapp review`

This creates a real agent team (5 reviewers: product lead, copywriter, copy critic, UX/UI, code reviewer) that captures screenshots and evaluates the app. Results come back as a prioritized list of findings.

You can also just ask for specific reviews:
> "Review the copy on this" or "Check the mobile experience"

### Deploying

Just say "deploy it." Claude runs the deploy checklist (meta tags, responsive check, etc.) and pushes to Vercel.

---

## System Architecture

The PitchApp system has two layers: the **build pipeline** (agents + skills running locally in Claude Code) and the **Launchpad Portal** (Next.js app where clients interact).

### Build Pipeline

Sequential agent chain with mandatory user approval at each checkpoint:

```
@narrative-strategist  →  Extract story from raw materials
        ↓ [user approval]
@copywriter            →  Generate PitchApp copy, emails, slides
        ↓ [user approval]
@pitchapp-developer    →  Build the PitchApp (HTML/CSS/JS + GSAP)
        ↓ [user approval]
/pitchapp review       →  5-person agent team reviews in parallel
        ↓ [fixes applied]
vercel --prod          →  Deploy
/pitchapp push         →  Push URL to Launchpad Portal
```

**Why sequential, not parallel?** Each step depends on the previous step's output. You can't build without copy, can't write copy without the narrative. The review step IS parallel — 5 independent reviewers run simultaneously.

### Launchpad Portal

The portal (`apps/portal/` → `launchpad.bonfire.tools`) handles the client-facing loop:

```
Client submits project  →  /pitchapp pull (admin pulls mission data)
Admin builds PitchApp   →  /pitchapp push (URL appears in client's portal)
Client previews         →  Uses Scout to request changes
Scout generates brief   →  /pitchapp brief (admin pulls edit requests)
Admin applies edits     →  /pitchapp push (updated build, back to review)
Repeat until approved   →  Admin sets status to "live"
```

### Launchpad CLI

`scripts/launchpad-cli.mjs` bridges the build pipeline and the portal. Talks directly to Supabase using the service role key.

```bash
node scripts/launchpad-cli.mjs missions               # List all missions
node scripts/launchpad-cli.mjs pull <id-or-name>       # Pull mission data + docs
node scripts/launchpad-cli.mjs push <id-or-name> <url> # Push URL, set to review
node scripts/launchpad-cli.mjs briefs <id-or-name>     # Get edit briefs
node scripts/launchpad-cli.mjs status <id-or-name> <s> # Update status
```

Supports full UUIDs, ID prefixes, or company/project name matching.

---

## Current Apps

| App | Type | Status | URL |
|-----|------|--------|-----|
| [bonfire](apps/bonfire/) | Studio landing page | Live | [bonfire.tools](https://bonfire.tools) |
| [portal](apps/portal/) | Launchpad Portal (Next.js) | Live | [launchpad.bonfire.tools](https://launchpad.bonfire.tools) |
| [launchpad](apps/launchpad/) | Product page (meta) | Live | [bonfire.tools/launchpad](https://bonfire.tools/launchpad) |
| [breakthrough-artists](apps/breakthrough-artists/) | Research presentation | Live | [breakthrough-artists.vercel.app](https://breakthrough-artists.vercel.app) |
| [onin](apps/onin/) | Investor deck | Live | [pitch-app-eight.vercel.app](https://pitch-app-eight.vercel.app) |
| [shareability](apps/shareability/) | Investor deck (v1) | Built | — |
| [shareability_v2](apps/shareability_v2/) | Investor deck (v2) | Built | — |
| [shareability_highmount](apps/shareability_highmount/) | Targeted investor deck | Built | — |

---

## Folder Structure

```
PitchApp/
├── CLAUDE.md                         # System instructions (Claude reads this automatically)
├── README.md                         # This file
│
├── apps/                             # Built PitchApps + Portal
│   ├── portal/                       # Launchpad Portal (Next.js → launchpad.bonfire.tools)
│   ├── bonfire/                      # bonfire labs — studio landing page (bonfire.tools)
│   │   └── launchpad/                # Launchpad product marketing page
│   ├── breakthrough-artists/         # Breakthrough Playbook — research presentation
│   ├── onin/                         # One Night in Nashville — investor deck
│   ├── shareability/                 # Shareability — investor deck v1
│   ├── shareability_v2/              # Shareability — investor deck v2
│   └── shareability_highmount/       # Shareability x Highmount — targeted deck
│
├── scripts/
│   └── launchpad-cli.mjs             # CLI bridge to Launchpad Portal (Supabase)
│
├── templates/
│   └── pitchapp-starter/             # Starter template for new static PitchApps
│
├── docs/
│   ├── CONVENTIONS.md                # Deep technical reference (section types, CSS, animations)
│   └── PITCH-TEAM-GUIDE.md          # Non-technical guide for founders
│
├── tasks/                            # Pipeline working files (per company)
│   └── {company}/                    # Created by /pitchapp pull
│       ├── mission.md                # Project details from Launchpad
│       ├── materials/                # Downloaded client documents
│       ├── briefs/                   # Scout edit briefs
│       ├── narrative.md              # Extracted story
│       └── pitchapp-copy.md          # Generated copy
│
├── sources/                          # Source files (.pptx, .psd) — git-ignored
│
└── .claude/
    ├── agents/                       # Specialized agents
    │   ├── narrative-strategist.md   # Story extraction (the key agent)
    │   ├── copywriter.md             # Copy generation
    │   ├── pitchapp-developer.md     # Build from copy spec
    │   ├── pitchapp-visual-qa.md     # Visual review
    │   └── pitch-pipeline.md         # Full pipeline orchestration
    └── skills/
        ├── pitchapp-new/             # /pitchapp new — scaffold a new app
        ├── pitchapp-review/          # /pitchapp review — 5-person agent team review
        ├── pitchapp-pull/            # /pitchapp pull — pull mission from Launchpad
        ├── pitchapp-push/            # /pitchapp push — push URL to Launchpad
        ├── pitchapp-brief/           # /pitchapp brief — pull Scout edit briefs
        ├── pitch-narrative/          # 6-beat pitch arc methodology
        ├── investor-comms/           # Email writing patterns
        └── pitchapp-sections/        # Section type quick reference
```

---

## Tech Stack

### PitchApps (Static)
- **HTML/CSS/JS** — vanilla, no build tools or frameworks
- **GSAP 3.12.5 + ScrollTrigger + ScrollToPlugin** — scroll-driven animations
- **Google Fonts** — Cormorant Garamond + DM Sans (defaults, customizable per app)
- **Vercel** — static site hosting, one project per PitchApp
- **Playwright** — screenshot capture for visual QA

### Launchpad Portal
- **Next.js 16** — App Router, TypeScript, Tailwind CSS
- **Supabase** — Auth (magic links), PostgreSQL, Storage (documents)
- **Anthropic SDK** — Scout AI assistant (Claude Sonnet)
- **Vercel** — hosting (`launchpad.bonfire.tools`)

---

## Key Files

| File | What It Does |
|------|-------------|
| `CLAUDE.md` | **The brain.** Claude reads this automatically — covers what PitchApps are, how to build them, known gotchas, agents, skills, deployment, Launchpad integration. |
| `docs/CONVENTIONS.md` | **The bible.** Deep technical reference for static builds — all 13 section types with HTML patterns, CSS architecture, animation timing tables. |
| `scripts/launchpad-cli.mjs` | **The bridge.** CLI tool connecting the build pipeline to the Launchpad Portal via Supabase REST API. |
| `templates/pitchapp-starter/` | **The template.** Copy this to start a new static PitchApp. |
| `docs/PITCH-TEAM-GUIDE.md` | **The explainer.** Non-technical guide for founders who want to understand how the AI pitch team works. |

---

## Skills Quick Reference

| Command | What It Does |
|---------|-------------|
| `/pitchapp new <name>` | Scaffold a new PitchApp from the template (asks for brand details) |
| `/pitchapp review` | Create a 5-person agent team to review the current PitchApp |
| `/pitchapp pull` | Pull a mission from Launchpad Portal (project details + uploaded docs) |
| `/pitchapp push` | Push a deployed PitchApp URL to Launchpad, set status to review |
| `/pitchapp brief` | Pull Scout edit briefs for a revision build |
