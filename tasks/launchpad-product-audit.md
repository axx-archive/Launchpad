# Launchpad Product Audit — Unified Report

**Date:** 2026-02-13
**Auditors:** Technical Lead, Creative Lead/Visionary, UX/UI Designer, Systems Engineer
**Model:** Claude Opus 4.6 (all agents)

---

## Executive Summary

Launchpad is a genuinely differentiated product in an empty niche — **bespoke scroll-driven presentations with AI-assisted revision, delivered as a URL.** The output quality proves the thesis (Shareability is agency-grade work). Scout is the product's secret weapon. The pipeline architecture is clean and perfectly structured for automation.

**Three strategic imperatives emerged from all four auditors:**

1. **The system can become autonomous.** The CLI, skills, and agent pipeline are all in place — they just need a scheduler. A hybrid cron + webhook architecture can take the pipeline from 14 manual steps to 0 in the happy path, with human approval gates only at narrative review and go-live. Estimated per-build cost: $3-8 in API calls. Implementation: 4-6 weeks in phases.

2. **Viewer analytics is the bridge from service to platform.** Without knowing who viewed a PitchApp and how they engaged, Launchpad is a premium build service. With analytics, it becomes a platform that competes with DocSend. This is the single highest-impact product feature not yet built.

3. **The client experience has a critical dead zone.** Between project submission and PitchApp review, the client sees nothing — no progress, no timeline, no confidence signals. This is where the autonomous vision and UX improvements intersect: auto-builds + progress transparency = a client experience that feels like magic.

---

## The Autonomous Vision

### From 14 Manual Steps to Zero

**Current state:** Every step requires a human operator in a Claude Code session.

```
CLIENT SUBMITS → [14 manual operator steps over hours/days] → CLIENT REVIEWS
```

**Target state:** Client submits, system builds, client reviews with Scout.

```
CLIENT SUBMITS
    → auto-pull (cron detects new project, pulls materials)
    → auto-narrative (AI extracts story)
    → [APPROVAL GATE: admin reviews narrative, 5 min]
    → auto-copy (AI generates section copy)
    → auto-build (AI builds PitchApp from copy)
    → auto-review (visual QA catches P0 bugs)
    → auto-push (deploy to Vercel, push URL to portal)
    → CLIENT REVIEWS WITH SCOUT
    → auto-brief (detect edit requests)
    → auto-revise (AI applies changes)
    → auto-push (redeploy)
    → CLIENT APPROVES → LIVE
```

**Human touchpoints in autonomous mode:** 1 (narrative approval). Everything else runs on cron + webhooks.

### Architecture: Hybrid Cron + Webhook + Agent SDK

```
SUPABASE WEBHOOKS              GITHUB ACTIONS CRON           LOCAL AGENT SDK WORKER
(instant event detection)      (monitoring + alerting)        (pipeline execution)

• New project INSERT           • Health check (6h)            • Pull + narrative
• Status change UPDATE         • Stale alert (daily)          • Copy + build
• New edit brief INSERT        • Cost reporting               • Review + push
        │                              │                      • Revision cycle
        ▼                              ▼                             │
    ORCHESTRATION QUEUE (pipeline_jobs table)  ◄──────────────────────┘
        │
        ▼
    APPROVAL GATES (admin reviews in portal)
```

### Cron Schedule

| Job | Schedule | AI Cost | Purpose |
|-----|----------|---------|---------|
| Mission Scanner | Every 15 min | $0 | Detect new/stale/revision projects |
| Approval Watcher | Every 5 min | $0 | Resume pipelines after admin approval |
| Build Pipeline | On-demand | $3-8/build | Full pull → build → push cycle |
| Revision Pipeline | On-demand | $1-3/revision | Brief → revise → push cycle |
| Health Monitor | Every 6h | $0 | Check live PitchApp URLs respond |
| Stale Alert | Daily 9 AM | $0 | Flag projects stuck too long |

### Safety Guardrails (Non-Negotiable)

| Guardrail | Implementation |
|-----------|---------------|
| **Kill switch** | `AUTOMATION_ENABLED=false` env var halts everything |
| **Cost circuit breaker** | $50/day max, $15/build max, alert on threshold |
| **Lock files** | Prevent duplicate processing, auto-expire after 2h |
| **Max concurrent builds** | 2 simultaneous, 5/hour cap |
| **Human approval gate** | Narrative must be reviewed before build starts |
| **Retry limits** | 3 attempts max per job, then alert + pause |
| **Blast radius** | Never auto-deploy to custom domain, only *.vercel.app |

