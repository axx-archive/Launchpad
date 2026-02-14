# Collaboration UX Vision

## Design Philosophy

Collaboration in Launchpad should feel like sharing a Google Doc link, not configuring a CRM. The mental model: **you have a project, you share it with people, they see it.** Minimal ceremony, no organizational overhead.

### Design Principles

1. **Share-first, not settings-first.** The share action is prominent and fast. You shouldn't need to visit a "settings" page.
2. **Sensible defaults.** Most shares are "let this person see and give feedback." Start there.
3. **No empty states that confuse.** A user with zero shared projects should never see an empty "shared with me" tab. Show it only when relevant.
4. **Progressive disclosure.** v1 is per-project sharing. Teams/orgs can come later without breaking the model.
5. **Terminal aesthetic.** All new UI follows the existing Launchpad design language: mono type, accent colors, subtle borders, terminal chrome.

---

## Roles

Three roles, each a strict superset of the previous:

| Role | See project | Use Scout | Upload files | Request edits | Approve/reject | Manage collaborators | Delete project |
|------|:-----------:|:---------:|:------------:|:-------------:|:---------------:|:--------------------:|:--------------:|
| **Viewer** | yes | read-only | no | no | no | no | no |
| **Editor** | yes | yes | yes | yes | no | no | no |
| **Owner** | yes | yes | yes | yes | yes | yes | yes |

**Why these three and not two:**
- **Viewer** covers the "share with my advisor / board member / client" case. They can see the PitchApp preview, read Scout conversation history, and view edit history -- but they can't change anything.
- **Editor** covers the "share with my co-founder" case. They can talk to Scout, upload brand assets, and request changes -- everything except approval gates and access management.
- **Owner** is the project creator. There is exactly one owner per project (v1). Ownership transfer is a future consideration.

**Simplification for v1:** We do NOT support changing ownership or having multiple owners. The creator is always the owner. This avoids complex edge cases around "last owner leaves."

---

## User Stories (Prioritized)

### P0 -- Must Have for v1

1. **As a project owner, I want to invite someone by email so they can access my project.**
   - Acceptance: Owner enters email, selects role (editor/viewer), clicks invite. Recipient gets an email with a link.

2. **As an invited user, I want to see shared projects on my dashboard so I can access them.**
   - Acceptance: Dashboard shows "shared with me" projects alongside own projects. Clear visual distinction.

3. **As a project owner, I want to see who has access to my project and remove people.**
   - Acceptance: Project detail page shows collaborator list. Owner can remove any collaborator.

4. **As an editor, I want to use Scout chat on shared projects so I can request changes.**
   - Acceptance: Editor opens shared project, sees full Scout interface, can send messages and upload files.

5. **As a viewer, I want to see the PitchApp preview and edit history so I can review progress.**
   - Acceptance: Viewer opens shared project, sees preview iframe, edit history, and read-only Scout conversation. Cannot send messages.

### P1 -- Important

6. **As a project owner, I want to set a project as "public link" so anyone with the URL can view the portal project page.**
   - Acceptance: Toggle in project settings. When enabled, generates a shareable `/p/{slug}` URL that shows a read-only project view (no auth required).

7. **As any collaborator, I want to see who else is on the project so I know who's involved.**
   - Acceptance: Collaborator avatars (or initials) visible on project card and project detail header.

8. **As a collaborator, I want to receive a notification when the project status changes.**
   - Acceptance: All collaborators get portal notifications for status transitions (e.g., "in build" -> "review").

### P2 -- Nice to Have

9. **As a viewer, I want to leave comments on specific sections so I can give targeted feedback.**
   - Separate feature; not part of v1 collaboration scope.

10. **As a project owner, I want to transfer ownership to another collaborator.**
    - Future feature. For v1, advise owners to re-create if needed.

---

## User Flows

### Flow 1: Inviting a Collaborator

**Entry point:** Project detail page, top-right area next to status badge.

