# Launchpad Portal — Unified Architecture

Synthesized from 7-agent team: Product Lead, Product Visionary, Copywriter, Harsh Critic, UX/UI Lead, Developer, Code Reviewer.

---

## The Concept

The portal is the private operations layer behind Launchpad. Today, a founder sends materials and gets a PitchApp URL back through scattered channels. The portal makes that handoff a curated, trackable experience.

**What it is:** A members-only dashboard where portfolio founders track their PitchApp projects, preview builds, and request changes through Scout.

**What it is NOT:** A SaaS product. Not a project management tool. Not a self-serve builder. It's a concierge experience with a glass-walled view into the kitchen.

**The meta play:** The portal itself IS a PitchApp — same dark theme, same scroll-native feel, same premium atmosphere. The product demonstrates itself.

---

## Naming System (from Visionary)

| Concept | Name |
|---------|------|
| Dashboard | mission control |
| Projects | missions |
| PitchApp deliverable | payload |
| Notifications | transmissions |
| Status updates | pings |
| Activity log | flight log |
| Statuses | pre-flight → plotting course → in orbit → payload ready → launched |

**Display labels** (what users see on badges):

| Internal State | Display Label |
|----------------|---------------|
| requested | `queued` |
| in_progress | `in build` |
| review | `review` |
| revision | `revision` |
| live | `live` |
| on_hold | `hold` |

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14+ App Router | Server components, streaming, API routes |
| Language | TypeScript | Type safety for data models |
| Auth | Supabase Auth (magic links) | Passwordless, premium feel |
| Database | Supabase PostgreSQL | Already running, RLS for security |
| AI | @anthropic-ai/sdk (server-side) | Scout chat with Claude API |
| Styling | Tailwind CSS + CSS variables | Match existing Launchpad design system |
| Hosting | Vercel | Separate project in monorepo |
| **Total deps** | **6 packages** | next, react, @supabase/supabase-js, @supabase/ssr, @anthropic-ai/sdk, tailwindcss |

---

## Data Model (3 tables + Supabase Auth)

The Code Reviewer recommended 3 core tables over the Product Lead's 7. Leaner, fewer joins, less surface area. Scout messages and edit briefs are stored as JSONB within the project record or as simple related records.

```sql
-- Projects: the core entity
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  company_name text not null,
  project_name text not null,
  type text not null check (type in ('investor_pitch', 'client_proposal', 'product_launch', 'other')),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'review', 'revision', 'live', 'on_hold')),
  pitchapp_url text,
  target_audience text,
  materials_link text,
  timeline_preference text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Scout messages: conversation history per project
create table scout_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- When Scout generates an edit brief, store it here
  edit_brief_md text,
  created_at timestamptz default now()
);

-- Notifications: simple append-only log
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  project_id uuid references projects(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- RLS policies
alter table projects enable row level security;
alter table scout_messages enable row level security;
alter table notifications enable row level security;

-- Clients see only their projects
create policy "clients_own_projects" on projects
  for select using (auth.uid() = user_id);

-- Admins see all projects (admin emails in app config, checked server-side)
-- Admin operations go through API routes with server-side auth check

-- Clients see only their scout messages
create policy "clients_own_messages" on scout_messages
  for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Clients see only their notifications
create policy "clients_own_notifications" on notifications
  for select using (auth.uid() = user_id);
create policy "clients_update_own_notifications" on notifications
  for update using (auth.uid() = user_id);
```

**User profiles:** Supabase Auth handles users. Store `full_name` in auth.users metadata. Admin role determined by env var `ADMIN_EMAILS` (comma-separated), checked server-side — no RBAC table needed at 5-20 users.

---

## Information Architecture

### Routes

```
/                       → redirect to /dashboard or /sign-in
/sign-in                → magic link (terminal-style)
/dashboard              → project cards (mission control)
/project/[id]           → project detail (split: preview + scout)
/admin                  → all projects board (admin only, server-checked)
/admin/project/[id]     → project detail + admin controls
```

### No notification bell. No notification page.

Per the Harsh Critic: notification bells are SaaS furniture. At 5-20 users, notifications appear as:
- Inline status changes on project cards (the card itself IS the notification)
- Scout messages within the project detail
- A subtle unread indicator on the project card if something changed since last visit

Notifications table still exists for tracking unread state, but there's no bell icon, no dropdown panel, no notification center.

---

## Page Designs

### Sign-In Page

Full-screen terminal aesthetic. Not a form in a box — the whole page IS the terminal.