### Implementation Phases

| Phase | Timeline | What | Risk |
|-------|----------|------|------|
| **1. Monitoring** | Week 1 | Health checks, stale alerts, automation_log table | Zero |
| **2. Detection** | Week 2 | Auto-detect new projects + briefs, queue jobs, admin view | Low |
| **3. Auto-Pull + Narrative** | Week 3-4 | First AI automation, narrative approval gate | Medium |
| **4. Full Pipeline** | Week 5-6 | Copy → build → review → push, revision cycle | Medium |
| **5. Hardening** | Week 7 | VPS deployment, PM2, observability, cost dashboard | Low |
| **6. Event-Driven** | Future | Supabase webhooks replace polling, MCP server | Low |

### Cost Projections

| Volume | Monthly AI Cost | Infrastructure | Total |
|--------|----------------|---------------|-------|
| 5 builds/mo | $15-40 | $6 VPS | ~$50 |
| 10 builds/mo | $30-80 | $6 VPS | ~$90 |
| 25 builds/mo | $75-200 | $12 VPS | ~$200 |

---

## Findings by Priority

### CRITICAL — Do Now

#### 1. Viewer Analytics (Creative Lead)
**Impact:** Transforms Launchpad from build service to platform

Zero viewer data on deployed PitchApps. Clients can't track who opened their PitchApp, scroll depth, engagement time, or device. This is table stakes for fundraising/sales tools — DocSend's entire business is "know who's reading your deck."

**Fix:** Lightweight analytics script injected into deployed PitchApps. Track: page view, session duration, scroll depth %, device type, referrer. Dashboard in portal as "Viewer Insights" tab. Notification: "3 people viewed your PitchApp today."

#### 2. Post-Submission Dead Zone (UX Designer, Creative Lead)
**Impact:** Client confidence drops to zero between submit and review

After the launch sequence animation, the client sees "your launchpad is being built" with no progress, no timeline, no activity signals. This is the most dangerous moment for client trust.

**Fix:** Progress timeline component showing build phases. Pre-build summary ("here's what we understood"). Estimated completion time. Activity log visible to client.

#### 3. No Event System for Automation (Tech Lead, Systems Engineer)
**Impact:** Blocks autonomous operation entirely

Everything is request-response. No webhooks, no Supabase Realtime subscriptions, no event bus. The only way to detect a new project or status change is polling. This is the #1 blocker for automation.

**Fix:** `pipeline_jobs` orchestration table + Supabase DB webhooks (Phase 2) + local Agent SDK worker (Phase 3).

#### 4. No Launchpad Marketing Page (Creative Lead)
**Impact:** Product is invisible to anyone not directly referred

A cold visitor clicking "Launchpad" on bonfire.tools lands at a sign-in page with zero context. No explanation of what Launchpad is, what a PitchApp looks like, or why it's different from a deck builder.

**Fix:** Build a Launchpad marketing page at `bonfire.tools/launchpad` (already exists as a PitchApp-style page but needs the product story, example PitchApps, before/after comparisons, pricing signal).

---

### HIGH — Build Soon

#### 5. Client Approval Action (UX Designer, Creative Lead)
No mechanism for clients to signal "looks good, go live." Status transitions are admin-only. Client can only submit edit briefs through Scout — there's no explicit approval.

**Fix:** Approval action block when status = review: "looks great, go live" / "I have changes" / "something's not right (talk to human)."

#### 6. Scout Proactive Review (Creative Lead)
Scout waits for the client to ask questions. When a PitchApp moves to "review," Scout should open with observations: "i just looked at your PitchApp. the hero's strong. section 3 might be trying to say too much — want to talk through it?"

**Fix:** Add proactive review prompt to Scout's greeting when project has a PitchApp URL. Reference manifest for specific section feedback.

#### 7. Notification Click-Through (UX Designer)
Clicking a notification doesn't navigate to the relevant project. Each notification has `project_id` but items aren't linked.

**Fix:** Wrap notification items in links to `/project/{id}`.

#### 8. Scout Suggested Prompts (UX Designer)
First-time Scout users have to figure out what to say. No discoverability.

**Fix:** Show 3-4 clickable chips: "walk me through my PitchApp", "I have changes", "what can you help with?", "explain this section."

#### 9. Client Onboarding (UX Designer)
Empty dashboard with "+ new mission" and zero context. No sample PitchApp, no process overview, no welcome.