```
1. Owner clicks [share] button (always visible to owners)
2. Share modal opens (TerminalChrome-styled overlay)
3. Modal shows:
   - Current collaborators list (avatar/email + role + remove button)
   - Invite section at bottom:
     $ email: [_______________]
     $ role:  [editor] [viewer]
     [invite]
4. Owner types email, selects role, clicks invite
5. System:
   a. If email matches existing Launchpad user:
      - Creates project_collaborator record immediately
      - Sends in-app notification + email notification
      - Toast: "invited {email} as {role}"
   b. If email does NOT match existing user:
      - Creates project_collaborator record with status "pending"
      - Sends email invitation (magic link to sign-in, then redirect to project)
      - Toast: "invitation sent to {email}"
6. Modal updates to show new collaborator in list
7. Owner closes modal
```

**Key decision: No accept/reject gate.** When you're invited, you have access immediately (for existing users). This matches the simplicity of Google Docs sharing. The invitation email is a notification, not a permission gate. For non-existing users, access activates when they create their account via the magic link.

### Flow 2: Dashboard with Shared Projects

**Current state:** Dashboard shows only `projects.user_id === currentUser.id`.

**New state:** Dashboard query includes projects where user is a collaborator.

```
Dashboard Layout:

  mission control                                    [+ new mission]

  3 active projects  |  2 shared with you

  [all] [my projects] [shared with me] [queued] [in build] [review] [live]

  $ search projects...

  +-----------+  +-----------+  +-----------+
  | Project A |  | Project B |  | Project C |
  | (owner)   |  | (shared)  |  | (owner)   |
  +-----------+  +-----------+  +-----------+
```

**Changes to dashboard:**
- Add "shared with me" count in header summary
- Add filter tabs: "my projects" and "shared with me" alongside status filters
- Shared project cards show a subtle "shared" indicator:
  - Small "shared" badge or different border treatment (e.g., left border accent)
  - Shows "via {owner name}" or the owner's email
  - Collaborator role shown as tiny badge (e.g., "editor" / "viewer")

**Important:** "shared with me" filter only appears when the user actually has shared projects. No empty tab for users with zero collaborations.

### Flow 3: Collaborator's Project View

**Editor view** -- nearly identical to owner view with these differences:
- No "approve" / "reject" action buttons (narrative approval, PitchApp approval)
- No "share" button (only owners can manage access)
- Scout chat is fully functional (can send messages, upload files, request edits)
- Brand assets panel is read/write (can upload new assets)
- Documents section is read/write (can upload materials)
- Project details section is read-only (cannot edit project name, type, etc.)

**Viewer view** -- read-only overlay:
- PitchApp preview is visible and interactive (can scroll the iframe)
- Scout chat shows full conversation history but input is disabled
  - Input area replaced with: "you have view access. contact the owner to request edit access."
- Edit history is visible (read-only)
- Brand assets are visible (thumbnails) but no upload
- Documents are visible but no upload
- Pipeline activity is visible
- Progress timeline is visible
- No approval actions

**Visual indicator:** Both editors and viewers see a subtle banner or badge in the nav/header area:
```
launchpad ---- series a deck                    [editor] sign out
```
The role badge is small, mono, muted -- just enough context.

### Flow 4: Removing a Collaborator

```
1. Owner opens share modal
2. Clicks [x] or [remove] next to collaborator's email
3. Confirmation: "remove {email}? they'll lose access immediately."
4. Confirms
5. Record deleted, access revoked
6. Removed user gets a notification: "you were removed from {project name}"
7. If they're currently viewing the project, next action shows "access denied" state
```

### Flow 5: Inviting a Non-Existing User

```
1. Owner invites "newperson@company.com"
2. System creates pending collaborator record
3. Email sent: "You've been invited to view {project name} on Launchpad"
   - Email contains magic link to /sign-in?redirect=/project/{id}
4. Recipient clicks link, arrives at sign-in
5. Enters email, gets magic link (standard Launchpad auth)
6. On first login, middleware checks for pending collaborator records
7. User is created, pending record activates
8. User lands on the project page directly
```

**Important:** The `isAllowedUser()` check in middleware must be extended. Currently it checks `ALLOWED_DOMAINS` and `ALLOWED_EMAILS`. We need to also allow users who have pending/active collaborator invitations.

