# Launchpad Evolution Roadmap

> Synthesized findings from 6-agent team audit (Feb 14, 2026)
> Agents: Product Lead (Creative), Product Lead (Visionary), UX/UI Developer, Design Lead, Systems Engineer, Code Reviewer

---

## Quick Stats

| Category | Critical/P0 | High/P1 | Medium/P2 | Low/P3 |
|----------|-------------|---------|-----------|--------|
| Code bugs & security | 3 | 6 | 8 | 6 |
| UX/UI issues | 5 | 8 | 11 | — |
| Design system | 3 | 4 | 4 | 3 |
| Architecture | 2 | 3 | 3 | — |
| Product evolution | 4 ideas | 6 ideas | 5 ideas | 4 ideas |

---

## Phase 1: Fix & Harden (1-3 days)

These are bugs, security issues, and broken functionality. Ship before anything else.

### 1.1 Collaborator access broken on analytics & versions
- **Source:** Code Review C1
- **Problem:** `analytics/insights/route.ts` and `versions/route.ts` check `project.user_id !== user.id` instead of `verifyProjectAccess()`. Collaborators get 403 on analytics and version history.
- **Fix:** Replace ownership check with `verifyProjectAccess(projectId)` in both routes.
- **Effort:** 15 minutes
- **Files:** `src/app/api/analytics/insights/route.ts`, `src/app/api/versions/route.ts`

### 1.2 Email PII logged in production
- **Source:** Code Review M6
- **Problem:** `sign-in/route.ts` logs email addresses via `console.log`. PII in Vercel function logs.
- **Fix:** Remove or gate behind `NODE_ENV === 'development'`.
- **Effort:** 1 minute
- **Files:** `src/app/api/auth/sign-in/route.ts`

### 1.3 Unsafe type cast and dead import
- **Source:** Code Review H5, H6
- **Problem:** `(project as any).autonomy_level` bypasses type checking. `readFileSync` imported but unused in analytics script route.
- **Fix:** Add `autonomy_level` to `Project` type. Remove dead `fs` import.
- **Effort:** 5 minutes each
- **Files:** `src/types/database.ts`, `src/app/api/projects/[id]/start-build/route.ts`, `src/app/api/analytics/script.js/route.ts`

### 1.4 In-memory rate limiting ineffective in serverless
- **Source:** Code Review C2, C3
- **Problem:** Three routes use in-memory `Map` for rate limiting. In Vercel serverless, each cold start creates a fresh Map. `setInterval` cleanup in analytics route leaks timers.
- **Fix:** (Quick) Replace `setInterval` with inline TTL check. (Proper) Move rate limiting to Supabase table or Vercel's built-in rate limiting.
- **Effort:** 30 min (quick fix), 2-3 hours (proper fix)
- **Files:** `src/app/api/auth/sign-in/route.ts`, `src/app/api/analytics/route.ts`, `src/app/api/scout/route.ts`

### 1.5 File downloads use hardcoded public bucket URL
- **Source:** Code Review M4, UX Audit P1-11
- **Problem:** `FileList.tsx` constructs public storage URLs. If bucket isn't public, downloads fail silently. Also bypasses access control.
- **Fix:** Use signed download URLs from the API.
- **Effort:** 1 hour
- **Files:** `src/components/FileList.tsx`

### 1.6 Security headers only on API routes
- **Source:** Code Review M7
- **Problem:** `X-Content-Type-Options`, `X-Frame-Options` only applied to `/api/`. HTML pages unprotected. No CSP anywhere.
- **Fix:** Apply security headers globally in `next.config.ts`. Add basic CSP.
- **Effort:** 30 min
- **Files:** `apps/portal/next.config.ts`

### 1.7 Text contrast below WCAG AA
- **Source:** Design Audit P0-1
- **Problem:** Extensive use of `text-text-muted/30`, `/40`, `/50` drops contrast below 4.5:1 on dark backgrounds. Affects filter tabs, timestamps, status labels.
- **Fix:** Establish minimum opacity of 0.7 for `text-text-muted`. Audit all usages below that threshold.
- **Effort:** 1-2 hours
- **Files:** Multiple components (DashboardClient, StatusDot, ProgressTimeline, etc.)

