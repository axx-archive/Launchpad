# PitchApp

A workspace for building scroll-driven, single-page interactive presentations — a modern alternative to sending a PDF or slide deck. Each PitchApp is a standalone static site deployed independently to Vercel.

---

## How to Use This

You don't need to memorize anything in this repo. Just talk to Claude and the system handles the rest.

### Starting a new PitchApp

Just describe what you need:

> "Build me a pitch app for [company]. Here's a transcript / here are the details."

Claude reads `CLAUDE.md` automatically and knows the full system — how to structure sections, which agents to use, the animation conventions, deployment process, everything.

**Want the designer to surprise you?** Just describe the company and let Claude get creative with the aesthetic. This tends to produce the best brand results.

**Already have specific brand guidelines?** Use `/pitchapp new <name>` to fast-track setup with your exact colors and fonts. This is a shortcut for when you know what you want — skip it when you'd rather see what Claude comes up with.

### Building and iterating

Work conversationally. Make changes, ask for tweaks, provide feedback. Claude handles the code, animations, responsive behavior, and deployment.

### Reviewing a PitchApp

When you want a comprehensive review from multiple angles:

> `/pitchapp review`

This creates a real agent team (5 reviewers: product lead, copywriter, copy critic, UX/UI, code reviewer) that captures screenshots and evaluates the app. Results come back as a prioritized list of findings.

You can also just ask for specific reviews:
> "Review the copy on this" or "Check the mobile experience"

### Deploying

Just say "deploy it." Claude runs the deploy checklist (meta tags, responsive check, etc.) and pushes to Vercel.

---

## Current PitchApps

| App | Type | Status | URL |
|-----|------|--------|-----|
| [bonfire](apps/bonfire/) | Studio landing page | Live | [bonfire.vercel.app](https://bonfire.vercel.app) |
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
├── apps/                             # Built PitchApps (each independently deployable)
│   ├── bonfire/                      # bonfire labs — studio landing page
│   ├── breakthrough-artists/         # Breakthrough Playbook — research presentation
│   ├── onin/                         # One Night in Nashville — investor deck
│   ├── shareability/                 # Shareability — investor deck v1
│   ├── shareability_v2/              # Shareability — investor deck v2
│   └── shareability_highmount/       # Shareability x Highmount — targeted deck
│
├── templates/
│   └── pitchapp-starter/             # Starter template for new apps
│
├── docs/
│   ├── CONVENTIONS.md                # Deep technical reference (section types, CSS, animations)
│   └── PITCH-TEAM-GUIDE.md          # Non-technical guide for founders using the AI pitch team
│
├── tasks/                            # Pipeline working files (per company)
│   ├── shareability/                 # Shareability slide maps, content, extracted images
│   ├── shareability_highmount/       # Highmount narrative, copy, one-pager
│   └── _archive/                     # Historical planning docs (PRD, architecture)
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
        ├── pitchapp-review/          # /pitchapp review — agent team review
        ├── pitch-narrative/          # 6-beat pitch arc methodology
        ├── investor-comms/           # Email writing patterns
        └── pitchapp-sections/        # Section type quick reference
```

---

## Tech Stack

- **HTML/CSS/JS** — vanilla, no build tools or frameworks
- **GSAP 3.12.5 + ScrollTrigger + ScrollToPlugin** — scroll-driven animations
- **Google Fonts** — Cormorant Garamond + DM Sans (defaults, customizable per app)
- **Vercel** — static site hosting, one project per PitchApp
- **Playwright** — screenshot capture for visual QA

---

## Key Files

| File | What It Does |
|------|-------------|
| `CLAUDE.md` | **The brain.** Claude reads this automatically — covers what PitchApps are, how to build them, known gotchas, agents, skills, deployment. |
| `docs/CONVENTIONS.md` | **The bible.** Deep technical reference for static builds — all 13 section types with HTML patterns, CSS architecture, animation timing tables, custom section types. |
| `templates/pitchapp-starter/` | **The template.** Copy this to start a new static PitchApp. |
| `docs/PITCH-TEAM-GUIDE.md` | **The explainer.** Non-technical guide for founders who want to understand how the AI pitch team works. |

---

## Skills Quick Reference

| Command | What It Does |
|---------|-------------|
| `/pitchapp new <name>` | Scaffold a new PitchApp from the template (asks for brand details) |
| `/pitchapp review` | Create an agent team to review the current PitchApp (captures screenshots, 5 reviewers) |
