# PitchApp System Audit — Unified Report

**Date:** 2026-02-12
**Auditors:** Product Lead, Product Visionary, Portal Representative, UX/UI Expert, Narrative Expert, Dev Lead
**Model:** Claude Opus 4.6 (all agents)

---

## Executive Summary

The PitchApp system is well-designed and already producing excellent work. The architecture is sound, the narrative methodology is genuinely sophisticated, and the CLI-to-portal pipeline is cleverly engineered. Scout is a creative gem — the best-defined AI personality across the system.

**But the system has three fundamental problems:**

1. **Institutional amnesia.** The system's best work (Shareability) broke every documented convention and those innovations were never captured back. Each new build starts from ONIN-era patterns, not the state of the art. The docs describe one PitchApp, not the system's full capability.

2. **The starter template ships 3 documented bugs.** `scroll-behavior: smooth`, `gsap.from()` instead of `gsap.to()`, and missing ScrollToPlugin — the exact issues the docs explicitly warn against. Every new PitchApp inherits these.

3. **The client is in the dark.** Zero notification UI in the portal. No email notifications. No onboarding. No approval action. Clients have to manually check the portal to know anything happened.

**The system doesn't need more rules. It needs better memory, a fixed foundation, and a visible client experience.**

---

## Findings by Severity

### CRITICAL — Fix Now

#### C1. Starter template ships 3 known bugs
**Flagged by:** UX/UI, Dev Lead
**Files:** `templates/pitchapp-starter/css/style.css`, `templates/pitchapp-starter/js/app.js`

Every new PitchApp inherits these:
- `scroll-behavior: smooth` in CSS (style.css:39) — causes double-scroll jank with GSAP
- `gsap.from()` for 5 animation types (app.js:154-233) — causes FOUC (flash of unstyled content)
- ScrollToPlugin not loaded or registered — smooth scroll nav silently fails

These are the exact bugs documented in CONVENTIONS.md section 9.1 and CLAUDE.md's GSAP Gotchas table. The template was likely written before those gotchas were discovered and never updated.

**Fix:** Remove `scroll-behavior: smooth`, refactor all `gsap.from()` to `gsap.to()` with CSS defaults, add ScrollToPlugin script tag + registration.

#### C2. Zero client notification system
**Flagged by:** Portal Rep, Product Lead
**Files:** Portal Nav.tsx, notification API routes

The notification infrastructure exists (DB table, API endpoints) but:
- No notification UI in the portal (no bell icon, no badge, nothing)
- No email delivery for any event
- Clients don't know when their PitchApp is ready for review
- No notification when status changes, briefs are picked up, or PitchApp goes live

**Fix:** Build NotificationBell component. Add status-change notification triggers. Integrate transactional email (Resend).

#### C3. `listUsers()` on every sign-in request
**Flagged by:** Dev Lead
**File:** `apps/portal/src/app/api/auth/sign-in/route.ts:53`

`admin.auth.admin.listUsers()` fetches ALL users on every sign-in. At 1000+ users this is a performance bottleneck and potential DoS vector. Same pattern in brief notification handler (route.ts:449).

**Fix:** Use a targeted lookup or cache admin IDs.

---

### HIGH — Fix Soon

#### H1. No learning loop / institutional memory
**Flagged by:** Product Visionary, Narrative Expert, UX/UI
**Impact:** Every new build starts from ONIN-era knowledge instead of the system's best

Shareability invented: light-mode sections, video hero, character decode animation, client wall with magnetic repulsion, feed fragments, signal path flowcharts, `prefers-reduced-motion` support, nav color switching. None of this was captured back into CONVENTIONS.md, the starter template, or the agent knowledge.

**Fix:**
- Add post-build retrospective to deployment checklist (what patterns were invented?)
- Update CONVENTIONS.md with Shareability + Bonfire innovations (light sections, video hero, physics interactions, reduced motion)
- Update agent specs (@pitchapp-developer, @pitchapp-visual-qa) with full pattern range
- Create a "Proven Patterns" section in CONVENTIONS.md for custom section types

