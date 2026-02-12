# Launchpad Portal — Product Strategy

## 1. Product Vision

The Launchpad Portal is the private operations layer behind bonfire labs' PitchApp system. Today, a portfolio company founder sends materials → admin builds a PitchApp → founder gets a URL. That handoff happens over email, Slack, text — scattered and invisible. The portal makes it a curated, trackable experience.

**What it is:** A private dashboard where portfolio company founders track their PitchApp projects, preview builds, and request changes through Scout (an AI assistant powered by Claude).

**What it is NOT:** A SaaS product. Not a project management tool. Not a self-serve builder. It's a concierge experience with a glass-walled view into the kitchen.

**The feeling:** You just joined an exclusive program. You have a personal AI liaison. You can see your project moving. Everything feels intentional, quiet, and high-end. Think: members-only club dashboard, not Jira.

---

## 2. User Personas

### Persona 1: Portfolio Founder (Client)
- **Who:** CEO/founder of a bonfire portfolio company
- **Count:** 5-15 users
- **Tech comfort:** Moderate — uses Notion, Slack, Google Drive daily, not a developer
- **Goals:** Get their PitchApp built, review it, request edits, share the final URL
- **Frustration today:** No visibility into progress, edits happen over scattered messages, no central place to see their project
- **Portal expectation:** Check in occasionally, see status, preview builds, talk to Scout when they want changes

### Persona 2: Studio Admin (AJ)
- **Who:** bonfire labs founder/operator — builds PitchApps using Claude Code
- **Count:** 1 (maybe 2 eventually)
- **Tech comfort:** High — lives in the terminal, uses Claude Code, deploys to Vercel
- **Goals:** See incoming requests, update project statuses, deliver PitchApp URLs, handle edit requests efficiently
- **Frustration today:** Request form goes nowhere, project tracking is manual, edit requests come through random channels
- **Portal expectation:** Lightweight admin view — see what's active, update statuses, read Scout-generated edit briefs, respond when needed

---

## 3. User Journeys

### Journey A: New Client — First Request

```
1. Admin sends founder a magic link invite email
   → "You've been invited to Launchpad. Click to set up your access."

2. Founder clicks link → lands on portal sign-in page
   → Sees the Launchpad brand, enters email, gets magic link
   → Signs in — no password creation, just email verification

3. First-time dashboard (empty state)
   → Welcome message: "Welcome to Launchpad, [name]. Ready to build something?"
   → Single prominent CTA: "Start a new project"
   → Brief 3-step explainer of how the process works

4. New project intake
   → Terminal-style form (matches the Launchpad marketing page aesthetic)
   → Fields: project name, type (investor pitch, client proposal, product launch, other),
     target audience, link to materials, timeline preference, notes
   → Submit → project created with status "Requested"

5. Dashboard updates
   → Project card appears with "Requested" status
   → Founder sees: "We've received your request. You'll hear from us within 48 hours."

6. Admin sees the request in admin view
   → Picks it up → status changes to "In Progress"
   → Founder gets notification: "Your project is now in progress."
```

### Journey B: Returning Client — Review & Edit Cycle

```
1. Founder signs in (magic link or existing session)
   → Dashboard shows their project(s) with current status

2. Project is in "Review" status
   → Card shows: "Your PitchApp is ready for review"
   → Founder clicks → project detail page

3. Project detail page
   → Full-width iframe preview of the PitchApp (the actual Vercel URL)
   → Status timeline showing project progression
   → "Talk to Scout" button to open the AI chat

4. Founder opens Scout chat
   → Scout: "Hey [name]. I can see your PitchApp is ready for review.
     What would you like to change?"
   → Founder: "The hero section feels too corporate. Can we make it warmer?
     Also the team section — Sarah's title changed to CTO."
   → Scout: "Got it. I'll note two changes: (1) Warm up the hero copy and tone,
     (2) Update Sarah's title to CTO. Anything else?"
   → Founder: "That's it."
   → Scout: "Perfect. I've submitted your edit request. AJ will pick this up
     and you'll get a notification when the updates are ready."

5. Behind the scenes
   → Scout generates a structured .md edit brief from the conversation
   → Brief is stored in the database and visible to admin
   → Project status changes to "Revision"

6. Admin sees the edit brief
   → Reads the structured request, makes changes
   → Updates PitchApp URL (or same URL, content updated)
   → Sets status back to "Review"
   → Founder gets notification: "Edits are done — take another look."

7. Cycle repeats until founder approves
   → Founder: "This is perfect."
   → Admin sets status to "Live"
   → Founder gets notification: "Your PitchApp is live. Here's your URL."
```

