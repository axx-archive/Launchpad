# /pitchapp pull (Skill)

**Purpose:** Pull a mission from Launchpad Portal — project details, uploaded documents, and edit briefs — to set up a local workspace for building a PitchApp.

**Trigger phrases:**
- `/pitchapp pull`
- `/pitchapp pull <project-id>`
- "pull the mission from launchpad"
- "get the project from launchpad"

---

## Process

### Step 1: List Missions

If no project ID was provided, list available missions first:

```bash
node scripts/launchpad-cli.mjs missions
```

This shows all projects with their status, company name, type, and truncated ID. Ask the user which mission to pull.

If a project ID was provided (or the user just said which company), use it directly.

### Step 2: Pull Mission Data

```bash
node scripts/launchpad-cli.mjs pull <project-id>
```

This will:
1. Fetch the project details from Supabase
2. Download all uploaded documents to `tasks/{company}/materials/`
3. Fetch any Scout edit briefs
4. Generate `tasks/{company}/mission.md` with all context
5. Save briefs to `tasks/{company}/briefs/` if any exist

### Step 3: Read the Mission File

Read the generated `tasks/{company}/mission.md` to understand the project context.

If there are uploaded documents in `tasks/{company}/materials/`, note them for the user:
- PDFs and docs contain the raw content the client wants turned into a PitchApp
- Images may be brand assets or reference materials

### Step 4: Report Back

Tell the user:
- Mission pulled successfully
- What documents were downloaded
- Whether there are edit briefs (if this is a revision)
- Suggest next steps:
  - **New build:** Run `@narrative-strategist` on the materials to extract the story
  - **Revision:** Read the briefs in `tasks/{company}/briefs/` and apply changes
  - **Quick build:** If content is clear, run `/pitchapp new {name}` to scaffold

### Step 5: If This Is a Revision

If the mission has existing edit briefs, this is a revision workflow:

1. Read all briefs from `tasks/{company}/briefs/`
2. Summarize the requested changes for the user
3. If a PitchApp already exists for this project (check `pitchapp_url` in mission.md), identify the app directory
4. Suggest applying the changes and redeploying

---

## Auto-Status Update

When a project's current status is `requested`, pulling it automatically sets the status to `in_progress`. This gives the client visibility that work has started — they'll see the status change in their portal.

If the project is already in any other status (e.g., `revision`, `review`), the status is not changed.

---

## Revision Detection

If the pulled project has an existing `pitchapp_url`, this is a **revision** — the PitchApp has already been built and deployed at least once.

When this is detected:
- Highlight that this is a revision, not a new build
- Emphasize the edit briefs (the client's requested changes)
- Point to the existing app directory for making changes
- Suggest `/pitchapp brief` as a lightweight alternative if you only need the latest briefs without re-pulling all materials

---

## Lightweight Alternative: /pitchapp brief

If you already have the mission pulled and just need the latest edit briefs (e.g., the client submitted new feedback), use `/pitchapp brief` instead. It's faster — it only fetches briefs, not the full mission + documents.

---

## What This Skill Does NOT Do

- **Does not build the PitchApp.** It only pulls the data. Building is a separate step — use `/pitchapp build`.
- **Does not modify portal data** (except auto-setting status to `in_progress` for new pickups).
- **Does not create a PitchApp scaffold.** Use `/pitchapp new` for that.

---

## Example Workflow

```
User: /pitchapp pull

Claude: [runs missions command, shows list]
  "Which mission would you like to pull?"

User: "the acme corp one"

Claude: [runs pull with project ID]
  "Pulled mission: Series A Deck (Acme Corp)
   - Status: requested
   - Type: investor pitch
   - Target audience: seed-stage VCs
   - Downloaded 3 documents: pitch-notes.pdf, financials.xlsx, team-photo.png
   - No edit briefs (new build)

   Mission file: tasks/acme-corp/mission.md

   Next step: I can run @narrative-strategist on the materials to find the story,
   or /pitchapp new acme to scaffold the app if you already know the structure."
```
