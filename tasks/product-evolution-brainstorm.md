# Product Evolution Brainstorm — Launchpad as Autonomous Creative Agency

*Product Lead (Creative) — February 2026*

---

## Executive Summary

Launchpad already does something remarkable: a client uploads materials, and an autonomous pipeline — narrative extraction (Opus 4.6), copy generation, HTML/CSS/JS build (Sonnet 4.5), 5-persona review, auto-fix, deploy, and revision via Scout — delivers a premium interactive presentation without a single human touching the code.

The question isn't "can this work?" — it already works. The question is: **what does it become when you stop thinking of it as a PitchApp builder and start thinking of it as an autonomous creative agency?**

Below are product evolution ideas organized by strategic theme. Each includes concept, user value, technical feasibility, and priority recommendation.

---

## Theme 1: Research Agent Teams

*The user's starting idea — and the highest-impact one.*

### 1A. Narrative Research Layer

**Concept:** Before the narrative strategist writes anything, a team of Opus 4.6 research agents investigates the company, industry, and competitive landscape. The narrative strategist acts as a **research director** — it reads the client's materials, identifies knowledge gaps, and dispatches targeted research missions.

**How it works:**
1. Narrative strategist reads transcript/materials (as it does now)
2. Before drafting, it generates a **research brief**: "I need market size data for [industry], competitor positioning for [3 named competitors], and recent funding rounds in this space"
3. Research agents fan out in parallel:
   - **Market Analyst** — TAM/SAM/SOM, industry growth rates, trend lines (web search + data synthesis)
   - **Competitive Intel** — What competitors claim, their positioning, pricing, gaps
   - **Citation Verifier** — Are the metrics the client mentioned real? Can we source them?
   - **Trend Scout** — Recent news, regulatory changes, cultural shifts relevant to the pitch
4. Results flow back to narrative strategist as structured research memos
5. Narrative is now informed by real data, not just the client's self-reported story

**User value:** A pitch backed by verified market data is 10x more credible. Clients currently do this research themselves (or pay consultants). This makes every PitchApp feel like it was written by someone who actually understands the industry.

