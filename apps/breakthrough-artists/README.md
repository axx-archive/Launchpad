# The Breakthrough Playbook — PitchApp

Scroll-driven presentation of the "13 Breakthrough Artists Research" findings for Iryna Yermolova.

## Content Source

`/Users/ajhart/Desktop/Iryna-Yermolova-System-Plan/13-Breakthrough-Artists-Research.md`

## Design System

Uses Iryna Yermolova's design system:
- **Colors**: Ivory (#FAF8F5), Charcoal (#1A1A1A), Burnt Sienna (#C4785D)
- **Typography**: Playfair Display (display) + DM Sans (body)
- **Aesthetic**: Editorial Gallery — refined, warm, sophisticated

## Sections

1. **Hero** — The Breakthrough Playbook title
2. **The Whitespace** — What most artists don't do (the opportunity)
3. **Patterns** — 5 patterns that separate operators from hopefuls
4. **Channels** — High-signal channels that still punch through
5. **Playbooks** — 10 repeatable plays that generate money
6. **Case Studies** — 10 concrete artist examples
7. **Decisions** — 3 questions to answer first
8. **Site Requirements** — What the site must support for revenue
9. **90-Day Experiments** — 4 tests with pass/fail criteria
10. **Anti-Patterns** — What to avoid
11. **Summary** — 5 key takeaways
12. **Closing** — Back to top

## Local Development

```bash
cd /Users/ajhart/Desktop/PitchApp/apps/breakthrough-artists
python3 -m http.server 8080
```

Then open http://localhost:8080

## Deploy

```bash
cd /Users/ajhart/Desktop/PitchApp/apps/breakthrough-artists
vercel --prod
```

## Tech Stack

- Static HTML/CSS/JS
- GSAP 3.12.5 + ScrollTrigger (CDN)
- No build tools required