---

## UI Component Inventory

### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `ShareModal` | Project detail, triggered by [share] button | TerminalChrome-styled modal for managing collaborators |
| `CollaboratorList` | Inside ShareModal | List of current collaborators with role + remove |
| `InviteForm` | Inside ShareModal | Email input + role picker + invite button |
| `RoleBadge` | Nav bar, project cards | Tiny mono badge showing "owner" / "editor" / "viewer" |
| `SharedBadge` | ProjectCard | "shared" indicator on dashboard cards |
| `CollaboratorAvatars` | Project detail header | Stacked initials/avatars of collaborators |

### Modified Components

| Component | Change |
|-----------|--------|
| `Nav` | Add role badge when viewing shared project |
| `ProjectCard` | Add shared indicator, collaborator initials, "via {owner}" |
| `DashboardClient` | Add "my projects" / "shared with me" filter, modified query |
| `ProjectDetailClient` | Add share button, role-based UI gating, collaborator avatars |
| `ScoutChat` | Accept `readOnly` prop, disable input for viewers |
| `BrandAssetsPanel` | Already has `readOnly` prop -- wire to viewer role |
| `FileUpload` | Disable for viewers |
| `ApprovalAction` | Hide for non-owners (already checks `isOwner`) |
| `NarrativeApproval` | Hide for non-owners (already checks `isOwner`) |

### Design Language for New Components

All new components follow existing Launchpad patterns:
- **ShareModal:** `TerminalChrome` wrapper with backdrop blur overlay
- **Invite input:** Same `$ email: [___]` pattern as sign-in and new project forms
- **Role selector:** Same pill-button pattern as project type selector (`aria-pressed`, accent on active)
- **Collaborator list:** Same `DetailRow`-like pattern with mono text, muted labels
- **Remove button:** `text-text-muted/40 hover:text-error` transition, small [x]

---

## Product Decisions

### Q: Teams/organizations or per-project sharing?
**A: Per-project sharing only (v1).** Organizations add significant complexity (billing, group permissions, member management) with low value for the current user base. Per-project sharing covers all current use cases. If teams become needed, they can be layered on top without breaking the per-project model.

### Q: Should public projects be discoverable?
**A: No. "Public" means accessible via direct link only.** There is no project directory or search. A "public link" is simply a URL you can send to anyone -- they see a read-only project view without needing to log in. Think "unlisted YouTube video," not "public GitHub repo."

### Q: How does collaboration interact with Scout chat?
**A: Single shared conversation.** All collaborators (editors + owner) share one Scout thread. Messages show who sent them (currently Scout only shows "you" vs "scout" -- we'd add the sender's name/email for multi-user clarity). Viewers see the full history but cannot send messages.

**Future consideration:** If simultaneous chatting causes confusion, we could add a "typing" indicator or simple message attribution. But for v1, the shared thread is simpler and more useful than per-user threads.

### Q: Who can trigger builds? Who can approve?
**A: Only owners approve. Editors can request changes (via Scout), which queues work. Build triggers remain admin-only (pipeline automation).** The approval flow (narrative review, PitchApp review) stays owner-only because these are high-stakes decisions ("yes, go live with this").

### Q: Notification model?
**A: Lightweight, in-app + email for invitations.**
- **Invitations:** Email + in-app notification
- **Status changes:** In-app notification to all collaborators (uses existing `notifications` table)
- **Scout activity:** No notifications for individual messages (too noisy). Rely on status change notifications.
- **Edit briefs submitted:** In-app notification to owner only

### Q: Can editors invite others?
**A: No, owners only (v1).** This prevents permission creep and keeps the access model simple. If an editor wants to add someone, they ask the owner.

---

## Dashboard Information Architecture

### Current
```
/dashboard          -> all user's projects
/dashboard/new      -> create project
/project/{id}       -> project detail
```

### With Collaboration
```
/dashboard          -> user's projects + shared projects (tabbed)
/dashboard/new      -> create project (unchanged)
/project/{id}       -> project detail (role-gated UI)
```