```
┌─────────────────────────────────────────┐
│ ● ● ●  launchpad — authenticate         │
├─────────────────────────────────────────┤
│                                         │
│  mission control                        │
│                                         │
│  sign in to access your projects.       │
│                                         │
│  $ email: [you@company.com          ]   │
│                                         │
│  $ launchpad --authenticate             │
│                                         │
└─────────────────────────────────────────┘
```

**States:**
1. Email input (default)
2. Link sent: "check your inbox. we sent a magic link to {email}."
3. Error states: "that doesn't look like an email." / "this link has expired."
4. No "create account" — invite only

### Dashboard (Mission Control)

No greeting banner. No "welcome back." The dashboard IS the greeting — your projects, front and center.

```
┌─ nav: launchpad ──── [progress] ──── mission control ── sign out ─┐
│                                                                     │
│  mission control                                                    │
│  {count} active missions                                            │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │
│  │ ● in build       │  │ ● review         │  │ ● live           │  │
│  │                  │  │                  │  │                  │  │
│  │ Company Name     │  │ Company Name     │  │ Company Name     │  │
│  │ investor pitch   │  │ client proposal  │  │ product launch   │  │
│  │ updated 2d ago   │  │ updated 3h ago   │  │ updated jan 28   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                     │
│  empty state: "nothing on the pad yet."                             │
│  CTA: "request a launchpad" → links to marketing site              │
└─────────────────────────────────────────────────────────────────────┘
```

**Project cards:** Same card component as the bonfire/launchpad marketing pages. Gradient header, status dot, company name, type tag, last updated. Cards have the 3D tilt hover effect.

**Unread indicator:** If a project's status changed since the user last viewed it, the card gets a subtle bronze left-border glow (not a badge number, not a dot — a glow).

### Project Detail (Split View)

Left panel: PitchApp preview (iframe). Right panel: Scout chat.

```
┌─ ← dashboard ───────────────── Company Name ── ● review ──────────┐
│                                                                     │
│  ┌─────────────────────────────┐  ┌──────────────────────────────┐ │
│  │                             │  │ ● ● ●  scout                 │ │
│  │                             │  ├──────────────────────────────┤ │
│  │    [iframe: PitchApp]       │  │                              │ │
│  │                             │  │  scout: hey. your project    │ │
│  │                             │  │  is ready for review. what   │ │
│  │                             │  │  would you like to change?   │ │
│  │                             │  │                              │ │
│  │                             │  │  you: the hero feels too     │ │
│  │                             │  │  corporate. warmer tone.     │ │
│  │                             │  │                              │ │
│  │                             │  │  scout: got it. i'll draft   │ │
│  │                             │  │  a brief for the team...     │ │
│  │                             │  │                              │ │
│  │  open in new tab            │  │  $ [describe changes...]     │ │
│  └─────────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Preview panel:**
- Full iframe when PitchApp URL exists
- Placeholder when not ready: "your launchpad is being built."
- "open in new tab" link below
- Responsive toggle: desktop / tablet / mobile (resizes iframe)

**Scout panel:**
- Terminal chrome (traffic light dots, "scout" title)
- NOT chat bubbles — terminal-style lines, character-by-character typing (15ms/char)
- Scout messages in `--color-text`, user messages in `--color-text-muted`
- Input: `$ describe what you'd like to change...`
- No send button visible — Enter to send (with a subtle → icon)

**When preview not available:** Scout panel goes full-width. Preview panel shows the "being built" placeholder at reduced height.

### Admin View

Same portal, role-gated. Admin sees:

**Admin dashboard (`/admin`):**
- All projects grouped by status columns (kanban-like but read-only — more "status board")
- Each card shows: company name, client name, status, last updated, unread brief indicator
- Click → admin project detail

**Admin project detail (`/admin/project/[id]`):**
- Same split view as client, plus:
  - Status dropdown (admin can change status)
  - PitchApp URL input field (admin enters the Vercel URL)
  - "Briefs" tab showing all Scout-generated edit briefs as formatted markdown
  - Scout conversation is read-only for admin (they see what the client said)

---

## Scout AI

### Architecture

```
Client browser
  → POST /api/scout (streaming)
    → Server validates auth (getUser(), not getSession())
    → Loads project context from Supabase
    → Calls Claude API with streaming
    → Streams response back to client
    → On completion: saves both messages to scout_messages table
    → If edit brief detected: saves to scout_messages.edit_brief_md,
      creates notification for admin, sets project status to "revision"
```

### System Prompt Shape

