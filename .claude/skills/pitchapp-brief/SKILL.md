# /pitchapp brief (Skill)

**Purpose:** Pull the latest Scout edit briefs from Launchpad for a project, save them locally, and set up the workspace for a revision build.

**Trigger phrases:**
- `/pitchapp brief`
- `/pitchapp brief <project-id>`
- "pull the edit briefs"
- "get the revision requests"
- "what changes did the client request?"

---

## Process

### Step 1: Identify the Project

Determine which project to pull briefs for. Check in this order:

1. **From context:** If there's a `tasks/{company}/mission.md` in the current working context, read it for the project ID.
2. **From arguments:** If the user provided a project ID.
3. **Ask:** List missions and ask:
   ```bash
   node scripts/launchpad-cli.mjs missions
   ```
   Look for missions with status `revision` — those have pending briefs.

### Step 2: Pull Briefs

```bash
node scripts/launchpad-cli.mjs briefs <project-id>
```

This will:
1. Fetch all Scout-generated edit briefs for the project
2. Save each brief to `tasks/{company}/briefs/brief-{n}.md`
3. Show a preview of each brief

### Step 3: Read and Summarize

Read the brief files and present a clear summary to the user:

1. **Number of briefs** and when they were submitted
2. **Requested changes** — bullet-point summary of what the client wants
3. **Scope assessment** — are these copy tweaks, structural changes, or both?

### Step 4: Set Up Revision Context

Help the user prepare for the revision:

1. **Identify the PitchApp directory** — check `mission.md` for the PitchApp URL, cross-reference with `apps/` directories
2. **Read the current PitchApp files** that need changes
3. **Present a revision plan** — which files to edit, what changes to make

### Step 5: After Revision

Once the user has made changes and redeployed:
- Suggest running `/pitchapp push` to update the URL (if it changed) and set status back to `review`
- Or run:
  ```bash
  node scripts/launchpad-cli.mjs status <project-id> review
  ```
  to just update the status (URL stays the same).

---

## What This Skill Does NOT Do

- **Does not apply changes automatically.** It pulls the briefs — the user (or build pipeline) applies them.
- **Does not communicate with the client.** Scout handles client communication in the portal.
- **Does not redeploy.** The user redeploys after making changes.

---

## Example Workflow

```
User: /pitchapp brief

Claude: [reads tasks/acme-corp/mission.md for project ID]
  [runs briefs command]

  "2 edit briefs for Series A Deck (Acme Corp):

   Brief 1 (Feb 10):
   - Warm up the hero section copy — feels too corporate
   - Update Sarah Chen's title from VP Engineering to CTO

   Brief 2 (Feb 12):
   - Add a competitive landscape section after the traction slide
   - Swap the team photo for the one in the new materials

   The PitchApp is at apps/acme/. I can read the current files
   and start applying these changes."

User: "go ahead"

Claude: [reads apps/acme/ files, applies changes, deploys]
  [runs /pitchapp push to update status]
```

### Revision Pipeline Pattern

For a complete revision cycle:

```
/pitchapp brief          # Pull what the client wants changed
# ... make changes ...
vercel --prod            # Redeploy
/pitchapp push           # Push updated URL + set to review
```
