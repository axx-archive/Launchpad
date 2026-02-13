# /pitchapp review (Skill)

**Purpose:** Capture screenshots and create a formal agent team to comprehensively review a PitchApp from every angle — product, copy, design, code.

**Trigger phrases:**
- `/pitchapp review`
- `/pitchapp review <app-name>`
- "review the pitchapp"
- "run the pitchapp review team"

---

## COMPLIANCE GATE

This skill MUST use the real agent team infrastructure (`/agent-team` protocol). Do NOT use independent `Task(...)` subagents without `team_name`. The review team needs shared state, coordinated tasks, and inter-agent messaging.

If you catch yourself spawning fire-and-forget Task agents, STOP. Go back to Step 1.

---

## Review Modes

| Mode | When to Use | What Happens |
|------|-------------|--------------|
| **Full review** (default for new builds) | New PitchApp, first build, major overhaul | 5-person agent team: product lead, copywriter, copy critic, UX/UI expert, code reviewer |
| **Quick review** (default for revisions) | Minor revisions, copy tweaks, single-section changes | Screenshot capture + `@pitchapp-visual-qa` only — fast visual check, no full team |

**Auto-detection:** If the project has an existing `pitchapp_url` (revision), default to quick review. If it's a fresh build, default to full review. The user can override either way.

**User override:**
- `/pitchapp review` — auto-detect mode
- `/pitchapp review --full` or `/pitchapp review full` — force full team review
- `/pitchapp review --quick` or `/pitchapp review quick` — force quick review

---

## Inputs

| Input | Required | How to Determine |
|-------|----------|------------------|
| App directory | Yes | Ask user or infer from context (e.g., `apps/bonfire/`) |
| Review mode | Optional | Auto-detected from revision status, or user specifies `--quick` / `--full` |
| Target audience | Optional | Helps product lead calibrate (e.g., "Nashville entertainment CEO") |
| Specific concerns | Optional | Focus areas the user wants extra attention on |

---

## Process

### Step 0: Identify the App and Review Mode

Determine which PitchApp to review. If not obvious from context, ask:
- Which app? (e.g., `apps/bonfire/`)
- Who's the target audience?
- Any specific concerns?

**Detect review mode:**
1. Check if the user specified `--quick` or `--full`
2. If not specified, check if the project has an existing `pitchapp_url` (read `tasks/{company}/mission.md`)
   - Has URL → default to **quick review** (this is a revision)
   - No URL → default to **full review** (this is a new build)
3. Tell the user which mode was selected and let them override

**If quick review:** Skip to the Quick Review Process section below.
**If full review:** Continue with Step 1.

### Step 1: Capture Screenshots

Before any review, capture screenshots at three breakpoints using Playwright. This is MANDATORY — visual review without screenshots is code review, not visual QA.

```bash
# Start local server
cd apps/{name} && python3 -m http.server 8080 &
SERVER_PID=$!

# Create screenshots directory
mkdir -p screenshots

# Capture at three breakpoints
npx playwright screenshot --viewport-size="1440,900" --full-page http://localhost:8080 screenshots/desktop-full.png
npx playwright screenshot --viewport-size="390,844" --full-page http://localhost:8080 screenshots/mobile-full.png
npx playwright screenshot --viewport-size="768,1024" --full-page http://localhost:8080 screenshots/tablet-full.png

# Kill server
kill $SERVER_PID
```

Verify all three screenshots were captured before proceeding.

### Step 2: Read the App Files

Read the full app to build context for the team prompts:
- `apps/{name}/index.html`
- `apps/{name}/css/style.css`
- `apps/{name}/js/app.js`
- `apps/{name}/README.md`

### Step 3: Create the Team

Use the real agent team infrastructure:

```
TeamCreate(team_name="pitchapp-review-{name}", description="Comprehensive review of {name} PitchApp")
```

### Step 4: Create Tasks

Create one task per reviewer using `TaskCreate`:

1. **Product Lead Review** — Is this CEO-friendly? Would the target audience get it immediately? Does the narrative flow make sense? Rate overall impression and call out what would confuse a non-technical viewer.

2. **Copywriter Review** — Does the language feel human, confident, on-brand? Flag anything that sounds corporate, generic, or AI-generated. Suggest specific rewrites for weak lines.

3. **Copy Critic Review** — Be adversarial. Find every phrase that sounds like AI wrote it. Flag jargon, hedging, filler words. Grade each line as keep/rewrite/cut. The bar: would a smart, busy person read this and think a human wrote it?

4. **UX/UI Expert Review** — Evaluate flow, visual hierarchy, mobile experience, card interactions, spacing, responsive behavior. Reference the screenshots for visual assessment. Score: overall flow, mobile readiness, visual polish.

5. **Code Reviewer Review** — Check for GSAP bugs (see CLAUDE.md gotchas table), FOUC issues, ScrollTrigger/ScrollToPlugin registration, mobile dimension handling, CSS conflicts, terminal overflow, performance. Classify as P0 (must fix), P1 (should fix), P2 (nice to fix).

Set up dependencies: all 5 review tasks are independent (no blockedBy).

### Step 5: Spawn Teammates

Spawn 5 teammates using the Task tool with BOTH `team_name` and `name` parameters, and `model: "opus"`:

```
Task(
  subagent_type="general-purpose",
  team_name="pitchapp-review-{name}",
  name="product-lead",
  model="opus",
  prompt="[detailed prompt with app content, screenshots, audience context]"
)
```