#### H2. Missing `/pitchapp build` skill — biggest pipeline gap
**Flagged by:** Product Lead
**Impact:** Dead zone between `/pitchapp new` (scaffold) and `/pitchapp push` (deploy)

Every pipeline step has a skill wrapper except the actual build step. A new operator wouldn't know what to do after copy is approved. The flow currently requires manually invoking `@pitchapp-developer`.

**Fix:** Create `/pitchapp build` skill that wraps `@pitchapp-developer`. Takes company name, reads `pitchapp-copy.md`, invokes the developer agent.

#### H3. Scout can't read PDFs (most common upload)
**Flagged by:** Portal Rep
**File:** `apps/portal/src/lib/scout/tools.ts:217`

`read_document` calls `blob.text()` on all files. PDFs, PPTX, DOCX, and images return garbage binary text. PDFs are the most commonly uploaded document type.

**Fix:** Detect file extension. Use PDF-to-text library (e.g., `pdf-parse`) for PDFs. Return "this file type requires manual review" for unsupported formats.

#### H4. No status auto-update on pull
**Flagged by:** Product Lead
**Impact:** Client sees no activity after submitting their project

After `/pitchapp pull`, the portal status stays "requested" for potentially hours/days until `/pitchapp push` sets it to "review." Client has no signal that work has started.

**Fix:** Auto-set status to "in_progress" when `pull` runs.

#### H5. Docs describe ONIN, reality is Shareability
**Flagged by:** Product Visionary, UX/UI, Narrative Expert

| What Docs Say | What's Actually Been Built |
|---|---|
| Dark-only palette | Dark + light hybrid (Shareability) |
| Cormorant Garamond + DM Sans | Space Grotesk + Inter (Shareability) |
| Photo hero only | Abstract grid, video, feed fragments |
| 13 standard sections | 21+ section types across 3 apps |
| No video support | Video hero with mp4 |
| No accessibility mention | `prefers-reduced-motion`, skip links, ARIA |

**Fix:** Update CONVENTIONS.md and CLAUDE.md to reflect the full range. Document light sections, video hero, typography presets, physics interactions.

#### H6. No anti-AI copy guardrails
**Flagged by:** Narrative Expert
**Impact:** The single biggest quality risk as the pipeline scales

The system has strong "don't be salesy" guardrails but no "don't sound like an AI" guardrails. No banned word list (leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable). No pattern recognition for generic AI prose.

**Fix:** Add a "Never Use" word list to @copywriter agent and Scout's knowledge base. Add "Prefer Instead" alternatives.

#### H7. Missing emotional arc in narrative methodology
**Flagged by:** Narrative Expert

The 6-beat arc tells WHAT to extract but not HOW THE READER SHOULD FEEL. Missing emotional state targets per beat: Problem (concern/recognition), Insight (surprise), Solution (excitement), Proof (confidence), Team (trust), Ask (urgency).

**Fix:** Add one line per beat in the 6-beat methodology defining the target emotional state.

---

### MEDIUM — Plan and Execute

#### M1. Token system incomplete
**Flagged by:** UX/UI
**Missing categories:** border radius, box shadow, line height, font weight, opacity scales, blur values, animation durations, z-index as tokens. Light section palette undocumented.

#### M2. No client onboarding or approval flow
**Flagged by:** Portal Rep
**Missing:** No guidance after project submission. No "approve" action to move to `live`. No explanation of what statuses mean for the client.

#### M3. Manifest extraction fragile
**Flagged by:** Dev Lead
**Issues:** Regex-based HTML parsing, misses `<li>` content, doesn't extract spacing/easing tokens, no nested section handling. Consider `cheerio` or `jsdom`.

#### M4. Skills overlap and pipeline gaps
**Flagged by:** Product Lead
- `/pitchapp pull` and `/pitchapp brief` overlap (pull already fetches briefs)
- No `/pitchapp status` skill (requires raw CLI)
- No `/pitchapp live` skill (final step missing)
- No quick review option (full 5-person team is overkill for minor revisions)