**Fix:** Welcome block on empty dashboard with process overview + "see an example" linking to a demo PitchApp.

#### 10. Email Notifications (Previous Audit C2 — Still Missing)
The NotificationBell exists but there's no email delivery. Client must manually check portal.

**Fix:** Integrate transactional email (Resend) for: status → review, status → live, new edit brief received.

#### 11. CLI Env Var Fallback (Tech Lead)
`launchpad-cli.mjs` reads from `apps/portal/.env.local` only. Can't run in CI/CD or cron without that file.

**Fix:** Fall back to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.

#### 12. CLI JSON Output Mode (Tech Lead, Systems Engineer)
`missions` returns human-readable text. Cron scripts need machine-readable JSON.

**Fix:** Add `--json` flag to all CLI commands. Add `--status` filter to `missions`.

---

### MEDIUM — Build for Scale

#### 13. PitchApp Versioning (Creative Lead)
No version history. Each push overwrites the previous deployment. Client can't see v1 vs v2.

**Fix:** Track versions in portal (Vercel keeps deployment history). Show comparison view.

#### 14. Remaining listUsers() Calls (Tech Lead)
`projects/route.ts:131` still calls `admin.auth.admin.listUsers()` on every project creation. Admin page also fetches all users.

**Fix:** Apply same try-create or caching pattern from sign-in route.

#### 15. getAdminUserIds() Broken Fallback (Tech Lead)
In scout route: `auth.users` table query doesn't work via data API. `getUserById` with email requires UUID. Always falls back to `listUsers()` on first call.

**Fix:** Simplify: try `listUsers()` once, cache for 5 min. Remove broken intermediate steps.

#### 16. Dashboard Search/Filter (UX Designer)
No project search, no status filter. Breaks at 10+ projects.

**Fix:** Status filter tabs + text search on company/project name.

#### 17. Portal Reduced Motion (UX Designer)
PitchApp builds have `prefers-reduced-motion` but the portal has none. Launch sequence, typing effects, 3D tilt, glow animations all play regardless.

**Fix:** Add `@media (prefers-reduced-motion)` rules to portal CSS.

#### 18. Design Token Gaps (UX Designer)
Border radius, font sizes, z-index, shadows all hardcoded. 10+ font sizes used inconsistently.

**Fix:** Define design token scale. Consolidate to 5-6 named type sizes.

#### 19. Admin Dashboard Improvements (UX Designer)
No viewport controls on admin preview. No inline notes. No brief status tracking (implemented/declined). Scout conversation cramped at 300px.

**Fix:** Incremental admin UX improvements as automation increases admin's oversight role.

#### 20. Scout Message Timestamps (UX Designer)
No timestamps on messages. Client can't tell when messages were sent in multi-day conversations.

**Fix:** Add relative timestamps to message items.

---

### LOW — Polish / Future

#### 21. Upload Progress Bar (UX Designer)
No progress indicator for large file uploads (up to 100MB allowed).

#### 22. Toast Accessibility (UX Designer)
ToastContainer has no `role="status"` or `aria-live`. Screen readers miss feedback.

#### 23. Skip Link in Portal (UX Designer)
Portal pages lack "skip to main content" link. PitchApp builds have it but portal doesn't.

#### 24. Admin Keyboard Navigation (UX Designer)
Custom status dropdown and notification dropdown lack keyboard support (arrow keys, Escape).

#### 25. Client Logo/Branding on PitchApps (Creative Lead)
Bonfire flame loader appears on client PitchApps (e.g., Shareability). Premium clients may want their brand, not bonfire's.

#### 26. Schema Drift (Tech Lead)
`pitchapp_manifests` table and `edit_brief_json` column aren't in migration.sql but exist in code.

#### 27. Scout Conversation Export (UX Designer)
No way to download or share conversation/briefs.

---

## Cross-Cutting Themes

| Theme | Flagged By | Insight |
|-------|-----------|---------|
| **Autonomous pipeline is ready to build** | All 4 | CLI + skills + agents are structured for automation. Need scheduling layer + approval gates + safety guardrails. |
| **Viewer analytics is the platform play** | Creative Lead, UX | Without engagement data, Launchpad is a build service. With it, it replaces DocSend + competes upstream. |
| **The dead zone kills confidence** | UX, Creative | Between submit and review, client is in the dark. Progress transparency is critical — doubly so for autonomous builds. |
| **Scout is the gem — invest more** | Creative, UX | Best AI personality in the system. Needs: proactive review, suggested prompts, audience-aware coaching. |
| **Marketing is missing** | Creative | The product is invisible. No marketing page, no case studies, no public proof. |
| **Code is solid, scaling needs work** | Tech Lead | Clean architecture. But listUsers(), in-memory rate limiting, no pagination — ceilings at 500+ clients. |

