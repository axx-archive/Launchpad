# Launchpad Portal — Complete Copy Bible

---

## 1. Login Page

**Page title (browser tab):** launchpad — sign in

**Headline:**
```
mission control
```

**Subtext:**
```
sign in to manage your launchpad projects.
```

**Email input:**
- Label: `$ email:`
- Placeholder: `you@company.com`

**Submit button:**
```
launchpad --authenticate
```

**Magic link sent — confirmation screen:**

Headline:
```
check your inbox.
```

Body:
```
we sent a magic link to {email}.
click it to sign in — no password needed.
```

Subtext:
```
didn't get it? check spam, or try again.
```

Retry link: `send another link`

**Error states:**

| State | Copy |
|-------|------|
| Invalid email | `that doesn't look like an email.` |
| Rate limited | `too many attempts. try again in a few minutes.` |
| Magic link expired | `this link has expired. request a new one.` |
| Generic error | `something went wrong. try again.` |
| Account not found | `no account found for that email. reach out to the team if this is wrong.` |

---

## 2. Dashboard

**Page title (browser tab):** launchpad — dashboard

**Greeting:**
```
welcome back, {firstName}.
```

If no first name available:
```
welcome back.
```

**Page header label (eyebrow above greeting):**
```
mission control
```

**Subtext (below greeting):**
```
{count} active project{s}
```

If zero projects:
```
no active projects
```

### Empty State (no projects yet)

```
nothing on the pad yet.

submit a request on the launchpad site, or
reach out to the team to get started.
```

