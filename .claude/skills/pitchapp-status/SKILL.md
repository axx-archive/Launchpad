# /pitchapp status (Skill)

**Purpose:** Check or update a project's status in Launchpad. Quick way to see where a project stands or move it through the pipeline.

**Trigger phrases:**
- `/pitchapp status`
- `/pitchapp status <name>`
- `/pitchapp status <name> <new-status>`
- "what's the status of the acme project?"
- "set acme to in_progress"

---

## Valid Statuses

| Status | Meaning |
|--------|---------|
| `requested` | Client submitted, waiting for pickup |
| `in_progress` | Build team is actively working on it |
| `review` | PitchApp deployed, client previewing |
| `revision` | Client requested changes via Scout |
| `live` | Final, approved, and live |
| `on_hold` | Paused (client request or internal) |

---

## Process

### Read Mode (no status argument)

Check the current status of a project.

```bash
node scripts/launchpad-cli.mjs missions
```

If a specific project was named:

1. Find the project in the missions list
2. Report: project name, company, current status, whether it has a PitchApp URL, last updated date

### Write Mode (status argument provided)

Update a project's status.

```bash
node scripts/launchpad-cli.mjs status <id-or-name> <new-status>
```

**Before updating, confirm with the user:**
- "Set {project} status from {current} to {new}?"

**After updating, report:**
- Project name and company
- Old status -> new status
- What this means for the client (e.g., "review" means the client can now preview)

---

## Identifying the Project

Check in this order:

1. **From arguments:** If the user provided a name or ID.
2. **From context:** If there's a `tasks/{company}/mission.md` in the current working context, read it for the project ID.
3. **Ask:** List missions and ask:
   ```bash
   node scripts/launchpad-cli.mjs missions
   ```

---

## What This Skill Does NOT Do

- **Does not deploy.** Use `/pitchapp push` to deploy and set status to "review" in one step.
- **Does not trigger notifications directly.** Status changes in the portal trigger notifications to the client and all project members automatically via `notifyProjectMembers()`.
- **Does not validate readiness.** Use `/pitchapp live` for pre-live checks before setting status to "live".

---

## Example Workflows

### Check status
```
User: /pitchapp status acme

Claude: [runs missions command, finds acme]

  "Acme Corp — Series A Deck
   Status: review
   PitchApp URL: https://acme-pitch.vercel.app
   Last updated: Feb 10, 2026

   The client is currently previewing this PitchApp."
```

### Update status
```
User: /pitchapp status acme revision

Claude: "Set Acme Corp from 'review' to 'revision'?"

User: "yes"

Claude: [runs status command]

  "Status updated.
   Acme Corp — Series A Deck: review → revision

   The client has requested changes. Run /pitchapp brief to pull their edit requests."
```

### Quick overview
```
User: /pitchapp status

Claude: [runs missions command, shows all projects with statuses]
```