---

## Phase 2: UX Quick Wins (3-7 days)

High-impact UX improvements that are relatively small in scope.

### 2.1 Add loading.tsx files for route transitions
- **Source:** UX Audit P0-4
- **Problem:** No `loading.tsx` in `project/[id]/` or `dashboard/` routes. Users see blank page during server fetches. `LoadingSkeleton.tsx` exports skeletons that are never used.
- **Fix:** Create `loading.tsx` files using existing skeleton components.
- **Effort:** 30 min
- **Files:** New: `src/app/project/[id]/loading.tsx`, `src/app/dashboard/loading.tsx`

### 2.2 Add Nav to new project page
- **Source:** UX Audit P0-5
- **Problem:** `/dashboard/new` has no `<Nav>` component. Users can't access sign-out, notifications, or admin from this page.
- **Fix:** Add `<Nav sectionLabel="new mission" />`.
- **Effort:** 15 min
- **Files:** `src/app/dashboard/new/NewProjectClient.tsx`

### 2.3 Approval confirmation dialogs
- **Source:** UX Audit P0-2
- **Problem:** "Looks great, go live" and "This captures it — build it" trigger immediately with no confirmation. Accidental approval is hard to reverse.
- **Fix:** 2-step confirmation — first click changes to "confirm?" state with brief delay.
- **Effort:** 1-2 hours
- **Files:** `src/components/ApprovalAction.tsx`, `src/components/NarrativeApproval.tsx`

### 2.4 Differentiate BrandCollectionGate buttons
- **Source:** UX Audit P0-3, Code Review M5
- **Problem:** Both "start the build" and "skip for now" call the same function. User thinks they're making a choice but aren't.
- **Fix:** Pass `skipAssets: boolean` to start-build endpoint. Show different confirmation messaging.
- **Effort:** 1 hour
- **Files:** `src/components/BrandCollectionGate.tsx`, `src/app/api/projects/[id]/start-build/route.ts`

### 2.5 Faster initial pipeline polling
- **Source:** UX Audit P0-1
- **Problem:** 30-second poll interval means users can wait up to 30s after submitting a project before seeing any pipeline activity.
- **Fix:** Poll every 5s for first 2 minutes after page load, then relax to 30s. Also add a "just submitted" welcome state.
- **Effort:** 1-2 hours
- **Files:** `src/components/PipelineActivity.tsx`, `src/app/project/[id]/ProjectDetailClient.tsx`

### 2.6 Differentiate primary action buttons
- **Source:** Design Audit P1-4
- **Problem:** Approve buttons look identical to secondary actions. No filled/primary button variant exists.
- **Fix:** Create a filled accent button style for primary CTAs (approve, go live, start build).
- **Effort:** 1-2 hours
- **Files:** `src/components/ApprovalAction.tsx`, `src/components/NarrativeApproval.tsx`, `src/components/BrandCollectionGate.tsx`, `globals.css`

### 2.7 Notification failure alerts from pipeline
- **Source:** Systems Architecture #3, #4
- **Problem:** When a job fails after 3 retries, no notification is created for the user. Collaborators also miss all pipeline notifications.
- **Fix:** Add failure notification in pipeline executor. Extend pipeline notifications to project members (not just owner).
- **Effort:** 2-3 hours
- **Files:** `scripts/cron/pipeline-executor.mjs`

### 2.8 Fix silent error swallowing
- **Source:** Code Review M2
- **Problem:** 8+ components have empty `catch {}` blocks. Failures are invisible.
- **Fix:** Add `console.error` to all catch blocks. Consider lightweight error tracking.
- **Effort:** 1-2 hours
- **Files:** BrandAssetsPanel, FileList, PipelineActivity, NotificationBell, InviteForm, ShareModal, ViewerInsights, VersionHistory