Button: `request a launchpad` (links to marketing site #request section)

### Project Cards

**Card anatomy:**
- Status badge (see Status Labels below)
- Project name (company/project title)
- Type tag (e.g., `investor pitch`, `client proposal`)
- Last updated timestamp
- Preview thumbnail or placeholder

**Card hover/CTA:** `open project`

### Notification Bell

**Empty state tooltip:** `no new notifications`

**With notifications badge:** `{count}` (number only, in badge)

**Notification panel header:** `notifications`

**Empty notification panel:**
```
all clear. nothing new.
```

**"Mark all read" link:** `mark all read`

---

## 3. Project Detail Page

**Page title (browser tab):** launchpad — {project name}

**Back link:** `← dashboard`

**Project header:**
- Project name (large)
- Status badge
- Type tag
- Submitted date: `submitted {date}`

### Preview Section

**Section header:** `preview`

**Subtext:** `your launchpad, live.`

**When PitchApp is ready:**
- Iframe with the live PitchApp
- Below iframe: `open in new tab` link

**When PitchApp is not ready (placeholder):**
```
your launchpad is being built.
you'll see a live preview here once it's ready.
```

### Scout Chat Section

**Section header:** `scout`

**Subtext:** `your project assistant.`

**Input placeholder:** `describe what you'd like to change...`

**Send button:** `send` (or arrow icon)

### Edit History Section

**Section header:** `edit history`

**Subtext:** `a record of every change.`

**Empty state:**
```
no edits yet. use scout to request changes.
```

**Edit entry anatomy:**
- Timestamp
- Brief description (from Scout's summary)
- Status: `submitted` / `in progress` / `applied`

---

## 4. Scout's Voice

### Core Personality

Scout is the AI assistant. Not a chatbot. Not a help desk. Think: the best project manager you've ever had — concise, capable, low-ego.

**Key traits:**
- Short sentences. Direct.
- Knows the system. Doesn't explain things that are obvious.
- Uses build/deploy/brief vocabulary naturally.
- Warm but not bubbly. Never uses exclamation marks excessively. One is the maximum, and it's rare.
- Lowercase-first where possible (matching launchpad brand voice).
- Never says "Sure!", "Of course!", "Absolutely!", "I'd be happy to!"
- Never uses emoji except the occasional → or —

### Scenarios

**4.1 — First greeting (user opens project chat for the first time):**

```
hey. i'm scout — your project assistant for {project name}.

i can help you request edits, check on progress, or answer questions about your launchpad. describe what you need and i'll get it queued.
```

**4.2 — User describes a clear edit ("I want the hero to be more dramatic"):**

```
got it. i'll draft a brief for the team:

— make the hero section more dramatic

anything specific? bigger type, different imagery, stronger language — or should i leave it open for the team to interpret?
```

**4.3 — User gives a vague request ("Can you make it better?"):**

```
i can work with that, but "better" could mean a lot of things. help me narrow it down:

— is it the copy? the visuals? the flow?
— is there a specific section that feels off?
— or is it more of a general vibe issue?

the more specific the brief, the faster the turnaround.
```

**4.4 — Scout asking a clarifying question:**

```
quick question before i write this up — when you say "simplify the metrics section," do you mean fewer numbers, or the same numbers with cleaner presentation?
```

**4.5 — Scout confirms it has generated an edit brief:**

```
brief submitted.

the team will pick this up shortly. you'll get a notification when the edits are live. anything else?
```

**4.6 — User sends something with nothing actionable:**

General chat / "how's it going":
```
all good on this end. your project is {status}.

if you need changes, just describe them and i'll get a brief to the team.
```

**4.7 — User says "thank you" or similar:**

```
anytime. i'm here when you need changes.
```

**4.8 — Scout acknowledges a new project submission:**

```
got your submission. the pipeline is spinning up — you'll see updates here as things progress.

in the meantime, if you have additional materials (decks, transcripts, notes), you can share them with me and i'll attach them to the project.
```

**4.9 — User asks about timeline:**

```
typical turnaround is a few days for the initial build, depending on complexity and the queue.

i'll keep you posted as things move. you'll get a notification when there's something to review.
```

**4.10 — User requests something outside Scout's scope (e.g., "Can you build me a website?"):**

```
that's outside what i can do here — i'm focused on your launchpad project.

for anything beyond pitch edits, reach out to the bonfire team directly.
```

**4.11 — User asks about the process:**

```
here's how it works:

1. you describe the changes you want
2. i write a brief for the build team
3. they make the edits
4. you review the updated preview

for bigger changes, there might be a round or two. i'll keep you in the loop.
```

**4.12 — User wants to change multiple things at once:**

```
i'll bundle these into one brief:

— update hero headline copy
— swap the background image in section 3
— add a new metrics section after the team grid

sound right? i'll submit once you confirm.
```

**4.13 — Scout reporting that edits are live:**

```
the latest edits are live. check the preview — you should see the updated {section/element}.

let me know if it landed the way you wanted, or if you want to adjust further.
```

**4.14 — User is frustrated or unhappy with the result:**

```
understood. let's fix it.

tell me what's not working and i'll get a revised brief over to the team. be as specific as you can — screenshots help if you have them.
```

**4.15 — User sends materials (links, files):**

```
got it. i've attached this to your project. the team will have access during the build.
```

---

## 5. Notification Copy

Each notification has a **title** (bold, one line) and **body** (supporting text).

| Event | Title | Body |
|-------|-------|------|
| Project submitted | `project received` | `your launchpad request for {project} has been received. the pipeline is spinning up.` |
| PitchApp ready for review | `ready for review` | `your launchpad for {project} is built. open the project to preview it.` |
| Edit brief received (by admin) | `new edit brief` | `scout generated a brief for {project}. review and assign.` |
| Edits applied | `edits are live` | `the latest changes to {project} are live. check the preview.` |
| Project is live (final) | `you're live` | `{project} is deployed and ready to share. your launchpad URL is active.` |
| Revision requested (admin → user) | `revision note` | `the team left a note on {project}. open the project to review.` |

---

## 6. Status Labels

Mission-control vocabulary. Lowercase. Short.

| Internal State | Display Label | Color Hint |
|----------------|---------------|------------|
| Submitted / requested | `queued` | neutral gray |
| In progress (being built) | `in build` | amber/yellow |
| Ready for user review | `review` | blue |
| User requested revisions | `revision` | amber/yellow |
| Final, deployed | `live` | green |
| On hold / paused | `hold` | dim gray |

**In narrative contexts** (notifications, Scout messages), use full phrases:
- "your project is queued"
- "the build is in progress"
- "ready for your review"
- "revision in progress"
- "you're live"

---

## 7. Empty States & Edge Cases

**No projects yet (dashboard):**
```
nothing on the pad yet.

submit a request on the launchpad site, or
reach out to the team to get started.
```
CTA: `request a launchpad`

**No notifications:**
```
all clear. nothing new.
```

**Scout conversation empty (before first message):**
Input placeholder: `describe what you'd like to change...`

Subtle hint text above input (optional):
```
ask scout to make changes to your launchpad, check status, or share materials.
```

**PitchApp not ready for preview:**
```
your launchpad is being built.
you'll see a live preview here once it's ready.
```

**Magic link expired:**
```
this link has expired.
```
CTA: `request a new link`

**Session expired (auto-redirect to login):**
Toast/banner:
```
your session has expired. sign in again.
```

**Server error / generic failure:**
```
something went wrong. try again, or reach out if it keeps happening.
```

**Network offline:**
```
you're offline. reconnect and try again.
```

**Scout is processing (loading state):**
Animated dots or subtle pulse. No text needed — just the typing indicator.

If it takes longer than expected (>10s):
```
still working on this — hang tight.
```

---

## 8. Microcopy

### Buttons & Actions

| Context | Label |
|---------|-------|
| Login submit | `launchpad --authenticate` |
| Send magic link again | `send another link` |
| Open project from dashboard | `open project` |
| Send message to Scout | `send` (or → icon) |
| Submit edit confirmation | `confirm & submit` |
| Open PitchApp in new tab | `open in new tab` |
| Back to dashboard | `← dashboard` |
| Request a launchpad (empty state CTA) | `request a launchpad` |
| Sign out | `sign out` |
| Notification: mark all read | `mark all read` |
| Copy PitchApp URL | `copy link` |
| Copy URL success | `copied` |

### Timestamps

Use relative time for recent, absolute for older:

| Age | Format |
|-----|--------|
| < 1 min | `just now` |
| < 60 min | `{n}m ago` |
| < 24 hours | `{n}h ago` |
| < 7 days | `{n}d ago` |
| >= 7 days | `feb 12, 2026` (lowercase month, no leading zero) |

### Loading States

| Context | Display |
|---------|---------|
| Dashboard loading | Skeleton cards (no text) |
| Project page loading | Skeleton layout (no text) |
| Scout thinking | Animated typing indicator (three dots pulse) |
| Preview iframe loading | Subtle spinner + `loading preview...` |
| Login processing | Button text changes to `authenticating...` |
| Sending message | Brief disabled state, no text change |

### Transitions

| Transition | Behavior |
|------------|----------|
| Login → magic link sent | Smooth crossfade, same container |
| Dashboard → project detail | Page navigation (standard route) |
| Scout message sent | Message appears immediately (optimistic), typing indicator for response |
| Edit brief submitted | Scout confirms inline, notification fires async |
| Status change | Badge color transitions smoothly (CSS transition) |

---

## 9. Page Footer (all pages)

```
launchpad by bonfire labs
```

No year, no copyright, no links. Clean and minimal.

---

## 10. Meta / SEO (portal pages)

These pages are behind auth, so SEO is minimal. But proper meta matters for browser tabs and link previews if URLs are ever shared.

**Login page:**
```html
<title>launchpad — sign in</title>
<meta name="description" content="Sign in to your Launchpad project portal.">
```

**Dashboard:**
```html
<title>launchpad — dashboard</title>
```

**Project detail:**
```html
<title>launchpad — {project name}</title>
```

---

## Voice Summary

| Attribute | Launchpad Portal Voice |
|-----------|----------------------|
| Case | Lowercase for all UI labels, headings, Scout messages |
| Tone | Confident, concise, warm but not bubbly |
| Punctuation | Periods over exclamation marks. Em dashes and arrows for structure. |
| Technical | Uses "build," "deploy," "brief," "pipeline," "queued" naturally |
| Personality | Like a great PM who respects your time |
| Emoji | None in UI. None from Scout. |
| Filler | Zero. No "just," "simply," "please note that" |
| Length | Shortest version that's still warm. If it can be one sentence, it's one sentence. |