### Journey C: Admin Daily Workflow

```
1. Admin opens portal (or receives notification)
   → Admin dashboard shows:
     - Active projects with statuses
     - Incoming requests (new submissions)
     - Pending edit briefs from Scout conversations

2. New request comes in
   → Admin reads the submission details
   → Clicks "Start" → status goes to "In Progress"
   → Builds PitchApp using Claude Code (outside the portal)

3. Build is ready
   → Admin enters the Vercel URL in the project
   → Sets status to "Review"
   → Founder gets notified automatically

4. Edit brief arrives (Scout-generated)
   → Admin reads the structured .md brief
   → Clear, actionable items — not a chat transcript
   → Makes changes → sets status back to "Review"

5. Founder approves
   → Admin sets to "Live"
   → Project moves to completed section
   → URL is permanent, founder can share anytime
```

---

## 4. Feature Map

### P0 — Must Ship in v1 (Core Loop)

| Feature | Description |
|---------|-------------|
| **Magic link auth** | Supabase Auth, passwordless sign-in, invite-only |
| **Client dashboard** | List of user's projects with status cards |
| **Project detail page** | Status timeline + iframe preview of PitchApp |
| **New project form** | Terminal-style intake form (mirrors marketing page) |
| **Project status system** | Full state machine with transitions (see Section 5) |
| **Admin dashboard** | View all projects, all users, incoming requests |
| **Admin status controls** | Update project status, add PitchApp URL |
| **Scout chat** | Claude API-powered AI assistant for edit requests |
| **Scout edit briefs** | Scout generates structured .md from conversations |
| **Admin edit brief view** | Read Scout-generated briefs, see conversation summary |
| **In-app notifications** | Bell icon with notification list (status changes, updates) |

### P1 — Important, Ship Soon After v1

| Feature | Description |
|---------|-------------|
| **Email notifications** | Magic link delivery + key status changes via email |
| **Admin notes/responses** | Admin can write back to client on a project |
| **Project history/activity log** | Timeline of all status changes, messages, briefs |
| **Multiple projects per user** | Support for founders with multiple portfolio companies or multiple PitchApps |
| **Scout conversation history** | View past Scout chats per project |

### P2 — Nice to Have, Can Wait

| Feature | Description |
|---------|-------------|
| **Marketing page form → portal** | Launchpad terminal form creates a project + sends magic link |
| **File attachments in Scout** | Share docs/images in Scout chat |
| **Scout proactive suggestions** | Scout can suggest improvements based on PitchApp analysis |
| **Analytics** | Basic view counts on PitchApp URLs (via Vercel Analytics or custom) |
| **Branding per project** | Custom accent colors per project to match their PitchApp theme |

### Explicitly NOT Building

| Feature | Reason |
|---------|--------|
| Self-serve PitchApp editor | PitchApps are hand-built — that's the value prop |
| Team/org management | 5-20 users. Admin manages directly in Supabase. |
| Billing/payments | Internal product. No billing needed. |
| Role-based permissions (granular) | Two roles: client and admin. That's it. |
| Public registration | Invite-only. No sign-up page. |
| Real-time collaboration | Not needed at this scale. Async is fine. |

---

## 5. State Machine — Project Statuses

### Statuses

```
┌────────────┐    ┌─────────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐
│ Requested  │───▶│ In Progress │───▶│  Review  │───▶│   Live   │    │ On Hold│
└────────────┘    └─────────────┘    └──────────┘    └──────────┘    └────────┘
                                          │  ▲
                                          ▼  │
                                     ┌──────────┐
                                     │ Revision │
                                     └──────────┘
```

### Status Definitions

| Status | Meaning | Who Sees What |
|--------|---------|---------------|
| **Requested** | Form submitted, waiting for admin | Client: "We've received your request" / Admin: new request in queue |
| **In Progress** | Admin is actively building the PitchApp | Client: "Your PitchApp is being built" / Admin: in active build |
| **Review** | Build/edit is done, waiting for client feedback | Client: "Ready for your review" + preview available / Admin: waiting on client |
| **Revision** | Client requested changes via Scout | Client: "Edit request submitted" / Admin: has edit brief to act on |
| **Live** | PitchApp is finalized and delivered | Client: "Your PitchApp is live" + permanent URL / Admin: completed |
| **On Hold** | Paused for any reason | Client: "Project paused" / Admin: deprioritized |

### Transition Rules