#### M5. Copy-to-developer handoff loses creative intent
**Flagged by:** Narrative Expert
**Issue:** pitchapp-copy.md says WHAT to build but not WHY each section exists in the narrative arc. Developer can't make informed pacing/emphasis decisions.

**Fix:** Add creative intent field per section in the copy output format.

#### M6. PITCH-TEAM-GUIDE.md is stale
**Flagged by:** Product Lead
References "Pipeline Manager" (doesn't exist). No mention of Launchpad, Scout, or revision cycle. Actively misleading.

#### M7. In-memory rate limiting doesn't work in serverless
**Flagged by:** Dev Lead
`recentRequests` Map resets on each cold start in Vercel. Not a security crisis (Supabase has its own rate limits) but the code's promise is misleading. Also grows unbounded (memory leak).

#### M8. Mobile patterns underspecified
**Flagged by:** UX/UI
No minimum touch target sizes (44px), no safe area handling for notched devices, no tablet-specific breakpoints, no landscape phone guidance, no documented viewport testing sizes.

#### M9. Section map generated too early in pipeline
**Flagged by:** Narrative Expert
The narrative strategist produces a section map (visual structure decisions) that should be the copywriter's responsibility. The narrative should deliver story beats, not section type assignments.

#### M10. Admin dashboard lacks workflow tools
**Flagged by:** Portal Rep
No project search/filter, no brief status tracking (implemented/declined), no activity log, no internal notes, Scout conversation is cramped and read-only.

---

### LOW — Polish / Future

#### L1. No pipeline state persistence
No local state file tracks where a mission is in the pipeline. If context resets mid-build, no way to resume without re-pulling.

#### L2. Project notes in Scout system prompt are unsanitized
Malicious user could set project notes to a prompt injection attempt. Document content is XML-wrapped (good), but notes are embedded directly in `<project_context>`.

#### L3. Missing CLI commands
`manifest` (independent extraction), `screenshots` (independent capture), `preview` (open URL), `delete` (cleanup), `logs` (recent Scout messages).

#### L4. Template missing meta tags and a11y
No `og:type`, no `twitter:card`, no `<main>` wrapper, no skip link, no `aria-label` on nav, no `prefers-reduced-motion`. All present in bonfire but not in the starter.

#### L5. No image handling workflow
No process for sourcing, optimizing, or placing images. Materials pulled from Launchpad may include images but there's no optimization step.

#### L6. Naming is fine — no rename needed
**Flagged by:** Product Lead
"PitchApp" = product type, "Launchpad" = delivery platform, "bonfire labs" = parent brand. Naming is coherent. Minor suggestion: rename `scripts/launchpad-cli.mjs` to `scripts/cli.mjs`.

#### L7. No use-case-specific narrative guides for proposals, case studies
System is 80% investor pitch, 15% general, 5% everything else. Case studies and product launches are listed as use cases but have no supporting methodology.

#### L8. Hero archetypes not documented
3 proven hero types exist (cinematic photo, abstract grid + glow, video + particles) but only one is documented. Hero type is the biggest creative decision per build.

#### L9. No typography presets beyond the default
Shareability proves the system works with non-serif display fonts. Should offer curated pairings: Classical (Cormorant + DM Sans), Modern (Space Grotesk + Inter), Editorial, Monospace-forward.

---

## Cross-Cutting Themes

| Theme | Flagged By | Core Insight |
|---|---|---|
| **Institutional amnesia** | Visionary, UX, Narrative, Product Lead | The system's best work isn't captured back. Docs describe the oldest PitchApp, not the best. |
| **Template is the weak link** | UX, Dev Lead | Every new build starts with 3 known bugs. Template predates the gotchas it should prevent. |
| **Client experience gap** | Portal Rep, Product Lead | Zero notifications, no onboarding, no approval. The premium feel stops at the PitchApp itself. |
| **Scout is the gem** | Narrative, Portal Rep | Best-defined AI personality. Well-scoped tools. Strong creative direction. Needs more narrative depth and PDF reading. |
| **Pipeline has a gap in the middle** | Product Lead | Every step has a skill except the build step. Auto-status updates missing. |
| **Creativity happens despite the docs** | Visionary | Shareability broke every rule and is the best output. The system constrains less than it enables. |

---

## Recommended Action Plan

### Sprint 1: Fix the Foundation (1-2 days)
- [ ] **C1** Fix starter template (remove smooth scroll, fix gsap.from → gsap.to, add ScrollToPlugin)
- [ ] **C3** Replace `listUsers()` with targeted lookup in sign-in and notification routes
- [ ] **L4** Add missing meta tags, `<main>` wrapper, skip link, ARIA to template
- [ ] **H4** Auto-set status to "in_progress" on pull

### Sprint 2: Client Visibility (2-3 days)
- [ ] **C2** Build NotificationBell component in portal nav
- [ ] **C2** Add status-change notification triggers (especially → review, → live)
- [ ] **C2** Integrate email delivery (Resend) for critical notifications
- [ ] **M2** Add client onboarding guidance (what happens next after submitting)

### Sprint 3: Knowledge Capture (2-3 days)
- [ ] **H1** Update CONVENTIONS.md with Shareability + Bonfire innovations
- [ ] **H1** Add "Proven Patterns" section for custom section types
- [ ] **H5** Update CONVENTIONS.md with light sections, video hero, typography presets, reduced motion
- [ ] **H1** Update @pitchapp-developer and @pitchapp-visual-qa agent specs
- [ ] **H1** Add post-build retrospective to deployment checklist
- [ ] **M6** Rewrite or retire PITCH-TEAM-GUIDE.md

### Sprint 4: Pipeline Completion (1-2 days)
- [ ] **H2** Create `/pitchapp build` skill
- [ ] **M4** Create `/pitchapp status` and `/pitchapp live` skills
- [ ] **M4** Add quick review option to `/pitchapp review`
- [ ] **M4** Consolidate `/pitchapp brief` behavior into `/pitchapp pull` (keep brief as shortcut)

### Sprint 5: Creative Quality (1-2 days)
- [ ] **H6** Add anti-AI copy word list to @copywriter and Scout knowledge
- [ ] **H7** Add emotional arc layer to 6-beat methodology
- [ ] **M5** Add creative intent field to pitchapp-copy.md format
- [ ] **M9** Move section map from narrative to copywriter phase

### Sprint 6: Scout & Portal Polish (2-3 days)
- [ ] **H3** Add PDF parsing to Scout's read_document tool
- [ ] **M3** Improve manifest extraction (consider cheerio, add `<li>` parsing)
- [ ] **M10** Add admin project filtering, brief status tracking, activity log
- [ ] **L3** Add missing CLI commands (manifest, screenshots, preview)

---

## What NOT to Change

The auditors unanimously agreed these are strengths to preserve:

- **CLAUDE.md structure and quality** — One of the best system docs across any project. Keep the layering: CLAUDE.md (overview) → CONVENTIONS.md (deep spec) → skills (quick reference).
- **Narrative strategist methodology** — "Story discovery over structure application" with mandatory critique loops. Genuinely excellent.
- **Scout's personality and guardrails** — The most distinctive AI personality in the system. Don't soften it.
- **Self-contained app architecture** — Each PitchApp independently deployable with no build tools. Don't add a bundler.
- **CLI ID resolution** — UUID, prefix, or name matching. Great DX.
- **Naming convention** — PitchApp (product), Launchpad (platform), bonfire labs (studio). No rename needed.
- **The pipeline checkpoint pattern** — User approval between phases prevents cascading mistakes.

---

*Generated by a 6-agent audit team on Claude Opus 4.6. Each agent independently reviewed the full codebase from their specialized perspective.*