### 2.9 Empty state improvements
- **Source:** UX Audit P1-6/10/13, Design Audit #7
- **Problem:** "Requested" status shows unhelpful empty preview. Viewer empty Scout chat has no context. Notification empty state has no guidance.
- **Fix:** Add contextual empty states that explain what happens next.
- **Effort:** 2-3 hours
- **Files:** `ProjectDetailClient.tsx`, `ScoutChat.tsx`, `NotificationBell.tsx`

---

## Phase 3: Real-Time & Architecture (1-2 weeks)

Foundation work that transforms the portal from polling to live.

### 3.1 Supabase Realtime subscriptions
- **Source:** Systems Architecture #1 (Critical)
- **Problem:** Zero Realtime subscriptions. Everything polled at 30s. Status changes, build completions, notifications — all delayed.
- **Implementation:**
  - Create `useRealtimeSubscription` hook
  - Subscribe to `projects` table (filtered by user's project IDs)
  - Subscribe to `pipeline_jobs` (filtered by current project)
  - Subscribe to `notifications` (filtered by user)
  - Keep 60s polling as fallback
- **Effort:** 2-3 days
- **Files:** New: `src/hooks/useRealtimeSubscription.ts`. Update: DashboardClient, PipelineActivity, NotificationBell
- **UX impact:** Transforms from "refresh and hope" to "watch it happen live"

### 3.2 Build progress granularity (Tier 1)
- **Source:** Systems Architecture #2
- **Problem:** A 15-turn build job is a black box. User sees "building... 3m elapsed" with no visibility into what's happening.
- **Implementation:**
  - Add `progress JSONB` column to `pipeline_jobs`
  - Pipeline executor updates progress on each turn: `{ turn: 3, max_turns: 15, last_action: "Writing css/style.css" }`
  - PipelineActivity renders progress bar + current action
- **Effort:** 1-2 days (migration + executor change + UI)
- **UX impact:** Eliminates "is it stuck?" anxiety

### 3.3 Queue position indicator
- **Source:** Systems Architecture #8
- **Problem:** When builds are queued (max 3 concurrent), users see "queued" with no position or estimated wait.
- **Implementation:** Extend `/api/projects/[id]/pipeline` response with queue metadata. Show "Your build is #2 in queue" in PipelineActivity.
- **Effort:** 1 day

### 3.4 Error recovery UX
- **Source:** Systems Architecture #4
- **Problem:** Failed builds are a dead end. No retry button, no escalation path.
- **Implementation:** Add retry endpoint `POST /api/projects/[id]/pipeline/retry`. Add retry button to PipelineActivity for failed jobs. Auto-escalate persistent failures to admins.
- **Effort:** 2 days

### 3.5 Visual pipeline flow
- **Source:** Systems Architecture #5
- **Problem:** Pipeline stages shown as flat list. No visual DAG connecting the stages.
- **Implementation:** New `PipelineFlow` component showing: `[Pull] → [Narrative] → [Approval] ← you are here → [Build] → [Review] → [Deploy]`. Each node clickable for details.
- **Effort:** 2-3 days

---

## Phase 4: Design Elevation (1-2 weeks)

Upgrade from "developer dashboard" to "Creative Command Center."

### 4.1 Typography rebalance — more Cormorant Garamond
- **Source:** Design Audit #10.1
- **Problem:** The display serif font (Cormorant Garamond) only appears in project names. 80%+ of text is monospace. The portal reads "IDE" not "creative agency."
- **Fix:** Use Cormorant for page titles ("Mission Control"), status announcements ("Your Story Arc"), Scout greeting, empty state messaging. Reserve mono for data, labels, and terminal elements.
- **Effort:** 1-2 days
- **Files:** DashboardClient, ProjectDetailClient, ScoutChat, NarrativeApproval, empty states

### 4.2 In-progress card and preview states
- **Source:** Design Audit #2, #7
- **Problem:** Empty card header shows a faint star icon. In-build preview is an empty 50vh div with two lines of text.
- **Fix:** Animated gradient pulse on card headers for "in-progress" projects. A richer "being built" visualization in the preview panel (building lines, block assembly, or terminal output animation).
- **Effort:** 1-2 days

### 4.3 Pipeline milestone celebrations
- **Source:** Design Audit #10.2
- **Problem:** Stage transitions are just status dot color changes. The LaunchSequence sets a high bar for theatrical moments, but no other milestone gets similar treatment.
- **Fix:** Micro-celebrations at key moments:
  - Narrative approved → ember particles or warm pulse
  - PitchApp deployed → URL typewriter reveal
  - Going live → glow burst similar to launch
- **Effort:** 2-3 days

### 4.4 Scout suggested prompts redesign
- **Source:** Design Audit #11
- **Problem:** Suggested prompts look like filter pills. They're the primary way new users start interacting with Scout.
- **Fix:** Style as rounded bubbles with accent glow on hover. Slightly larger, more inviting.
- **Effort:** 2-3 hours

### 4.5 Terminal-themed upload progress
- **Source:** Design Audit #8
- **Fix:** Replace thin gradient progress bar with `[████████░░░░] 67%` block character pattern. Fits the $ prompt aesthetic.
- **Effort:** 1-2 hours

### 4.6 StatusDot sizing and emphasis
- **Source:** Design Audit P0-2, UX Audit observation
- **Problem:** 6px dots are hard to spot on dark backgrounds.
- **Fix:** Increase to 8-10px. Add text color matching to status labels.
- **Effort:** 30 min

---

## Phase 5: Product Evolution (2-4 weeks per initiative)

New capabilities that change the product's value proposition.

### 5.1 Research Agent Layer (P0 — Ship First)
- **Source:** Both Product Leads (unanimous #1 priority)
- **Concept:** A pre-narrative `auto-research` job that deploys Opus 4.6 research agents to investigate the client's market — TAM, competitors, funding landscape, verifiable metrics, compelling analogies.
- **Why it matters:** Transforms output from "pretty presentation of what the client said" to "presentation that's smarter than the client." This is the single biggest differentiator.
- **Architecture:** New job type in pipeline-executor. Tools: `web_search`, `fetch_url`, `verify_claim`, `summarize_source`. Output: `tasks/{name}/research.md` consumed by narrative step. Pipeline: `auto-pull → auto-research → auto-narrative → ...`
- **Cost:** ~$15-25/build in Opus tokens. Fits within $100/build cap.
- **Market unlock:** Fundraising (Seed-Series B), M&A advisory, management consulting, real estate development.
- **Effort:** 2-3 weeks

### 5.2 Narrative Confidence Scoring
- **Source:** Creative Product Lead
- **Concept:** After narrative generation, auto-score confidence (specificity, evidence quality, emotional arc strength). If confidence < threshold, pause pipeline and surface concerns.
- **Why:** Prevents building on weak foundations. Almost free to implement — add a self-assessment turn to the existing narrative loop.
- **Effort:** 2-3 days

### 5.3 Brand DNA Extraction
- **Source:** Creative Product Lead
- **Concept:** When brand assets are uploaded (logos, brand guides), auto-extract colors, fonts, and style direction using Claude's vision capabilities. Pre-populate build parameters.
- **Why:** Makes the brand collection phase smart, not passive. Reduces manual brand interpretation errors.
- **Effort:** 1 week

### 5.4 Build Theater ("Domino's Pizza Tracker")
- **Source:** Creative Product Lead
- **Concept:** Real-time visualization of the AI team working. Show which "persona" is active (narrative strategist writing, code reviewer checking, animation specialist polishing). Terminal-style live log of actions.
- **Why:** Transforms wait time into entertainment. Builds trust through transparency. Makes the autonomous nature tangible.
- **Dependencies:** Requires 3.1 (Realtime) and 3.2 (build progress granularity).
- **Effort:** 1-2 weeks

### 5.5 Agency Credits
- **Source:** Creative Product Lead
- **Concept:** "Making of" summary showing all AI work: research queries run, narrative iterations, review rounds, issues found and fixed, total tokens consumed. Accessible from project detail.
- **Why:** Transparency builds trust. Data already exists in `automation_log`. Nearly free to implement.
- **Effort:** 2-3 days

### 5.6 One-Pagers & Email Sequences
- **Source:** Visionary Product Lead (adjacent products)
- **Concept:** Same narrative spine, multiple output formats. One-pager PDF + investor email sequences auto-generated alongside the PitchApp.
- **Why:** 3x output per engagement. Every fundraise needs a one-pager alongside the deck.
- **Effort:** 1-2 weeks per format

### 5.7 Post-Deployment Analytics Feedback Loop
- **Source:** Visionary Product Lead
- **Concept:** Track scroll depth, dwell time, bounce rate on deployed PitchApps. Feed engagement data back into narrative strategist: "Sections over 400 words get skipped 40% more."
- **Why:** The quality loop that makes every build better than the last. This is the long-term flywheel.
- **Dependencies:** Requires deployed volume to generate meaningful data.
- **Effort:** 2-3 weeks

---

## Phase 6: Platform & Infrastructure

### 6.1 Test suite foundation
- **Source:** Code Review H2
- **Priority:** High — no tests exist anywhere
- **Start with:** Integration tests for `verifyProjectAccess()`, invite flow, approval state machine, Scout message handling.
- **Effort:** 1 week for foundation

### 6.2 `listUsers()` scaling fix
- **Source:** Code Review H1
- **Problem:** Fetches ALL auth users to find one by email.
- **Fix:** Query `user_profiles` table by email instead.
- **Effort:** 30 min

### 6.3 Proper rate limiting
- **Source:** Code Review C2
- **Fix:** Move to Supabase table with TTL, or Vercel's built-in rate limiting.
- **Effort:** 3-4 hours

### 6.4 Design tokens formalization
- **Source:** Design Audit #12
- **Fix:** Add missing tokens (type scale xl/2xl/3xl, transitions, widths). Create component playground.
- **Effort:** 1 day

---

## Recommended Execution Order

```
Week 1:  Phase 1 (all fixes) + Phase 2.1-2.4 (quick UX wins)
Week 2:  Phase 2.5-2.9 (remaining UX) + Phase 3.1 (Realtime — start)
Week 3:  Phase 3.1 (finish) + Phase 3.2-3.3 (progress + queue)
Week 4:  Phase 3.4-3.5 (error recovery + pipeline flow) + Phase 4.1-4.2
Week 5:  Phase 4.3-4.6 (design polish) + Phase 5.2 + 5.5 (confidence + credits)
Week 6+: Phase 5.1 (research agents) — the big differentiator
Week 8+: Phase 5.3-5.4 (brand DNA + build theater)
Week 10+: Phase 5.6-5.7 (adjacent products + analytics loop)
```

---

## Key Strategic Insights

### The Moat (from Visionary Product Lead)
The defensibility isn't the AI — it's the **loop**: research → narrative → create → review → fix → deploy → measure → learn. Every build expands the pattern library (CONVENTIONS.md). Every review calibrates the quality criteria. Every client revision teaches the system what matters. Competitors can't buy this — they have to earn it one engagement at a time.

### The Positioning (from both Product Leads)
> "Launchpad is your AI creative team. Upload your materials. We handle everything. You approve the story and request changes — like you would with a human agency, but in hours instead of weeks."

Kill the builder interface. Amplify the reviewer interface. Scout is the interface. The dashboard is the status board.

### The Design Direction (from Design Lead)
**"Creative Command Center"** — not choosing between terminal and premium, but leveraging the tension. You're a creative director commanding an autonomous creative team from a sophisticated console. More Minority Report, less VS Code.

### The Pricing Model (from Visionary)
- Pro: $499/month (2 builds, unlimited revisions) — 68% gross margin
- Agency: $1,999/month (10 builds + research agents)
- Enterprise: Custom $5K-15K/month
- Pay-as-you-go: $149/build

### Economics Per Build
- Research (proposed): ~$15-25
- Narrative: ~$5-10
- Copy: ~$3-5
- HTML Build: ~$10-20
- Review: ~$20-30
- Total: ~$50-90/build
- Revision: ~$7-17/cycle