```
You are Scout, a project assistant for Launchpad by bonfire labs.

Current project: {project_name} by {company_name}
Status: {status}
Type: {type}
PitchApp URL: {pitchapp_url || 'not yet built'}
Previous edit briefs: {count}

Your role:
- Help the client request edits to their PitchApp
- Translate vague requests into specific, actionable briefs
- Answer questions about their project status and the process
- Stay focused on this project — redirect off-topic questions

Your voice:
- Concise, direct, warm but not bubbly
- Lowercase. Short sentences. No exclamation marks.
- Use build/deploy/brief vocabulary naturally
- Never say "Sure!", "Of course!", "Absolutely!", "I'd be happy to!"
- No emoji

When the client has described changes they want:
1. Summarize the changes back to them
2. Ask if they want to submit the brief
3. When confirmed, output the brief in this format:

---EDIT_BRIEF---
# Edit Brief — {project_name}
## Requested Changes
1. **{change}** — {details}
---END_BRIEF---
```

### Streaming (Critical)

Vercel Hobby tier has a 10-second function timeout. Claude can take 5-15s. **Streaming is non-negotiable.**

Use the Anthropic SDK's streaming API → pipe chunks to the client via Server-Sent Events or the Vercel AI SDK streaming pattern.

### Scout Personality (from Copywriter)

See `tasks/launchpad-portal/portal-copy.md` for all 15 scenarios. Key examples:

- **First greeting:** "hey. i'm scout — your project assistant for {project name}."
- **Clear edit:** "got it. i'll draft a brief for the team: — {change}. anything specific?"
- **Vague request:** "i can work with that, but 'better' could mean a lot of things. help me narrow it down."
- **Brief submitted:** "brief submitted. the team will pick this up shortly."
- **Thank you:** "anytime. i'm here when you need changes."

---

## Design System

### Colors (match existing Launchpad)

```css
--color-bg:           #08080a;
--color-bg-card:      #111114;
--color-bg-raised:    #1a1a1e;
--color-text:         #eeeae4;
--color-text-muted:   #948f86;
--color-accent:       #c07840;
--color-accent-light: #e0a870;
--color-accent-dim:   #8a5628;
--color-border:       rgba(238, 234, 228, 0.08);
--color-success:      #28c840;
--color-warning:      #e0a020;
--color-error:        #c03030;
```

### Typography

```css
--font-display: 'Cormorant Garamond', serif;   /* headlines only */
--font-body:    'DM Sans', sans-serif;          /* all body text, UI */
--font-mono:    'JetBrains Mono', monospace;    /* terminal, Scout, code */
```

### Spacing (8px base)

```
4px  — tight (within components)
8px  — standard gap
16px — component padding
24px — section gap
32px — between card groups
48px — section padding (vertical)
64px — major section breaks
```

### Components to Build

| Component | Description |
|-----------|-------------|
| Terminal chrome | Traffic light dots + title bar (reuse from marketing page) |
| Status dot | Colored circle — green (live), amber (in build/revision), blue (review), gray (queued/hold) |
| Project card | Gradient header + status + company name + type tag + timestamp |
| Terminal input | Monospace, `$` prompt prefix, dark bg |
| Scout message | Terminal-style line, character-by-character reveal |
| Loading skeleton | Dark shimmer cards matching card dimensions |
| Toast | Minimal, bottom-right, auto-dismiss 4s |

### Animations

- Page transitions: fade (200ms)
- Card hover: 3D tilt (4deg, 800px perspective) — same as marketing page
- Scout typing: character-by-character, 15ms/char
- Status dot: subtle pulse on active states
- Skeleton loading: shimmer effect on `--color-bg-card`
- Film grain overlay: same as marketing page (CSS noise)

---

## Anti-Pattern Guard (from Harsh Critic)

### Never Do

| Pattern | Why | Instead |
|---------|-----|---------|
| Chat bubbles for Scout | Feels like Intercom | Terminal-style lines |
| "Welcome back, {name}!" banner | SaaS furniture | No greeting — the dashboard IS the greeting |
| Notification bell with count badge | Every app does this | Inline status glow on cards |
| Sidebar with icons | Feels like Linear clone | Minimal top nav |
| Emoji in UI | Cheapens the brand | Em dashes, arrows only |
| "Dashboard" in navigation | Generic | "mission control" |
| Loading spinner with "AI is thinking..." | Screams AI product | Typing indicator (three dots pulse) |
| Rounded avatar circles | Generic SaaS | Monogram squares or nothing |
| Gradient buttons | 2019 energy | Solid buttons, subtle hover states |
| Feature onboarding tour | Tooltip hell | Design so obvious it needs no tour |
| "Get started" CTA | Generic | "request a launchpad" |
| Toast for every action | Notification fatigue | Toasts only for async confirmations |