No new routes needed. The collaboration UI lives within existing pages:
- Dashboard gains filter tabs
- Project detail gains share modal + role-based rendering
- No separate "shared" page or "team" page

---

## Minimal v1 Scope

To ship something complete that feels right:

**Must build:**
1. Share button + modal on project detail (owner only)
2. Invite by email (existing user: instant access, new user: pending + email)
3. Dashboard "shared with me" filter tab
4. Role-based UI gating on project detail (viewer = read-only, editor = full Scout)
5. Collaborator list in share modal with remove capability
6. In-app notifications for invitations and status changes

**Explicitly NOT in v1:**
- Public link sharing (P1 feature, clean follow-up)
- Collaborator avatars on cards (nice polish, not essential)
- Comments/annotations on sections
- Teams/organizations
- Ownership transfer
- Activity feed / audit log
- Real-time presence ("AJ is viewing")

---

## Interaction Sketches

### Share Button Placement (Project Detail Header)

```
  <- mission control

  Series A Deck
  [*] review  [investor pitch]  submitted 2d ago      [share]
```

The [share] button sits at the right edge of the header, aligned with the status line. It uses the same border/accent style as the "+ new mission" button:
```css
font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px]
hover:border-accent/50 hover:bg-accent/5
```

### Share Modal

```
+--- share: series a deck -------------------------------------------+
|                                                                      |
|  collaborators                                                       |
|                                                                      |
|  aj@bonfire.tools              owner                                 |
|  sarah@company.com             editor    [x]                         |
|  investor@vc.com               viewer    [x]                         |
|                                                                      |
|  ---                                                                 |
|                                                                      |
|  $ email: [________________________]                                 |
|  $ role:  [editor] [viewer]                                          |
|                                                                      |
|  $ invite                                                            |
|                                                                      |
+----------------------------------------------------------------------+
```

### Dashboard Card (Shared Project)

```
+-----------------------------------------+
|  [*] in build                  [shared]  |
|                                          |
|      *                                   |
|                                          |
|  Series A Deck                           |
|  Acme Corp                               |
|  [investor pitch]  2d ago                |
|  via aj@bonfire.tools  |  editor         |
+-----------------------------------------+
```

The "shared" badge is a subtle monospace label in the top-right of the card gradient area. The "via" line replaces empty space in the card footer.

### Read-Only Scout (Viewer)

```
+--- scout -------------------------------------------------------+
|                                                                    |
|  scout: hey. i'm scout -- your project assistant for Series A.     |
|                                                                    |
|  you: walk me through my pitchapp                                  |
|                                                                    |
|  scout: sure. here's what we built...                              |
|                                                                    |
|  ---                                                               |
|                                                                    |
|  [you have view access. ask the owner for edit access.]            |
|                                                                    |
+------------------------------------------------------------------+
```

The input area is replaced with a muted informational line. No input field, no attachment button. Clean and clear about why.

---

## Open Questions for Tech Lead

1. **RLS policy design:** How should the new `project_collaborators` table's RLS interact with the existing `projects` RLS? Should we add a join-based policy to `projects` or handle collaboration access in the API layer?

2. **Middleware allowlist extension:** `isAllowedUser()` currently checks env vars. Should we extend it to check for pending invitations in the database, or handle the "invited but not yet allowed" case differently?

3. **Scout message attribution:** Currently `scout_messages.role` is "user" | "assistant". For multi-user Scout, do we add a `sender_id` column, or is it sufficient to infer from `created_at` timing?

4. **Notification delivery:** The existing `notifications` table supports per-user notifications. For collaboration notifications, do we fan out (one row per collaborator) or add a "project notification" concept?

---

## Summary

The collaboration feature is designed to be minimal but complete. It adds sharing without adding complexity. The core insight: **Launchpad's existing UI patterns (terminal chrome, mono type, accent pills) already support the collaboration UX naturally.** The share modal is just another terminal-styled overlay. The role badge is just another mono label. The dashboard filter is just another pill button.

No new pages. No new navigation paradigm. Just: you can share your project with people now.
