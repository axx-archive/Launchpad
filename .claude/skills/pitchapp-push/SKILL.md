# /pitchapp push (Skill)

**Purpose:** Push a deployed PitchApp URL to the Launchpad Portal, updating the mission with the live URL and setting the status to "review" so the client can preview it.

**Trigger phrases:**
- `/pitchapp push`
- `/pitchapp push <url>`
- "push this to launchpad"
- "update the mission with the URL"
- "send the link to launchpad"

---

## Process

### Step 1: Identify the Project

Determine which Launchpad project to update. Check in this order:

1. **From context:** If you just built or deployed a PitchApp and there's a `tasks/{company}/mission.md` file, read it to get the project ID.
2. **From arguments:** If the user provided a project ID, use it.
3. **Ask:** If neither, list missions and ask:
   ```bash
   node scripts/launchpad-cli.mjs missions
   ```

### Step 2: Get the PitchApp URL

Determine the URL to push. Check in this order:

1. **From arguments:** If the user provided a URL after the command.
2. **From recent deploy:** Check if a `vercel --prod` was just run — the output contains the production URL.
3. **Ask:** If neither, ask the user for the deployed URL.

The URL must start with `https://`.

### Step 3: Push to Launchpad

```bash
node scripts/launchpad-cli.mjs push <project-id> <url>
```

This will:
1. Update the project's `pitchapp_url` field
2. Set the project status to `review`
3. Update the `updated_at` timestamp

### Step 4: Confirm

Tell the user:
- URL pushed successfully
- Project status set to "review"
- The client can now see the PitchApp preview in their portal
- If the client wants changes, they'll use Scout — run `/pitchapp brief` later to pull those

---

## What This Skill Does NOT Do

- **Does not deploy the PitchApp.** Deploy with `vercel --prod` first, then push the URL.
- **Does not notify the client.** The portal shows the updated status — no manual notification needed.
- **Does not build anything.** This is a write-back operation only.

---

## Example Workflow

```
User: /pitchapp push https://acme-pitch.vercel.app

Claude: [reads tasks/acme-corp/mission.md for project ID]
  [runs push command]

  "Pushed to Launchpad:
   - Project: Series A Deck (Acme Corp)
   - URL: https://acme-pitch.vercel.app
   - Status: review

   The client can now preview their PitchApp in the portal.
   When they request changes via Scout, run /pitchapp brief to pull them."
```

### After Deploy Pattern

The most common flow is right after a `vercel --prod` deploy:

```
User: [just deployed with vercel --prod]
User: /pitchapp push

Claude: [detects the Vercel URL from recent output]
  [reads mission.md for project ID]
  [pushes automatically]

  "Pushed https://acme-pitch.vercel.app to Launchpad.
   Status set to review — the client will see it in their portal."
```