**Technical feasibility:** HIGH. The existing `pipeline-executor.mjs` already orchestrates multi-step AI operations with Anthropic API. Research agents would be additional Opus calls with web search tool use (Anthropic's tool_use with a `web_search` tool or integrated via a search API like Brave/Perplexity). The `handleAutoNarrative` function already reads materials and calls Claude — adding a pre-research phase is an extension, not a rewrite.

**Architecture sketch:**
```
auto-pull → auto-research (NEW) → auto-narrative → [approval] → auto-build-html → ...
```

The `auto-research` job would:
- Read materials from `tasks/{name}/materials/`
- Call Opus to generate research brief (what questions need answering)
- Dispatch 3-4 parallel API calls with web_search tool
- Synthesize into `tasks/{name}/research.md`
- Feed research.md into narrative prompt alongside materials

**Priority:** P0 — This is the single highest-leverage improvement. It's the difference between "AI made me a nice website from my notes" and "AI understood my industry, found supporting data I didn't even have, and wove it into a compelling story."

---

### 1B. Due Diligence Package

**Concept:** For investor decks specifically, the research layer generates a companion **due diligence supplement** — a structured markdown document with sourced market data, competitive landscape map, and verified metrics.

**How it works:**
- After research agents complete, the system generates two outputs:
  1. The narrative (feeds into PitchApp, as now)
  2. A due diligence brief (downloadable from portal)
- The DD brief includes: market size with sources, competitor matrix, team background verification, metric sources
- Client can share this alongside the PitchApp link

**User value:** Investors always ask "where did you get these numbers?" Now the founder has a pre-packaged answer document that was generated alongside the pitch, from the same research.

**Technical feasibility:** MEDIUM. Research data is already being gathered in 1A — this is an additional output format. The copywriter agent can be extended with a "DD brief" template. Main challenge: citation quality. Web search results may need a verification pass.

**Priority:** P1 — Builds on 1A. Ship 1A first, then add DD brief as a fast follow.

---

### 1C. Living Research (Post-Deploy Monitoring)

**Concept:** After a PitchApp goes live, a background agent periodically re-runs relevant research queries and notifies the client of material changes — new competitor funding, market size updates, relevant news.

**How it works:**
- Cron job (daily or weekly) re-runs key queries from the original research brief
- Diffs against the stored research
- If material changes are found, creates a notification in the portal
- Client can choose to update the PitchApp with new data

**User value:** The pitch stays current. If a competitor raises a round or the market shifts, you know about it.

**Technical feasibility:** MEDIUM. The `health-monitor.mjs` pattern already exists for periodic checks. This is similar but with LLM-based diff analysis. Main cost concern: ongoing API usage per project.

**Priority:** P2 — Delightful but not core. Ship after research layer and DD brief are proven.

---

## Theme 2: Client Co-Creation

*Making the portal feel like you're building something together, not just waiting.*

### 2A. Real-Time Build Theater

**Concept:** When the pipeline is building, the client sees more than a progress bar. They see a live feed of what's happening — almost like watching a creative team work.

**What it looks like:**
- Pipeline activity already shows job status (`PipelineActivity.tsx`) — but it's dry ("Extracting your story... 5m 23s elapsed")
- Instead, surface **contextual previews**:
  - During `auto-narrative`: Show the story arc as it forms — "Found your core insight: [first sentence of narrative]"
  - During `auto-build-html`: Show section-by-section progress — "Building your hero section... Writing your metrics grid... Styling your team section..."
  - During `auto-review`: Show reviewer verdicts in real-time — "Product Lead: looking good. Copywriter: flagged 2 generic phrases. Code Reviewer: all clear."
- Add a **"behind the glass" view** — the client can optionally watch the raw agent activity stream (sanitized, no raw code — just decisions and actions)

**User value:** The build takes 15-30 minutes. Right now that's dead time. Build Theater turns it into entertainment and builds confidence ("this thing is actually doing real work"). It's the Domino's Pizza Tracker for creative work.

**Technical feasibility:** MEDIUM-HIGH. Pipeline jobs already log to `automation_log`. Adding structured progress events is straightforward — the `handleAutoBuildHtml` function processes tool calls in a loop, and each tool_use could emit a progress event to a Supabase realtime channel. The portal already uses polling (`POLL_INTERVAL = 30_000` in PipelineActivity) — switching to Supabase realtime or SSE would enable live updates.

**Priority:** P1 — High emotional impact, moderate engineering effort. The "wow" factor of watching AI build your pitch in real-time is significant for client trust and word-of-mouth.

---

### 2B. Style Mood Board

**Concept:** Before building, present the client with a visual mood board showing the aesthetic direction: color palette, typography pairing, hero archetype, and reference examples. The client picks or adjusts before build starts.

**How it works:**
- After narrative approval (during `brand_collection` phase), generate a mood board:
  - Proposed accent color (derived from brand assets or company identity)
  - Typography pairing (display + body fonts)
  - Hero archetype recommendation (Cinematic Photo / Abstract Grid / Video)
  - 2-3 reference PitchApp screenshots showing similar aesthetics
- Client can: approve as-is, adjust colors, pick different fonts, choose hero type
- Selections feed into the build prompt

**User value:** Clients feel creative ownership. Instead of "here's what the AI made," it's "here's what we built together." Reduces revision cycles because the aesthetic direction was agreed upfront.

**Technical feasibility:** MEDIUM. The copywriter already recommends hero archetype. Extracting brand colors from logos is a solved problem (dominant color extraction). Font pairing suggestions are template-able. The main UX work is the mood board component itself.

**Priority:** P1 — Reduces revisions (saves cost), increases client satisfaction, differentiates from "black box" AI tools.

---

### 2C. Inline Section Commentary from Scout

**Concept:** After the PitchApp is deployed for review, Scout can walk the client through it section-by-section — not just in chat, but with commentary overlaid on the actual PitchApp.

**How it works:**
- Scout already has `get_section_detail` and `list_edit_briefs` tools
- Add a "guided tour" mode where Scout generates commentary for each section
- The PitchApp itself gets a thin overlay layer (injected via query param `?review=true`) that shows Scout's annotations
- Client clicks through annotations, then drops into chat for edits

**User value:** Bridges the gap between "looking at the thing" and "talking about the thing in chat." The client doesn't have to describe which section they're talking about — they're literally pointing at it.

**Technical feasibility:** LOW-MEDIUM. This requires either: (a) injecting a review overlay into the static PitchApp via a script tag, or (b) wrapping the PitchApp in an iframe within the portal. Option (b) is more feasible. The annotation data is straightforward (section index + commentary text).

**Priority:** P2 — Nice-to-have but complex. The current Scout chat + suggested prompts works reasonably well.

---

## Theme 3: New Deliverable Types

*What else can an autonomous creative agency produce?*

### 3A. One-Pager / Leave-Behind PDF

**Concept:** From the same narrative, generate a single-page PDF that summarizes the pitch — designed for printing or attaching to emails. Think of it as the PitchApp's analog companion.

**How it works:**
- The copywriter already generates multiple output formats (email, pitchapp copy, slides)
- Add a "one-pager" template: company name, one-liner, 3-4 key points, 2-3 metrics, team, contact
- Render to PDF using Puppeteer/Playwright (or a headless HTML-to-PDF service)
- Available for download from the portal

**User value:** Investors often want "just send me a one-pager." Having this ready alongside the PitchApp means the founder can respond instantly.

**Technical feasibility:** HIGH. The copywriter agent already extracts the right content. HTML-to-PDF is well-trodden ground. The template is simple.

**Priority:** P1 — High value, low effort. Classic quick win.

---

### 3B. Email Sequence (Warm Outreach + Follow-Up)

**Concept:** Generate not just one investor email, but a complete sequence: cold outreach, warm intro request, follow-up if no response (3 days), follow-up after PitchApp view (triggered by analytics).

**How it works:**
- Copywriter already generates email variants
- Extend to a 3-4 email sequence with temporal logic
- Analytics integration: if ViewerInsights detects a view from a referrer matching an investor email domain, trigger a "they opened it" notification with a suggested follow-up email

**User value:** Turns the PitchApp from a one-shot delivery into part of an active outreach system. The analytics-triggered follow-up is genuinely clever — "I noticed you spent 3 minutes on our traction section — happy to dive deeper on our metrics."

**Technical feasibility:** MEDIUM. Email generation is easy (copywriter extension). The analytics-triggered follow-up requires connecting ViewerInsights data (referrer, scroll depth) with the email sequence context. Could integrate with Resend (already in the stack) for sending.

**Priority:** P2 — Powerful but scope creep. Start with the static email sequence, add analytics triggering later.

---

### 3C. Social Content Kit

**Concept:** From the same narrative, generate social-ready content: LinkedIn post announcing the pitch, Twitter thread version, and image assets for sharing.

**How it works:**
- Copywriter generates LinkedIn post (announcement + PitchApp link)
- Generates a tweet thread (5-7 tweets distilling the narrative)
- Generates OG image using the PitchApp hero visual + headline (Puppeteer screenshot of a specially styled template)

**User value:** Founders need to promote their PitchApp once it's live. Having ready-made social content removes friction.

**Technical feasibility:** HIGH for text content, MEDIUM for image generation. Text is a straightforward copywriter extension. The OG image can be generated from a template similar to how Playwright screenshots already work.

**Priority:** P2 — Nice ecosystem play, not core.

---

### 3D. Interactive Proposal (Beyond PitchApps)

**Concept:** The same architecture — narrative extraction → copy → build → review → deploy — could produce other deliverable types: consulting proposals, case studies, product launches, company intranet pages.

**How it works:**
- The PitchApp template system (`templates/pitchapp-starter/`) is already parameterized
- Create additional templates: `proposal-starter/`, `case-study-starter/`, `landing-page-starter/`
- The pipeline stays the same, but the template and section types change
- Each template has its own conventions doc and section catalog

**User value:** Launchpad becomes a platform, not a single-purpose tool. A consulting firm could use it for proposals. A marketing agency for case studies. A startup for their entire web presence.

**Technical feasibility:** MEDIUM-HIGH. The architecture already supports this — `CONVENTIONS.md` and the section catalog are what make PitchApps specific. New templates with new conventions = new deliverable types. The agents (narrative strategist, copywriter) work at the story level, not the format level.

**Priority:** P1 for proposals (closest to PitchApps), P2 for others. This is the scaling story for the business.

---

## Theme 4: Quality Intelligence

*The agency gets smarter over time.*

### 4A. Pattern Recognition Across Builds

**Concept:** Track what works across all PitchApps: which hero archetypes get higher scroll completion, which section types retain attention, which narrative structures lead to fewer revisions.

**How it works:**
- ViewerInsights already tracks: scroll depth distribution, avg duration, device breakdown
- Add per-section analytics (scroll depth at each section boundary)
- Correlate with build metadata: hero archetype used, section types chosen, narrative structure
- Build a growing dataset: `{narrative_arc, hero_type, section_sequence, avg_scroll_depth, avg_duration}`
- After N builds, surface insights: "Fintech investor decks with Proof-Led narratives retain 23% more viewers past section 4"

**User value:** Each new client benefits from everything the agency has learned. The pitch recommendation engine gets better with every build.

**Technical feasibility:** MEDIUM. Analytics infrastructure exists (ViewerInsights). The per-section tracking requires a small addition to the PitchApp's JS (fire analytics events at section boundaries). The correlation analysis is a periodic batch job.

**Priority:** P2 — Requires scale (10+ builds) to be meaningful. Build the data collection infrastructure now, surface insights later.

---

### 4B. Review Quality Score

**Concept:** Track review findings across builds and measure: (a) how many P0s are caught and fixed before client sees it, (b) how many client-reported issues match something a reviewer missed, (c) which reviewers catch the most actionable issues.

**How it works:**
- `auto-review` already generates P0/P1/P2 findings per reviewer
- Track: P0 count at initial build → P0 count after auto-fix → client revision requests
- If client requests changes that a reviewer should have caught, log it as a miss
- Build reviewer performance profiles over time
- Use to adjust reviewer prompts and priorities

**User value:** Invisible to clients but compounds quality over time. The "I can't believe this is autonomous" reaction comes from consistent quality, not one impressive demo.

**Technical feasibility:** HIGH. Review data is already stored in `tasks/{name}/review.md` and pipeline job results. Correlation with edit briefs is a join query. The feedback loop into reviewer prompts is manual initially, automated later.

**Priority:** P1 — Quality is the moat. Track it from day one.

---

### 4C. Narrative Confidence Scoring

**Concept:** The narrative strategist already rates its confidence (1-10) in the narrative brief. Surface this to the client and the pipeline, and use it to gate quality.

**How it works:**
- If confidence < 7: flag to client that "the story needs more input from you" with specific questions
- If confidence < 5: pause the pipeline and request a discovery call or more materials
- Track confidence scores across projects and correlate with revision counts
- Over time: "Projects with confidence 8+ require 60% fewer revisions"

**User value:** Prevents the pipeline from building on weak foundations. Better to ask for more input upfront than to build something the client will reject.

**Technical feasibility:** HIGH. The narrative output already has a confidence field. Parsing and gating is trivial.

**Priority:** P0 — Simple, high-impact quality signal. Should have been built yesterday.

---

## Theme 5: The "Wow" Factor

*What makes someone say "I can't believe this is autonomous"?*

### 5A. Brand DNA Extraction

**Concept:** When a client uploads brand assets (logos, guides, imagery), don't just copy them into the build. **Analyze** them. Extract color palettes from logos. Identify typography from PDF brand guides. Detect photographic style from uploaded images. Feed all of this into the build as structured style decisions.

**How it works:**
- Client uploads logo → extract dominant colors, secondary palette, contrast ratio
- Client uploads brand guide PDF → OCR/parse for font names, spacing rules, usage guidelines
- Client uploads photos → classify style (warm/cool, saturated/desaturated, portrait/landscape)
- Generate a `brand-dna.json` with: `{ colors: {...}, fonts: {...}, photoStyle: "...", mood: "..." }`
- Build agent receives this as structured input instead of guessing

**User value:** "It looked at my brand guide and actually used the right fonts and colors." This is the moment where it stops feeling like a template and starts feeling like a designer worked on it.

**Technical feasibility:** MEDIUM. Color extraction from images is straightforward (even without ML — dominant color algorithms). Font extraction from PDFs is harder but possible with OCR. Photo style classification could use Claude's vision capabilities (already supported — `loadMaterialsAsContentBlocks` handles images).

**Priority:** P0 — This is where magic meets utility. The brand collection phase already exists; making it smart transforms the experience.

---

### 5B. Voice Matching

**Concept:** Analyze the client's existing communications (website copy, previous decks, emails) and extract their **voice** — then ensure all generated copy matches that voice.

**How it works:**
- During research phase, scrape the client's website and analyze tone
- Identify patterns: formal/casual, technical/accessible, data-driven/story-driven
- Generate a voice profile: `{ register: "confident-casual", vocabulary_level: "accessible", preferred_structures: ["short sentences", "rhetorical questions"], avoid: ["corporate jargon", "passive voice"] }`
- Feed voice profile into copywriter and narrative strategist prompts

**User value:** "It sounds like us." The biggest complaint about AI-generated content is that it doesn't sound human — and specifically, it doesn't sound like *that* human. Voice matching solves this.

**Technical feasibility:** HIGH. This is prompt engineering on top of research. The copywriter agent already has detailed writing guidelines and a "Never Use" word list. Adding a per-client voice profile is an extension.

**Priority:** P1 — High perceived value, moderate effort. The difference between "AI wrote this" and "someone who knows us wrote this."

---

### 5C. Competitive Differentiation View

**Concept:** When presenting the completed PitchApp, show the client how it compares to their competitors' public-facing presentations. "Your competitor uses a generic PDF deck. Here's what you're sending instead."

**How it works:**
- Research agents (from Theme 1) already gather competitor data
- Capture screenshots of competitor websites and pitch pages
- Present a side-by-side: their static deck vs. your interactive PitchApp
- Highlight specific advantages: scroll depth analytics, mobile responsiveness, cinematic design

**User value:** Validates the investment in Launchpad. Makes the client feel like they have an unfair advantage. Great for word-of-mouth ("look at what their deck looks like vs. mine").

**Technical feasibility:** MEDIUM. Competitor screenshot capture via Playwright is straightforward. The comparison view is a UI component. The risk is that some competitors may have great websites, which makes the comparison awkward.

**Priority:** P2 — Great sales tool, but not core product value.

---

### 5D. "Agency Credits" — Behind-the-Scenes Summary

**Concept:** After a PitchApp is deployed, generate a "making of" summary visible to the client: how many AI personas reviewed it, what they caught, how many iterations happened, total time from submission to delivery.

**How it works:**
- Pipeline already logs everything to `automation_log`
- Aggregate: `{ total_ai_calls: 47, review_personas: 5, p0_bugs_caught_and_fixed: 3, revision_rounds: 1, time_to_deploy: "2h 14m" }`
- Present in the portal as a "production credits" card
- Include highlights: "The Code Reviewer caught a scroll conflict on mobile — fixed before you ever saw it."

**User value:** Transparency builds trust. Knowing that 5 AI reviewers checked the work (and caught real bugs) is more impressive than a black-box "it's done." It also justifies the value — this isn't just "ChatGPT made me a website."

**Technical feasibility:** HIGH. All the data already exists in `automation_log` and pipeline job results. This is purely a UI/aggregation feature.

**Priority:** P0 — Nearly free to implement, high trust-building value. Ship immediately.

---

## Theme 6: Platform & Defensibility

### 6A. Client Workspace (Multi-Project)

**Concept:** Evolve the dashboard from a list of projects to a proper client workspace. Companies that use Launchpad for one pitch will want it for multiple: investor deck, customer proposal, partnership overview, team recruiting page.

**How it works:**
- Group projects by "workspace" (company)
- Shared brand assets across workspace (upload once, use everywhere)
- Shared narrative elements (company story is consistent across deliverables)
- Cross-project analytics ("your investor deck got 340 views this month, your proposal got 89")

**User value:** Lock-in through accumulated value. The more you use Launchpad, the more it knows about your brand, your story, your audience.

**Technical feasibility:** MEDIUM. Database schema change (workspace → projects instead of user → projects). Brand assets already exist per-project; making them workspace-level is a migration. The collaboration system (`project_members`) could extend to workspace-level roles.

**Priority:** P1 — Critical for retention and expansion revenue.

---

### 6B. Revision Memory

**Concept:** Scout remembers what was changed and why. If a client says "make the hero warmer" and then later says "actually, go back to how it was," Scout can recall the previous state and revert intelligently.

**How it works:**
- Already have `VersionHistory` component and edit brief tracking
- Extend Scout's context to include full revision history with diffs
- Enable commands like "undo the last change" or "go back to version 2"
- Git-style version control for PitchApp builds

**User value:** Removes the fear of making changes. Clients currently hesitate to request edits because they're not sure they can go back. Version control makes experimentation safe.

**Technical feasibility:** MEDIUM-HIGH. The pipeline already re-deploys on revision. Storing previous build snapshots (just 3 files: HTML, CSS, JS) is trivial. The Scout integration needs version-aware context.

**Priority:** P1 — Safety net that enables bolder creative exploration.

---

## Priority Matrix

| Priority | Feature | Impact | Effort | Theme |
|----------|---------|--------|--------|-------|
| **P0** | Narrative Research Layer (1A) | Transformative | Medium | Research |
| **P0** | Narrative Confidence Scoring (4C) | High | Low | Quality |
| **P0** | Brand DNA Extraction (5A) | High | Medium | Wow |
| **P0** | Agency Credits (5D) | Medium | Low | Wow |
| **P1** | Real-Time Build Theater (2A) | High | Medium | Co-Creation |
| **P1** | Style Mood Board (2B) | Medium | Medium | Co-Creation |
| **P1** | One-Pager PDF (3A) | High | Low | Deliverables |
| **P1** | Review Quality Score (4B) | High | Low | Quality |
| **P1** | Voice Matching (5B) | High | Medium | Wow |
| **P1** | Interactive Proposals (3D) | High | Medium | Deliverables |
| **P1** | Client Workspace (6A) | High | Medium | Platform |
| **P1** | Revision Memory (6B) | Medium | Medium | Platform |
| **P1** | Due Diligence Package (1B) | Medium | Low | Research |
| **P2** | Living Research (1C) | Medium | High | Research |
| **P2** | Email Sequence (3B) | Medium | Medium | Deliverables |
| **P2** | Social Content Kit (3C) | Low | Medium | Deliverables |
| **P2** | Section Commentary (2C) | Medium | High | Co-Creation |
| **P2** | Pattern Recognition (4A) | High (long-term) | Medium | Quality |
| **P2** | Competitive View (5C) | Low | Medium | Wow |

---

## Recommended Roadmap

### Phase 1: "The Research Agency" (Weeks 1-3)
Ship the research layer and quality signals that make the core product dramatically better.
- Narrative Research Layer (1A)
- Narrative Confidence Scoring (4C)
- Agency Credits (5D)
- Review Quality Score (4B)

### Phase 2: "The Experience" (Weeks 4-6)
Make the client journey feel magical, not transactional.
- Brand DNA Extraction (5A)
- Real-Time Build Theater (2A)
- Style Mood Board (2B)
- One-Pager PDF (3A)

### Phase 3: "The Platform" (Weeks 7-10)
Scale beyond single-project, single-deliverable usage.
- Voice Matching (5B)
- Interactive Proposals (3D)
- Client Workspace (6A)
- Revision Memory (6B)
- Due Diligence Package (1B)

### Phase 4: "The Intelligence" (Ongoing)
Compound advantages that make the product better with every build.
- Pattern Recognition (4A)
- Living Research (1C)
- Automated voice/style learning from revisions

---

## The Defensibility Argument

What makes this hard to replicate:

1. **Narrative-first architecture.** Competitors will build "AI website generators." Launchpad starts with the story, not the template. The research layer deepens this moat.

2. **Quality review loop.** Five AI personas reviewing every build, with auto-fix on P0 issues, is a quality floor that single-model generators can't match.

3. **Accumulated intelligence.** With pattern recognition, every build makes the next one better. Voice matching, brand DNA, and narrative confidence scoring create compound learning.

4. **Full lifecycle ownership.** From research → narrative → build → review → deploy → analytics → revision. No one else owns the whole loop. Adding research makes the front of the funnel stronger; adding analytics makes the back stronger.

5. **The Scout relationship.** Scout isn't a chatbot — it's a creative partner that understands the project's history, the client's voice, and the technical constraints. This relationship is the lock-in.

---

## Final Thought

The most powerful positioning for Launchpad isn't "AI builds your pitch deck." It's:

**"A creative agency that never sleeps, learns from every project, and ships in hours instead of weeks — with research, strategy, design, code review, and deployment all handled by a team of AI specialists."**

The research agent team is the keystone. It transforms Launchpad from a production tool into a strategic partner. Everything else amplifies that shift.
