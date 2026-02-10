# Shareability Venture Studio - PitchApp

A scroll-driven investor pitch deck for Shareability, a Venture Studio focused on country culture.

## Overview

Shareability partners with talent to create ventures across Digital Media, Film & TV, and Experiential. This PitchApp presents the 11-slide investor narrative from SHB_20.pptx.

## Narrative Flow (11 Sections)

1. **Hero** - Shareability: A VENTURE STUDIO
2. **Our Story: Digital Studio** - YouTube trend intelligence pioneers
3. **Our Story: Tim McGraw** - Cultural relevance led to Film/TV/Experiential
4. **Our Story: Venture Studio** - Talent want to work with us (Kirk, McGraw, Bert, Caitlin Clark, Josh Allen)
5. **Areas of Focus** - Film & TV, Experiential, Digital Media (Country Culture at center)
6. **Digital Media Portfolio** - Nonstop, Out of the Pocket, Big Man on Campus, Walks with Peter (KIRK)
7. **Film & TV Portfolio** - Roughstock, The Rescue (McGRAW), Boys of FALL, Life in the Fast Lane (KIRK)
8. **Experiential Portfolio** - ONIN, Fully Loaded Fridays (Kirk & Bert), Roast of Country Music (Theo Vonn), All My Rowdy Friends (McGRAW)
9. **The Packaging System** - 6 steps: Discover, Design, Attach, Assemble, Raise, Launch
10. **What We're Raising** - Mandate A (Fuel the Engine, gold) + Mandate B (Cut Strategic Checks, blue)
11. **Closing** - Hero restatement

## Brand Colors

```css
--gold: #c8a44e;           /* Primary accent */
--blue: #5b7fb5;           /* Secondary accent (Mandate B) */
--black: #0a0a0a;          /* Background */
--white: #f0ede8;          /* Primary text */
```

## Talent Featured

- **Kirk (Cousins)** - Digital Media + Film & TV + Experiential
- **Tim McGraw** - Film & TV + Experiential
- **Bert (Kreischer)** - Experiential
- **Caitlin Clark** - Potential partnership
- **Josh Allen** - Potential partnership
- **Theo Vonn** - Experiential (Roast of Country Music)

## Custom Section Types

Beyond the standard template sections, this PitchApp includes:

- **Story sections** (`.section-story`) - Text-centered narrative slides
- **Talent circles** (`.talent-circles`) - Circular badges for talent names
- **Focus diagram** (`.section-focus`) - Visual pillars around center hub
- **Portfolio sections** (`.section-portfolio`) - Card grids for projects by category
- **Packaging grid** (`.section-packaging`) - 6-step numbered process
- **Mandate cards** (`.section-mandate`) - Two-color card comparison

## Local Development

```bash
open index.html
# or serve with a local server:
python3 -m http.server 8080
```

## Deploy

```bash
cd apps/shareability_v2
vercel link
vercel --prod
```

## Source

Based on SHB_20.pptx (Shareability Venture Studio investor deck, 11 slides)
