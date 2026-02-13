# /pitchapp push (Skill)

**Purpose:** Deploy a PitchApp to Vercel and push the URL to the Launchpad Portal, setting the status to "review" so the client can preview it. Handles the full deploy-and-push cycle in one step.

**Trigger phrases:**
- `/pitchapp push`
- `/pitchapp push <name>`
- "push this to launchpad"
- "deploy and push to launchpad"
- "send the link to launchpad"

---

## Process

### Step 1: Identify the Project

Determine which Launchpad project to update. Check in this order:

1. **From context:** If you just built or deployed a PitchApp and there's a `tasks/{company}/mission.md` file, read it to get the project ID or company name.
2. **From arguments:** If the user provided a name or ID, use it.
3. **Ask:** If neither, list missions and ask:
   ```bash
   node scripts/launchpad-cli.mjs missions
   ```

### Step 2: Identify the Local Directory

Find the PitchApp's local directory (must contain `index.html`). Check in this order:

1. **From arguments:** If provided after the command (e.g., `/pitchapp push apps/acme/`).
2. **From context:** If you just built a PitchApp, use that directory (e.g., `apps/{name}/`).
3. **From mission.md:** The company name maps to `apps/{company-name}/`.
4. **Ask:** If none of the above, ask the user.

### Step 2.5: Inject Analytics Script (Before Deploy)

Before deploying, ensure the analytics script tag is present in the PitchApp's `index.html`. The project ID is needed — get it from `tasks/{company}/mission.md` or the CLI.

Check if the script tag already exists. If not, add it before the closing `</body>` tag:

```html
<script src="https://launchpad.bonfire.tools/api/analytics/script.js" data-project-id="PROJECT_UUID" defer></script>
```

**Important:**
- The `data-project-id` must match the Launchpad project UUID
- The script is lightweight (< 5KB), privacy-conscious (no cookies/PII), and tracks views, scroll depth, and session duration
- Analytics appear in the "Viewer Insights" section of the project detail page

### Step 3: Deploy and Push

```bash
node scripts/launchpad-cli.mjs push <id-or-name> <local-path>
```

The CLI will:
1. Run `vercel --prod` in the directory to deploy
2. Extract the production URL from Vercel output
3. Update the project's `pitchapp_url` in the portal
4. Set the project status to `review`
5. Extract a manifest (sections, design tokens, copy) for Scout context
6. Capture desktop + mobile screenshots (if Playwright available)
7. Create a version record in `pitchapp_versions` table

### Step 4: Confirm

Tell the user:
- Deployed URL
- Project status set to "review"
- The client can now see the PitchApp preview in their portal
- If the client wants changes, they'll use Scout — run `/pitchapp brief` later to pull those

---

## Legacy Mode

If the user provides a URL instead of a directory, the CLI skips deployment and pushes the URL directly:

```bash
node scripts/launchpad-cli.mjs push <id-or-name> https://already-deployed.vercel.app apps/acme/
```

---

## Example Workflow

```
User: /pitchapp push acme

Claude: [reads tasks/acme-corp/mission.md for project context]
  [runs: node scripts/launchpad-cli.mjs push acme apps/acme/]

  "Deployed and pushed to Launchpad:
   - Project: Series A Deck (Acme Corp)
   - URL: https://acme-pitch.vercel.app
   - Status: review

   The client can now preview their PitchApp in the portal.
   When they request changes via Scout, run /pitchapp brief to pull them."
```

### From-Scratch Pattern

The full build-deploy-push cycle:

```
/pitchapp pull acme              # Pull mission from Launchpad
@narrative-strategist            # Extract the story
/pitchapp new acme               # Scaffold the PitchApp
# ... build sections ...
/pitchapp push acme              # Deploy to Vercel + push URL to Launchpad
```
