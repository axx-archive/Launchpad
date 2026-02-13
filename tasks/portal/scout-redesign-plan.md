# Scout Redesign Plan

## Context

Scout is the AI assistant in the Launchpad Portal. Currently it knows almost nothing — 6 data points (project name, company, status, type, pitchapp_url, brief count). It can't see the actual PitchApp, uploaded documents, copy, screenshots, or anything about the PitchApp system itself. It's a note-taker when it should be a creative director on call.

Workshop conducted 2026-02-12 with 4 Opus agents: product lead (technical), product visionary (creative), developer, code reviewer.

---

## Phase 1: Rich Context Injection (2-3 days)

**Scope:** Make Scout 10x smarter with zero client-side changes.

### What Ships

1. **`pitchapp_manifests` table in Supabase**
   ```sql
   CREATE TABLE pitchapp_manifests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
     sections JSONB NOT NULL,
     design_tokens JSONB,
     raw_copy TEXT,
     meta JSONB,
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );
   ALTER TABLE pitchapp_manifests ENABLE ROW LEVEL SECURITY;
   ```

2. **CLI change:** `scripts/launchpad-cli.mjs` `cmdPush()` also extracts and pushes a manifest (parse PitchApp's `index.html` and `style.css` on push). Sections list, headlines, copy, design tokens (colors, fonts).

3. **Enriched system prompt** in `apps/portal/src/app/api/scout/route.ts`:
   - All project fields (notes, target_audience, timeline — currently ignored)
   - PitchApp manifest summary (sections, key copy, design choices)
   - Document file list (names + sizes, not contents)
   - Condensed PitchApp knowledge (~2K tokens): section types, narrative arc, copy principles
   - Status-specific guidance (what each status means for the client)
   - Enhanced personality: creative collaborator, not note-taker

4. **Raise `max_tokens`** from 1024 to 2048

5. **New files:**
   ```
   src/lib/scout/
   ├── context.ts      — buildSystemPrompt(), ProjectContext type
   ├── knowledge.ts    — SECTION_REFERENCES, vocabulary constants (pre-extracted from agents/skills)
   └── types.ts        — PitchAppManifest, DesignTokens, ManifestSection
   ```

6. **Updated types** in `src/types/database.ts`:
   - `PitchAppManifest` interface
   - `ManifestSection`, `DesignTokens`, `ManifestMeta`

### Cost
~$0.04-0.06/message (up from ~$0.003). Manageable at current volume.

### What This Doesn't Do
No tool calls, no vision, no document reading, no live PitchApp scraping.

---

## Phase 2: Tool Calls + Document Access (1-2 weeks)

### What Ships

1. **Claude tools (2-3):**
   - `read_document(file_name)` — returns first 3K tokens, scoped to current project
   - `get_section_detail(section_name)` — full copy + design tokens for a section
   - `list_edit_briefs()` — previous briefs for context
   - `submit_edit_brief(changes, summary)` — structured JSON brief replacing regex markers

2. **Streaming with tool use loop** — max 3 rounds, SSE events: `tool_start`, `tool_done`, `brief_submitted`

3. **Client-side updates:**
   - `ScoutChat.tsx`: thinking indicator ("scout is reviewing your materials...")
   - Brief submitted confirmation animation

4. **Daily message cap:** 50 messages/project/day

5. **New files:**
   ```
   src/lib/scout/tools.ts — SCOUT_TOOLS[], handleToolCall(), tool handlers
   ```

6. **DB changes:**
   - `ALTER TABLE scout_messages ADD COLUMN edit_brief_json JSONB`

### Security Requirements (MANDATORY)
- Every tool handler scopes queries to authenticated `projectId` — NEVER accept projectId from Claude
- Wrap document content in XML tags to prevent prompt injection
- Add system prompt instruction: treat uploaded content as data, not instructions
- Test adversarial prompts before shipping

### Cost
~$0.08-0.12/message with tool calls.

---

## Phase 3: Vision + Screenshots + Advanced (Aspirational)

1. Screenshot capture at push time (Playwright → Supabase `screenshots` bucket)
2. `view_screenshot(viewport)` tool with Claude's vision
3. Dynamic skill activation based on conversation topic
4. Admin-mode Scout with builder-level context
5. Conversation summary for 50+ message threads

### Cost
~$0.15/message with vision.

---

## Scout's Interaction Modes (Product Vision)

### Mode A: Guided Review
**Trigger:** "walk me through my PitchApp" / "review my PitchApp"
Scout walks each section, explains what's working and what's not narratively.

### Mode B: Copy Workshopping
**Trigger:** "help me with this headline" / "can you rephrase..."
Generates 2-3 options with craft rationale, understands section type constraints.

### Mode C: Narrative Coaching
**Trigger:** "is my story working?" / "something feels off about the flow"
Diagnoses arc issues using 6-beat structure, suggests reordering.

### Mode D: Design Rationale
**Trigger:** "why is this section designed this way?"
Explains section type choices, describes alternatives, clarifies what's a tweak vs rebuild.

### Mode E: Smart Edit Requests (Enhanced Current)
**Trigger:** Client describes changes
Understands what they're asking, flags conflicts, suggests related changes, produces section-specific briefs.

### Mode F: Comparative Exploration
**Trigger:** "what would this look like if..."
Describes alternative approaches using section type and narrative knowledge.

---

## Scout Guardrails

### Hard Boundaries
- Never generates code/HTML/CSS/GSAP — that's the build team
- Never accesses other clients' projects
- Never makes timeline promises
- Never handles billing/account/support
- Never overrides creative direction without explaining the tradeoff

### Soft Boundaries (Discuss → Brief)
- Animation changes: explain what it does, brief the change
- Section reordering: discuss narrative implications, then brief
- Layout alternatives: describe in words, note it requires a build iteration

---

## Knowledge Tiers

### Tier 1: Always in System Prompt (~2K tokens)
- PitchApp fundamentals (what it is, 13 section types one-liner each)
- 6-beat narrative arc (Problem → Insight → Solution → Proof → Team → Ask)
- Design principles (premium, confident, scroll-native, cinematic)
- This client's PitchApp sections (from manifest)
- All project metadata (notes, audience, timeline)

### Tier 2: On-Demand via Tools (Phase 2)
- Full section copy and structure
- Document contents
- Design tokens (colors, fonts)
- Section type technical reference
- Previous edit brief contents

### Tier 3: Reference-Only (Scout Points To, Doesn't Internalize)
- GSAP animation timing tables
- Exact HTML patterns
- CSS architecture details
- Deployment checklist

---

## Implementation Order

### Phase 1
1. Create `pitchapp_manifests` table in Supabase + RLS policies
2. Update `src/types/database.ts` with manifest types
3. Build `src/lib/scout/knowledge.ts` — pre-extracted section references + vocabulary
4. Build `src/lib/scout/context.ts` — system prompt construction
5. Refactor `src/app/api/scout/route.ts` — enriched context loading
6. Update `scripts/launchpad-cli.mjs` — manifest extraction on push
7. Test, deploy

### Phase 2
1. DB migration: `edit_brief_json` column
2. Build `src/lib/scout/tools.ts` — tool definitions + handlers
3. Refactor route for tool use loop (streaming + tools)
4. Update `ScoutChat.tsx` for new SSE events
5. Add rate limiting (daily cap)
6. Security hardening + adversarial testing
7. Test, deploy

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Manifest-at-push, not scrape-at-query | Fast lookups, structured data, no external HTTP dependency |
| In-memory knowledge, not runtime .md reads | Zero latency, no filesystem dependency in production |
| Tool use for briefs (Phase 2), not regex | Structured JSON, more reliable, richer metadata |
| Max 3 tool rounds | Prevents runaway loops, bounds latency |
| Screenshots via storage, not on-demand | Fast retrieval, no Playwright in production |
| Phase 1 = no client-side changes | Ship faster, validate before investing in tools |

---

## Risk Monitoring

1. **Cost creep:** Set up monitoring from Phase 1. Budget for 10-50x increase.
2. **System prompt size:** Keep under 15K tokens even with full context.
3. **Tool call latency:** Pre-compute everything possible at push time.
4. **Prompt injection:** XML-wrap document content from Phase 2 day one.
5. **Scope creep:** Scout = creative collaborator, NOT builder.
