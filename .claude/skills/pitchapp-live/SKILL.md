# /pitchapp live (Skill)

**Purpose:** Final step in the pipeline — verify a PitchApp is production-ready and mark it as live. Runs pre-live checks before committing.

**Trigger phrases:**
- `/pitchapp live`
- `/pitchapp live <name>`
- "mark this as live"
- "go live with acme"
- "ship it"

---

## Process

### Step 1: Identify the Project

Determine which project to mark live. Check in this order:

1. **From arguments:** If the user provided a name or ID.
2. **From context:** If there's a `tasks/{company}/mission.md`, read it for the project ID.
3. **Ask:** List missions and ask:
   ```bash
   node scripts/launchpad-cli.mjs missions
   ```
   Look for missions with status `review` — those are candidates for going live.

### Step 2: Pre-Live Checks

Run these checks before marking live. Report each as pass/fail:

#### 2a. Deployed URL responds
```bash
curl -s -o /dev/null -w "%{http_code}" <pitchapp_url>
```
- Must return 200
- If URL is missing or returns error, STOP — deploy first with `/pitchapp push`

#### 2b. OG meta tags present
Read `apps/{name}/index.html` and verify:
- `<title>` is set (not placeholder)
- `og:title` meta tag exists
- `og:description` meta tag exists
- `og:type` meta tag exists
- `twitter:card` meta tag exists

These control how the link looks when shared. Missing tags = unprofessional link preview.

#### 2c. No console errors (manual)
Remind the user to check:
- Open the deployed URL in a browser
- Check the console for JavaScript errors
- Verify scroll animations work end-to-end

#### 2d. Responsive spot-check
If Playwright is available, capture a quick mobile screenshot:
```bash
npx playwright screenshot --viewport-size="390,844" --full-page <pitchapp_url> /tmp/mobile-check.png
```
Review the screenshot for obvious mobile issues.

### Step 3: Report Check Results

Present a checklist:

```
Pre-live checks for: {project name}

[PASS] Deployed URL responds (200)
[PASS] og:title — "Acme Corp — Series A"
[PASS] og:description — "The future of widget manufacturing"
[PASS] og:type — "website"
[PASS] twitter:card — "summary"
[FAIL] <title> still says "PitchApp Starter" — update needed

1 issue found. Fix before going live?
```

If all checks pass, proceed to Step 4.
If any fail, list fixes and ask if the user wants to fix them first or go live anyway.

### Step 4: Mark as Live

```bash
node scripts/launchpad-cli.mjs status <id-or-name> live
```

### Step 5: Confirm

Tell the user:
- Project is now live
- The live URL
- The client will see the final status in their portal
- Suggest sharing the link (paste into Messages/Slack to verify OG preview)

---

## What This Skill Does NOT Do

- **Does not deploy.** If the URL is missing or stale, use `/pitchapp push` first.
- **Does not fix issues.** It reports them — the user decides what to fix.
- **Does not notify the client.** Status change triggers portal notification (once notification system is built).

---

## Example Workflow

```
User: /pitchapp live acme

Claude: [reads mission.md, gets project context]
  [runs pre-live checks]

  "Pre-live checks for: Series A Deck (Acme Corp)

   [PASS] URL responds: https://acme-pitch.vercel.app (200)
   [PASS] og:title: 'Acme Corp — Reinventing Widgets'
   [PASS] og:description: 'Series A deck for Acme Corp'
   [PASS] og:type: 'website'
   [PASS] twitter:card: 'summary'
   [PASS] <title>: 'Acme Corp — Reinventing Widgets'

   All checks passed. Mark as live?"

User: "yes"

Claude: [runs status command to set live]

  "Acme Corp is now live.
   URL: https://acme-pitch.vercel.app
   Status: live

   Share the link — paste it into Messages or Slack to verify the preview card looks right."
```

### Full Pipeline (final steps)

```
/pitchapp review                 # Quality check
# ... fix any issues ...
/pitchapp push acme              # Deploy final version
/pitchapp live acme              # Pre-live checks + mark live
```