| From | To | Triggered By | What Happens |
|------|-----|-------------|--------------|
| Requested | In Progress | Admin clicks "Start" | Client notified, admin begins build |
| Requested | On Hold | Admin clicks "Hold" | Client notified with reason |
| In Progress | Review | Admin adds URL + clicks "Ready for Review" | Client notified, preview unlocked |
| Review | Revision | Client submits edits via Scout | Admin notified, edit brief created |
| Review | Live | Admin clicks "Mark Live" (after client verbal approval) | Client notified, project complete |
| Revision | In Progress | Admin clicks "Start Edits" | Client notified edits are underway |
| In Progress | Review | Admin finishes edits + clicks "Ready for Review" | Client notified, updated preview |
| On Hold | Requested | Admin reactivates | Client notified |
| On Hold | In Progress | Admin reactivates directly into build | Client notified |

### Client-Triggerable Transitions
- **Review → Revision**: Only through Scout chat (submitting an edit request)
- Clients cannot change statuses directly. They interact through Scout.

### Admin-Triggerable Transitions
- All other transitions are admin-only
- Admin has a simple status dropdown/buttons — no complex workflow UI

---

## 6. Notification Strategy

### In-App Notifications (P0)

Every notification appears in a notification panel (bell icon in the nav). Unread count badge.

| Event | Recipient | Message |
|-------|-----------|---------|
| Project created | Admin | "[Company] submitted a new request" |
| Status → In Progress | Client | "Your project is now in progress" |
| Status → Review | Client | "Your PitchApp is ready for review" |
| Status → Revision | Admin | "[Company] requested edits" |
| Status → Live | Client | "Your PitchApp is live — here's your URL" |
| Status → On Hold | Client | "Your project has been paused" |
| Admin note added | Client | "You have a new message from the Launchpad team" |
| Scout brief generated | Admin | "New edit brief from [Company]" |

### Email Notifications (P1)

Triggered alongside in-app, but only for high-signal events:

| Event | Email? | Why |
|-------|--------|-----|
| Magic link invite | Yes | Required for auth |
| Magic link sign-in | Yes | Required for auth |
| Status → Review | Yes | "Come look at your PitchApp" — the key moment |
| Status → Live | Yes | "Your PitchApp is live" — the celebration moment |
| Scout brief generated | Yes (to admin) | Admin may not be in the portal |
| All other transitions | No | In-app only — don't spam for internal tool |

### Notification Design Principles
- **Sparse, not noisy.** This is a 5-20 person tool. Every notification should feel meaningful.
- **No real-time requirement.** Polling or page-load fetch is fine. No WebSocket complexity needed.
- **Notifications are read-only.** Click a notification → go to the project. No inline actions.

---

## 7. Connecting the Pieces

### Launchpad Marketing Page → Portal

The static Launchpad page (apps/launchpad/) stays as-is. It's the public-facing showcase. Two connection points:

1. **Nav link:** Add a subtle "Sign In" link in the Launchpad nav bar → links to portal sign-in page (e.g., `portal.launchpad-app.com` or `launchpad-app.com/portal`)
2. **Terminal form (P2):** In a future version, the terminal form on the marketing page can create a real project in Supabase + trigger a magic link email. For v1, the form stays decorative (or sends an email notification to admin manually).

### Portal ↔ Static PitchApps

PitchApps are static sites deployed to their own Vercel URLs (e.g., `pitch-app-eight.vercel.app`). The portal doesn't host or build them — it just references their URLs.

**How it works:**
- Admin builds PitchApp externally (using Claude Code + Vercel)
- Admin enters the Vercel URL into the project record in the portal
- Portal renders the PitchApp in an iframe on the project detail page
- When PitchApp is updated (same URL, new deploy), the portal iframe automatically shows the latest version

**No deep integration needed.** The portal is the tracking/communication layer. PitchApp building remains the admin's domain.

### Scout → Edit Briefs → Admin

Scout is the bridge between client intent and admin action:

1. Client talks to Scout in natural language
2. Scout understands context (project details, current status, PitchApp type)
3. Scout generates a structured Markdown edit brief:
   ```markdown
   # Edit Brief — [Project Name]

   **Submitted by:** [Client Name]
   **Date:** 2026-02-12
   **Project status:** Review → Revision

   ## Requested Changes

   1. **Hero section tone** — Client feels the current copy is "too corporate."
      Wants warmer, more conversational language. Specifically the headline
      and subtitle.

   2. **Team section update** — Sarah Chen's title changed from "VP Engineering"
      to "CTO." Update in the team grid.

   ## Client Quotes
   > "The hero section feels too corporate. Can we make it warmer?"
   > "Sarah's title changed to CTO."

   ## Scout Assessment
   These are minor copy/content changes. Estimated effort: low.
   No structural or design changes requested.
   ```
