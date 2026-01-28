# PitchApp Workspace

A multi-app workspace for scroll-driven, GSAP-animated investor pitch decks. Each PitchApp is a standalone static site (HTML + CSS + JS) deployed independently to Vercel.

## Current PitchApps

| App | Status | Deploy URL | Description |
|-----|--------|-----------|-------------|
| [ONIN](apps/onin/) | Live | [pitch-app-eight.vercel.app](https://pitch-app-eight.vercel.app) | One Night in Nashville -- Country music entertainment experience |
| [Shareability](apps/shareability/) | Scaffold | Not yet deployed | Scaffolded from template, awaiting content |

## Folder Structure

```
PitchApp/
├── apps/                         # deployable PitchApps
│   ├── onin/                     # ONIN (live)
│   └── shareability/             # Shareability (scaffold)
├── templates/
│   └── pitchapp-starter/         # starter template for new apps
├── docs/
│   └── CONVENTIONS.md            # full playbook
├── sources/                      # source files (.pptx, .psd) -- git-ignored
│   ├── onin/
│   └── shareability/
├── tasks/                        # planning artifacts
├── CLAUDE.md                     # workspace conventions for Claude Code
└── README.md                     # this file
```

## How to Add a New PitchApp

1. **Copy the template:**
   ```bash
   cp -r templates/pitchapp-starter/ apps/{your-app-name}/
   ```

2. **Customize the brand:**
   - Open `apps/{your-app-name}/css/style.css`
   - Update the `:root` CSS variables with your brand colors and fonts
   - Update the loader wordmark and nav logo text in `index.html`

3. **Add content:**
   - Replace placeholder text in each section
   - Add images to `apps/{your-app-name}/images/`
   - Delete any section types you do not need

4. **Test locally:**
   ```bash
   open apps/{your-app-name}/index.html
   # or
   cd apps/{your-app-name} && python3 -m http.server 8080
   ```

5. **Deploy to Vercel:**
   ```bash
   cd apps/{your-app-name}
   vercel link    # create a new Vercel project
   vercel --prod  # deploy to production
   ```

6. **Update the README** in `apps/{your-app-name}/README.md` with the deploy URL and brand details.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** -- Workspace conventions for Claude Code sessions
- **[docs/CONVENTIONS.md](docs/CONVENTIONS.md)** -- Full playbook: section types, CSS architecture, animation conventions, deployment checklist

## Tech Stack

- **HTML/CSS/JS** -- vanilla, no build tools or frameworks
- **GSAP 3.12.5 + ScrollTrigger** -- scroll-driven animations
- **Google Fonts** -- Cormorant Garamond + DM Sans (defaults, customizable per app)
- **Vercel** -- static site hosting, one project per PitchApp