---

## The Big Picture: From Service to Platform to Intelligence

**Creative Lead's strategic arc:**

1. **Today (Service):** We build you a better presentation
2. **Next (Platform):** We build it, track who engages, help you follow up
3. **Future (Intelligence):** We learn what works across all PitchApps, optimize your story for your audience, tell you when to reach out

**The bridges:**
- Service → Platform: **Viewer analytics**
- Platform → Intelligence: **Cross-PitchApp learning** (what section structures get the most scroll depth? what CTAs get clicked? what narrative arcs produce return visits?)
- **Scout is the interface for all of it.** Today: workshopping copy. Tomorrow: "investors who spent 2+ minutes on your PitchApp have a 3x meeting rate — these three viewed it this week."

---

## Recommended Action Plan

### Sprint 1: Autonomous Foundation (Week 1-2)
- [ ] Create `pipeline_jobs` and `automation_log` tables
- [ ] Build mission scanner cron (detect new projects + stale alerts)
- [ ] Build health monitor cron (check live PitchApp URLs)
- [ ] Add CLI `--json` output mode and `--status` filter
- [ ] Add CLI env var fallback (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] Fix remaining `listUsers()` calls

### Sprint 2: Client Experience (Week 2-3)
- [ ] Build progress timeline component for project detail
- [ ] Add client approval action (approve / request changes / escalate)
- [ ] Add notification click-through to projects
- [ ] Add Scout suggested prompts (clickable chips)
- [ ] Add client onboarding welcome block
- [ ] Integrate email notifications (Resend) for status changes

### Sprint 3: Auto-Pipeline (Week 3-5)
- [ ] Build approval watcher cron
- [ ] Implement auto-pull pipeline (mission scanner → Agent SDK)
- [ ] Implement auto-narrative with approval gate
- [ ] Implement auto-build pipeline (copy → scaffold → build → review → push)
- [ ] Add cost tracking + circuit breaker
- [ ] Add per-project autonomy level (supervised / full_auto / manual)

### Sprint 4: Viewer Analytics MVP (Week 5-7)
- [ ] Build lightweight analytics script for PitchApps
- [ ] Track: views, duration, scroll depth, device, referrer
- [ ] Build Viewer Insights tab in portal project detail
- [ ] Add "X people viewed your PitchApp" notification
- [ ] Auto-inject analytics on `/pitchapp push`

### Sprint 5: Scout Enhancement + Marketing (Week 7-9)
- [ ] Scout proactive review on status → review
- [ ] Scout audience-aware coaching (reference target audience in review)
- [ ] Build Launchpad marketing page at bonfire.tools/launchpad
- [ ] Add example PitchApp showcase (with permission)
- [ ] PitchApp versioning in portal

### Sprint 6: Production Hardening (Week 9-10)
- [ ] Move automation to VPS + PM2
- [ ] Admin automation dashboard (active jobs, cost, health)
- [ ] Portal reduced motion + accessibility fixes
- [ ] Design token consolidation
- [ ] Auto-revision pipeline (brief → revise → push)

---

## What NOT to Change

All four auditors agreed:

- **Scout's personality** — The most distinctive AI voice in the product. Don't soften it, don't add emoji, don't make it "helpful assistant" generic.
- **Terminal aesthetic** — The portal's signature. TerminalChrome, dark theme, monospace labels, accent gold.
- **The launch sequence** — The rocket animation is the only moment of delight. Keep it.
- **Self-contained PitchApp architecture** — Each app independently deployable, no build tools. Don't add a bundler.
- **The pipeline checkpoint pattern** — User approval between phases prevents cascading mistakes. Even in autonomous mode, keep narrative approval.
- **CLI ID resolution** — UUID, prefix, or name matching. Great DX.
- **Brand hierarchy** — bonfire (studio) → Launchpad (product) → PitchApp (deliverable). Coherent, don't rename.
- **The 6-beat narrative arc** — Genuinely sophisticated methodology. The emotional layer added in the last sprint makes it even stronger.

---

*Generated by a 4-agent audit team on Claude Opus 4.6. Each agent independently reviewed the full codebase from their specialized perspective.*