### Banned Words (in UI copy)

**Tier 1 — never use:** awesome, amazing, excited, leverage, streamline, empower, unlock, supercharge, revolutionize, game-changing

**Tier 2 — avoid:** simple, easy, seamless, powerful, robust, cutting-edge, next-gen, state-of-the-art

**Tier 3 — use sparingly:** help, support, manage, track (prefer: "see your projects" over "manage your projects")

### The Premium Test (from Critic)

Before shipping any screen, ask:
1. Could this screenshot appear in a Linear/Vercel design blog post?
2. Would a designer at a top studio respect this?
3. Does every pixel feel intentional, or are there lazy defaults?
4. If I removed all labels, could someone still navigate?
5. Does it feel like 3 people use it, or 3 million?

---

## State Machine

```
                    ┌──────────┐
                    │ on_hold  │
                    └────┬─────┘
                         │ reactivate
┌───────────┐    ┌──────▼──────┐    ┌──────────┐    ┌────────┐
│ requested │───▶│ in_progress │───▶│  review  │───▶│  live  │
└───────────┘    └─────────────┘    └──────────┘    └────────┘
                       ▲                 │
                       │                 ▼
                       │            ┌──────────┐
                       └────────────│ revision │
                                    └──────────┘
```

- **Client can trigger:** review → revision (only through Scout)
- **Admin triggers:** all other transitions
- **On hold:** can go to requested or in_progress

---

## Build Phases

### Phase 1: Auth + Dashboard + Preview (build first)

1. Scaffold `apps/portal/` with Next.js 14, TypeScript, Tailwind
2. Supabase setup: create 3 tables, RLS policies
3. Auth flow: magic link sign-in with terminal UI
4. Dashboard: project cards with status indicators
5. Project detail: iframe preview + status display
6. Admin view: all projects, status controls, URL input
7. Film grain, grid bg, card hover effects
8. Deploy to Vercel as separate project

### Phase 2: Scout AI + Edit Briefs (build second)

1. Scout chat UI (terminal-style panel)
2. Claude API integration with streaming
3. System prompt with project context injection
4. Edit brief detection and extraction
5. Brief storage + admin brief view
6. Auto status transition (review → revision on brief submit)
7. Notification creation on status changes

### Phase 3: Polish (if needed)

- Marketing page "sign in" link
- Email notifications for key events (Supabase email or Resend)
- Activity log / flight log on project detail
- Responsive refinements

---

## Security (from Code Reviewer)

| Rule | Implementation |
|------|---------------|
| Auth validation | `getUser()` not `getSession()` — server-side only |
| Admin check | Env var `ADMIN_EMAILS`, checked in API routes |
| API keys | `ANTHROPIC_API_KEY` server-side only, never exposed to client |
| RLS | All 3 tables have row-level security enabled |
| Scout injection | System prompt has guardrails, user input is message content only |
| Iframe | Configure PitchApp Vercel deployments to allow framing from portal domain |
| CORS | API routes only accept requests from portal domain |

---

## Cost Estimate (from Code Reviewer)

| Service | Monthly Cost |
|---------|-------------|
| Supabase (free tier) | $0 |
| Vercel (hobby or pro) | $0-20 |
| Claude API (5-20 users, light usage) | $5-15 |
| **Total** | **$5-35/month** |

---

## What NOT to Build (Consensus)

Every agent agreed on what to skip:

- No kanban board (status board is read-only, admin uses dropdowns)
- No file manager (materials links are text fields)
- No user avatars (monograms or nothing)
- No notification preferences page (5-20 users, just works)
- No analytics dashboard (check Vercel Analytics directly)
- No billing/payments (internal tool)
- No dark mode toggle (it's always dark)
- No onboarding wizard (design so obvious it's unnecessary)
- No public registration (invite-only, magic links sent by admin)
- No real-time WebSockets (polling on page load is fine at this scale)

---

## Open Decisions

1. **Portal URL:** Separate Vercel project → needs its own domain. Suggestion: `portal.launchpad-eight-eta.vercel.app` or a custom domain like `launchpad.bonfire.studio`

2. **Scout conversation model:** One continuous thread per project (recommended). Not discrete sessions.

3. **Client approval flow:** No formal "approve" button. Client tells Scout or admin. Admin sets to "live." Low-ceremony, high-trust.

4. **Supabase project:** Use the existing one (`gghsrjcvclcdtytfsitm.supabase.co`) with dedicated tables. No need for a separate project.

5. **User creation:** Admin creates users via Supabase dashboard or a simple admin form. Sends magic link invite.
