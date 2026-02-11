# bonfire labs PitchApp — Venture Studio

## Status
Live

## Brand Identity
| Element | Value |
|---------|-------|
| Primary Accent | #e07a4f (warm ember) |
| Accent Light | #f09870 |
| Accent Dim | #a85a38 |
| Background | #08080a |
| Text | #eeeae4 |
| Text Muted | #948f86 |
| Display Font | Cormorant Garamond |
| Body Font | DM Sans |
| Mono Font | JetBrains Mono |

## Content Source
Original content — no PowerPoint source.

## Sections
1. Hero — abstract grid background with cursor-following glow, "bonfire" wordmark
2. Manifesto — centered text with vision statement + supporting paragraph
3. Products — OS-style dashboard grid with active (Bullseye, Horizon) and coming-soon (Moonshot, Mirage, Launchpad) cards
4. Closing — title echo with grid background + back to top

## Product Cards
| Product | Status | Gradient |
|---------|--------|----------|
| Bullseye | Live | #d45a3a → #e8945c |
| Horizon | Live | #4a6fa5 → #7b9fcc |
| Moonshot | Coming Soon | #6b6b8a → #9494b0 |
| Mirage | Coming Soon | #4a8a7a → #7abaa8 |
| Launchpad | Coming Soon | #c07840 → #e0a870 |
| Telescope | Coming Soon | #5a7a9a → #8aaac8 |

## Local Development
```
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy
```
cd apps/bonfire
vercel link
vercel --prod
```