Teammate names:
- `product-lead`
- `copywriter`
- `copy-critic`
- `ux-ui-expert`
- `code-reviewer`

Each teammate prompt MUST include:
- The full HTML content of the app
- The full CSS content
- The full JS content
- Path to screenshots for visual reviewers
- Target audience context
- Reference to CLAUDE.md and CONVENTIONS.md for standards
- Their specific review task description and scoring criteria

### Step 6: Assign Tasks

Use `TaskUpdate` with `owner` to assign each task to the corresponding teammate.

### Step 7: Monitor and Collect Results

- Monitor via `TaskList` and incoming messages
- As teammates complete, acknowledge findings
- Do NOT start fixing anything yet — collect all feedback first

### Step 8: Synthesize Findings

After all 5 reviews are in, present a unified summary to the user:

```markdown
# PitchApp Review: {name}

## Overall Assessment
[Ready / Needs Work / Major Issues]

## Code Bugs (Fix First)
### P0 — Must Fix
- [ ] [Bug] — [Location] — [Fix]

### P1 — Should Fix
- [ ] [Bug] — [Location] — [Fix]

## Copy Issues
### Rewrite
- [Line] → [Suggested rewrite]

### Cut
- [Line that should be removed]

## UX/Design Issues
- [Issue] — [Location] — [Recommendation]

## Product Concerns
- [Concern] — [Recommendation]

## What's Working Well
- [Positive finding]

## Recommended Fix Order
1. Code bugs (P0 first)
2. UX/layout issues
3. Copy rewrites
4. Polish and deploy
```

### Step 9: Shut Down Team

After presenting synthesis:
1. Send `shutdown_request` to each teammate via `SendMessage`
2. Wait for confirmations
3. Call `TeamDelete` to clean up team resources

---

## Teammate Prompt Templates

### Product Lead

```
You are a product lead reviewing a PitchApp. Your job is to evaluate this from the perspective of [target audience description].

Key questions:
- Would someone non-technical immediately understand what this company/product does?
- Does the narrative flow make sense? Is there a clear arc?
- What would confuse someone seeing this for the first time?
- Is this something the target audience would feel confident sharing with others?
- Rate: Overall impression (1-10), CEO-friendly score (1-10)

[App content follows...]
```

### Copy Critic

```
You are a copy critic who HATES language that sounds like AI wrote it. Your job is to find and flag every phrase that feels generic, corporate, or machine-generated.

For EVERY line of visible text in this PitchApp, grade it:
- KEEP — sounds human, confident, specific
- REWRITE — the idea is right but the language is wrong (suggest alternative)
- CUT — adds nothing, filler, or actively hurts credibility

Be ruthless. The bar: would a smart, busy [target audience] read this and think a human wrote it?

Flag these patterns especially:
- "Leveraging" / "Empowering" / "Revolutionizing"
- Passive voice hedging
- Generic claims without specifics
- Anything that could describe any company

[App content follows...]
```

### Code Reviewer

```
You are a senior frontend engineer reviewing a PitchApp built with GSAP 3.12 + ScrollTrigger.

Check for these known bugs (from CLAUDE.md):
- ScrollToPlugin registered? Must be in gsap.registerPlugin() call
- gsap.from() FOUC? Should use gsap.to() with CSS defaults
- scroll-behavior: smooth in CSS? Conflicts with GSAP
- Unscoped selectors hitting multiple sections?
- Mobile: stale offsetWidth/Height captured at init?
- Terminal: auto-scroll inside typeChar loop?
- Terminal: pre-wrap on mobile?

Also check:
- Console errors
- Animation performance (too many simultaneous animations?)
- Responsive CSS (breakpoints, grid collapse)
- Accessibility (skip links, aria labels, contrast)

Classify each finding: P0 (breaks functionality), P1 (degrades experience), P2 (polish)

[App content follows...]
```

---

## Quick Review Process

For minor revisions — skip the full 5-person team and do a fast visual check.

### Quick Step 1: Capture Screenshots

Same as full review Step 1 — capture desktop, mobile, and tablet screenshots.

### Quick Step 2: Read App Files

Read the HTML, CSS, and JS to understand what changed.

### Quick Step 3: Invoke @pitchapp-visual-qa

Spawn a single `@pitchapp-visual-qa` agent (using the Task tool) with:
- The three screenshots
- The HTML/CSS/JS content
- Context about what changed (from the edit briefs if available)
- Reference to CLAUDE.md conventions

This agent reviews:
- Visual consistency and spacing
- Responsive behavior across breakpoints
- Animation smoothness (from code review)
- Any obvious regressions from the changes

### Quick Step 4: Report

Present the visual QA findings directly to the user:
- Issues found (if any)
- Screenshots reviewed
- Recommendation: ready to push, or needs fixes

No team creation, no multi-agent coordination. Fast and lightweight.

---

## Self-Check

Before proceeding, verify:
- [ ] Screenshots captured at 3 breakpoints (desktop, mobile, tablet)
- [ ] Team created with `TeamCreate` (NOT independent Task agents)
- [ ] 5 tasks created with `TaskCreate`
- [ ] 5 teammates spawned with `team_name` parameter
- [ ] Tasks assigned with `TaskUpdate(owner=...)`
- [ ] Using `SendMessage` for coordination
- [ ] Will synthesize all findings before presenting
- [ ] Will shut down team gracefully after synthesis
