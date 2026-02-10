# Shareability x Highmount PitchApp

A scroll-driven investor pitch deck presenting Shareability's intelligence platform and venture engine to Highmount.

## Overview

This PitchApp presents Shareability's two linked assets:

1. **Shareability Platform** (Asset One) - YouTube-first intelligence, strategy, and performance infrastructure
2. **Venture Engine** (Asset Two) - A packaging system that turns talent access into investable opportunities

## Sections

1. **Hero** - "Intelligence + Venture / Shareability"
2. **The Opportunity** - YouTube as the cultural epicenter
3. **Platform Positioning** - "The Company YouTube Hires to Do YouTube"
4. **Track Record** - Olympics, NFL, F1, PGA, Taylor Swift, Roblox, Grammys
5. **Platform Asset** - Asset One breakdown
6. **Strategic Shift** - "From Execution to Architecture"
7. **Venture Engine** - Asset Two introduction
8. **Proof Point** - Tim McGraw / Down Home success
9. **The Fit** - Shareability (Intelligence) + Highmount (Execution)
10. **Investment Paths** - Path A (Platform) and Path B (Venture)
11. **What It Unlocks** - Benefits for Highmount
12. **Closing** - "Two linked assets. One accelerated future."

## Color System

- **Gold** (`#c8a44e`) - Primary accent for Venture sections, hero, closing
- **Blue** (`#5b7fb5`) - Secondary accent for Platform/Intelligence sections

## Image Requirements

| File | Purpose |
|------|---------|
| `hero-bg.jpg` | Dark cinematic, abstract digital pattern with gold accents |
| `platform-bg.jpg` | Data visualization, blue/gold on dark |
| `card-olympics.jpg` | Olympics initiative imagery |
| `card-nfl.jpg` | NFL/Football imagery |
| `card-f1.jpg` | Formula 1/Racing imagery |
| `card-pga.jpg` | Golf/PGA imagery |
| `card-taylor-swift.jpg` | Concert/crowd imagery |
| `card-roblox.jpg` | Gaming/digital world imagery |
| `card-grammys.jpg` | Music/awards stage imagery |
| `platform-split.jpg` | Dashboard/platform visual (blue tones) |
| `shift-bg.jpg` | Architectural abstract with gold accents |
| `mcgraw-bg.jpg` | Nashville/country aesthetic |
| `panel-shareability.jpg` | Dark, intellectual tone (blues/blacks) |
| `panel-highmount.jpg` | Bright, action, momentum (golds/warm) |
| `unlocks-bg.jpg` | Growth/momentum abstract |
| `closing-bg.jpg` | Echo of hero |

## Local Development

```bash
# From the app directory
cd apps/shareability_highmount

# Option 1: Open directly
open index.html

# Option 2: Local server
python3 -m http.server 8080
# Then visit http://localhost:8080
```

## Deployment

```bash
cd apps/shareability_highmount
vercel link
vercel --prod
```

## Deploy URL

*To be updated after deployment*

---

Built with GSAP + ScrollTrigger. Part of the PitchApp workspace.
