# /pitchapp build (Skill)

**Purpose:** Build a PitchApp from approved copy. Wraps the `@pitchapp-developer` agent to turn `pitchapp-copy.md` into a working PitchApp.

**Trigger phrases:**
- `/pitchapp build`
- `/pitchapp build <name>`
- "build the pitchapp"
- "build it"

---

## Inputs

| Input | Required | How to Determine |
|-------|----------|------------------|
| Company/project name | Yes | From argument, recent `/pitchapp pull`, or ask user |
| Copy file | Yes | `tasks/{company}/pitchapp-copy.md` — must exist |
| App directory | Yes | `apps/{company}/` — must exist (from `/pitchapp new`) |

---

## Process

### Step 1: Identify the Project

Find the `tasks/{company}/` directory. Check in this order:

1. **From arguments:** If the user provided a name (e.g., `/pitchapp build acme`).
2. **From context:** If you just ran `/pitchapp pull` or `/pitchapp new`, use that company name.
3. **Ask:** List directories in `tasks/` and ask which project to build.

Read `tasks/{company}/mission.md` for project context (type, audience, brand notes).

### Step 2: Check Prerequisites

Verify these exist before proceeding:

1. **`tasks/{company}/pitchapp-copy.md`** — the approved copy. If missing:
   - Check if `tasks/{company}/narrative.md` exists (story extracted but copy not written yet)
   - Suggest running `@copywriter` on the narrative to generate copy
   - If no narrative either, suggest starting with `@narrative-strategist`

2. **`apps/{company}/`** — the scaffolded app directory. If missing:
   - Suggest running `/pitchapp new {name}` to scaffold first

3. **User approval** — confirm the copy is approved before building:
   - "The copy at `tasks/{company}/pitchapp-copy.md` is ready. Should I build the PitchApp from this?"

### Step 3: Invoke @pitchapp-developer

Invoke the `@pitchapp-developer` agent with:
- The full copy file (`tasks/{company}/pitchapp-copy.md`)
- The target directory (`apps/{company}/`)
- Mission context from `tasks/{company}/mission.md` (type, audience, brand)
- Reference to CLAUDE.md and CONVENTIONS.md for build standards

The developer agent handles:
- Section HTML structure
- CSS theming and responsive design
- GSAP animations and ScrollTrigger setup
- Image placement (if applicable)
- Mobile optimization

### Step 4: Post-Build

After the build completes:

1. **Verify locally:**
   ```bash
   cd apps/{name} && python3 -m http.server 8080
   ```
   Check for console errors, scroll behavior, and responsive layout.

2. **Suggest next steps:**
   - Run `/pitchapp review` for comprehensive quality check
   - Run `/pitchapp review --quick` for a fast screenshot check (good for revisions)
   - When ready, run `/pitchapp push {name}` to deploy and notify the client

---

## What This Skill Does NOT Do

- **Does not write copy.** The copy must already exist in `pitchapp-copy.md`. Use `@copywriter` for that.
- **Does not scaffold the app.** Use `/pitchapp new` to create the directory from template.
- **Does not deploy.** Use `/pitchapp push` to deploy to Vercel and push to Launchpad.
- **Does not extract the narrative.** Use `@narrative-strategist` for story extraction.

---

## Example Workflow

```
User: /pitchapp build acme

Claude: [reads tasks/acme-corp/mission.md for context]
  [reads tasks/acme-corp/pitchapp-copy.md]
  [confirms apps/acme/ exists]

  "Ready to build the PitchApp for Acme Corp (Series A Deck).
   Copy: tasks/acme-corp/pitchapp-copy.md (8 sections, ~1200 words)
   Target: apps/acme/

   Should I proceed with the build?"

User: "yes"

Claude: [invokes @pitchapp-developer with copy + context]
  [builds all sections, animations, responsive styles]

  "PitchApp built at apps/acme/. Test locally:
     cd apps/acme && python3 -m http.server 8080

   Next steps:
   - /pitchapp review — full quality check
   - /pitchapp push acme — deploy to Vercel + notify client"
```

### Full Pipeline Pattern

```
/pitchapp pull acme              # Pull mission from Launchpad
@narrative-strategist            # Extract the story → narrative.md
@copywriter                      # Write the copy → pitchapp-copy.md
/pitchapp new acme               # Scaffold the PitchApp
/pitchapp build acme             # Build from copy
/pitchapp review                 # Quality check
/pitchapp push acme              # Deploy + push to Launchpad
```