4. Brief is stored in the database, visible in admin's project view
5. Admin reads the brief, acts on it, doesn't need to read chat transcripts

---

## 8. Scout AI — Design Philosophy

### What Scout Is
- A concierge, not a chatbot
- Speaks like a knowledgeable team member, not a customer service bot
- Has context on the project (name, type, status, PitchApp URL)
- Primary job: translate client intent into structured, actionable edit briefs
- Secondary job: answer questions about their project status and process

### What Scout Is NOT
- Not a PitchApp builder (doesn't generate code)
- Not a general-purpose AI (stays focused on the project)
- Not available 24/7 with instant turnaround (manages expectations — "the team will pick this up")

### Scout Behaviors

| Scenario | Scout Response |
|----------|---------------|
| Client asks for edits | Clarifies specifics, confirms understanding, generates brief |
| Client asks about status | Reads current status, explains what's happening |
| Client asks "when will it be done?" | Manages expectations honestly, doesn't promise timelines |
| Client goes off-topic | Gently redirects: "I'm best at helping with your PitchApp project — what would you like to change?" |
| Client approves | Acknowledges, suggests they let the admin know directly or Scout can note it |
| Client is frustrated | Empathetic, escalates: "I'll flag this for the team right away" |

### Scout System Prompt Shape (Directional)

Scout should have:
- Project context injected (name, company, status, type, PitchApp URL, past briefs)
- bonfire labs brand voice (confident, warm, not corporate)
- Clear guardrails (stay on topic, don't promise timelines, don't generate code)
- Edit brief generation capability (structured output when conversation concludes)
- A "submit" mechanism — Scout should ask "Should I send this to the team?" before creating the brief

### Chat UX
- Full-height chat panel on the project detail page (not a floating widget)
- Messages styled like a terminal/clean chat hybrid — dark theme, monospace accents
- Scout's messages have a subtle accent color indicator
- Client types naturally — no special formatting required
- "Submit edit request" button appears when Scout has drafted a brief

---

## 9. What Makes This Feel Premium

This is the difference between "a CRUD app with dark mode" and "a members-only portal." Every decision should reinforce exclusivity and craft.

### Atmosphere
- **The Launchpad loader:** Portal should have its own entry animation — not necessarily the rocket, but something cinematic. A brief, intentional transition.
- **Empty states are designed, not afterthoughts.** An empty dashboard isn't "No projects yet." It's a beautiful welcome with the Launchpad brand.
- **Ambient details:** Film grain overlay (matches marketing page), subtle grid backgrounds, the bronze accent used sparingly.

### Interactions
- **Terminal-inspired form.** The project intake form should feel like the Launchpad marketing page's terminal — `$` prompts, monospace type, option buttons, typing feedback.
- **Status cards, not tables.** Projects are cards with gradient headers (matching their PitchApp's accent color if possible), status dots, progress indicators.
- **Scout chat feels human.** No loading spinners with "AI is thinking..." — use a typing indicator that feels like a person typing.

### Language
- No "dashboard." It's your **Launchpad**.
- No "submit a ticket." It's **talk to Scout**.
- No "project management." It's **tracking your build**.
- No "admin panel." It's the **Mission Control** view.
- No generic placeholder copy. Every string should feel written by a human.

### Exclusivity Signals
- **Invite-only.** There's no sign-up page. You get a magic link from bonfire.
- **Personal greeting.** "Welcome back, [first name]" — not "Welcome to Dashboard."
- **Low-density UI.** Generous whitespace. No cramming. This isn't a productivity tool, it's an experience.
- **No feature bloat.** Fewer features, higher quality. Every interaction polished.

### What "NASA Mission Control" Means in Practice
- **Status boards, not lists.** Think large, readable status cards with clear indicators.
- **Data at a glance.** Admin should be able to scan the board and know what needs attention in 2 seconds.
- **Terminal aesthetics in the right places:** Scout chat, project intake form, status transitions. Not everywhere.
- **Clean typography hierarchy.** Big numbers, clear labels, muted secondary text.

---

## 10. Information Architecture

### Client View

```
/                     → Redirect to /dashboard or /sign-in
/sign-in              → Magic link sign-in (email input only)
/dashboard            → Project list (cards with status)
/project/[id]         → Project detail
  ├── Overview tab    → Status timeline, PitchApp preview (iframe), project details
  └── Scout tab       → AI chat interface
/notifications        → Notification list (or panel overlay)
```

### Admin View

```
/admin                → All projects board (grouped by status)
/admin/project/[id]   → Project detail (same as client, plus admin controls)
  ├── Overview tab    → Status controls, URL input, client info
  ├── Scout tab       → Read-only view of Scout conversations
  └── Briefs tab      → All edit briefs for this project
/admin/users          → User list (simple — name, email, project count)
```

### Shared
- Nav bar: logo, navigation, notification bell, user avatar/initial
- Admin sees a "Mission Control" toggle/link to switch to admin view
- No separate admin app — same portal, role-gated views

---

## 11. Data Model (Conceptual)

```
users
  - id (uuid)
  - email
  - full_name
  - role (client | admin)
  - avatar_url (optional)
  - created_at

projects
  - id (uuid)
  - user_id (FK → users, the client)
  - company_name
  - project_name
  - type (investor_pitch | client_proposal | product_launch | other)
  - status (requested | in_progress | review | revision | live | on_hold)
  - pitchapp_url (nullable — set by admin when build is ready)
  - target_audience
  - materials_link
  - timeline_preference
  - notes
  - created_at
  - updated_at

project_activity
  - id (uuid)
  - project_id (FK → projects)
  - actor_id (FK → users)
  - type (status_change | note | brief_generated | url_updated)
  - from_status (nullable)
  - to_status (nullable)
  - content (text — note content or brief markdown)
  - created_at

scout_conversations
  - id (uuid)
  - project_id (FK → projects)
  - created_at

scout_messages
  - id (uuid)
  - conversation_id (FK → scout_conversations)
  - role (user | assistant)
  - content (text)
  - created_at

edit_briefs
  - id (uuid)
  - project_id (FK → projects)
  - conversation_id (FK → scout_conversations, nullable)
  - content_md (text — the structured markdown brief)
  - status (pending | acknowledged | completed)
  - created_at

notifications
  - id (uuid)
  - user_id (FK → users)
  - project_id (FK → projects, nullable)
  - type (status_change | brief_ready | note_received | project_live)
  - title (text)
  - body (text)
  - read (boolean, default false)
  - created_at
```

---

## 12. v1 Scope — What Ships First

The v1 is the complete client loop: sign in → see projects → preview PitchApp → request edits via Scout → get notified.

### v1 Includes
1. Magic link auth (Supabase)
2. Client dashboard with project cards
3. Project detail page with iframe preview
4. Terminal-style new project form
5. Project status system (all 6 statuses)
6. Scout chat with Claude API
7. Scout edit brief generation
8. Admin dashboard (all projects view)
9. Admin status controls + URL input
10. Admin edit brief view
11. In-app notifications (bell icon + list)
12. Dark theme with Launchpad aesthetic

### v1 Explicitly Excludes
- Email notifications (P1 — add after core loop works)
- Marketing page form integration (P2)
- File attachments in Scout (P2)
- Analytics/view counts (P2)
- Per-project branding (P2)

### Success Criteria
- A portfolio founder can sign in, see their project, preview their PitchApp, and request edits through Scout — all without leaving the portal
- Admin can see all projects at a glance, read edit briefs, update statuses, and deliver URLs
- The experience feels premium and intentional, not like a hastily built internal tool
- Scout generates edit briefs that are clear enough for the admin to act on without reading the chat transcript

---

## 13. Open Questions for Team Discussion

1. **Portal domain/URL:** Subdomain (`portal.launchpad-eight-eta.vercel.app`) or path (`launchpad-eight-eta.vercel.app/portal`)? Since it's a separate Next.js app, likely a separate Vercel project with its own domain.

2. **Scout conversation model:** One ongoing conversation per project? Or discrete sessions (client can start a new chat each time)? Recommendation: **one continuous thread per project** with a "submit edit request" action that creates a brief. Simpler, matches the mental model.

3. **Client approval flow:** How does a client formally approve a PitchApp? Recommendation: **No formal button.** Client tells Scout or tells admin directly. Admin sets to "Live." Low-ceremony, high-trust — matches the boutique scale.

4. **Iframe security:** PitchApps are on separate Vercel URLs. Need to ensure they allow iframe embedding (check X-Frame-Options / CSP headers). May need to configure Vercel headers for PitchApp deployments.

5. **Supabase project:** The existing Supabase project at `gghsrjcvclcdtytfsitm.supabase.co` — is this shared with other projects or can the portal have its own schema? Recommendation: use the same project (it's a studio tool, keep infra simple) but with dedicated tables.

---

*This strategy is designed for a 5-20 person internal tool that feels like a $50M startup's private dashboard. Every feature serves the core loop: request → build → review → revise → live. Everything else waits.*
