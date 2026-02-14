# UI Components Design — Collaboration Feature

> Designed by UX/UI Developer agent
> Date: 2026-02-13
>
> **References:** UX vision (`ux-vision.md`), architecture research (`architecture-research.md`), existing portal components (`apps/portal/src/components/`)

---

## Design Language Reference

All new components follow the established Launchpad portal design system:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent` | `#c07840` | Interactive elements, labels, borders |
| `--color-bg-card` | `#111114` | Card/panel backgrounds |
| `--color-border` | `rgba(238,234,228,0.08)` | Default borders |
| `--color-text` | `#eeeae4` | Primary text |
| `--color-text-muted` | `#948f86` | Secondary text |
| `--color-error` | `#c03030` | Destructive actions |
| `--color-success` | `#28c840` | Confirmation feedback |
| `--font-mono` | JetBrains Mono | Labels, inputs, badges |
| Border radius | `rounded-[3px]` (buttons), `rounded-lg` (cards) | Consistent rounding |
| Section heading | `font-mono text-[11px] tracking-[4px] lowercase text-accent` | All section labels |
| Button style | `font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px]` | Primary action buttons |

---

## 1. ShareButton

### Where It Lives

`ProjectDetailClient.tsx` — in the header area, right side, aligned with the status/type badges. Only rendered when the current user's role is `owner`.

**Current header layout** (line 89-104 of ProjectDetailClient.tsx):
```
  <- mission control

  Series A Deck
  [*] review  [investor pitch]  submitted 2d ago
```

**New layout:**
```
  <- mission control

  Series A Deck
  [*] review  [investor pitch]  submitted 2d ago      [share]
```

### Props

```ts
interface ShareButtonProps {
  onClick: () => void;
}
```

### Visual Treatment

```
font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px]
hover:border-accent/50 hover:bg-accent/5 transition-all tracking-[0.5px]
```

Matches the existing `+ new mission` button style on the dashboard exactly.

### States

| State | Appearance |
|-------|-----------|
| Default | Accent text, thin accent border |
| Hover | Border intensifies to `accent/50`, background tints `accent/5` |
| Focus-visible | 2px accent outline, 3px offset (global `:focus-visible` style) |
| Disabled | N/A — button is simply not rendered for non-owners |

### Accessibility

- `aria-label="Share project"` (or `aria-label="Manage collaborators"`)
- Keyboard: Enter/Space triggers click
- Not rendered for non-owners (no `disabled` state needed, just omit)

### Mobile

- Full-width on small screens (below `sm:` breakpoint), stacks below status badges
- Same styling, touch target already meets 44px minimum with padding

---

## 2. ShareModal

### Where It Lives

Rendered as a portal overlay from `ProjectDetailClient.tsx` when `ShareButton` is clicked. Uses the `TerminalChrome` component as inner wrapper.

### Props

```ts
interface ShareModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}
```

### Structure

```
Backdrop (fixed inset-0, bg-bg/80 backdrop-blur-sm, z-60)
  └─ Centered container (max-w-lg mx-auto mt-[15vh])
       └─ TerminalChrome title="share: {projectName}"
            ├─ CollaboratorList
            ├─ Separator (border-t border-white/[0.06] my-4)
            └─ InviteForm
```

### Visual Treatment

**Backdrop:**
```
fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]
bg-bg/80 backdrop-blur-sm
```

**Container:**
```
w-full max-w-lg mx-6
```

The TerminalChrome wrapper provides the card styling, traffic light dots, and title. This matches the existing pattern used by `ApprovalAction`, `ProgressTimeline`, and `ScoutChat`.

### States

| State | Description |
|-------|-------------|
| Open (empty) | Shows owner as sole collaborator, invite form ready |
| Open (populated) | Shows all collaborators with roles, invite form below |
| Invite loading | Invite button shows "inviting..." + disabled state |
| Invite success | Toast appears ("invited {email} as {role}"), collaborator list updates |
| Invite error | Inline error below email input in `text-error` |
| Closing | Backdrop click or Escape key triggers `onClose` |

### Interaction Details

- **Open:** Triggered by ShareButton click
- **Close:** Click backdrop, press Escape, or click a close button in header
- **Focus trap:** When modal is open, Tab cycles through modal elements only
- **Body scroll lock:** `document.body.style.overflow = 'hidden'` on open, restore on close
- **Outside click:** Click on backdrop (not inner content) triggers close

### Keyboard

| Key | Action |
|-----|--------|
| Escape | Close modal |
| Tab | Cycle focus through modal elements |
| Shift+Tab | Reverse cycle |
| Enter | Submit invite form (when input focused) |

### Mobile

- Backdrop is full-screen; inner container takes `w-full mx-4`
- `pt-[10vh]` instead of `15vh` to allow more room
- TerminalChrome fills available width
- Remove button `[x]` gets larger touch target (`p-2`)

### Accessibility

- `role="dialog"` + `aria-modal="true"` on outer container
- `aria-labelledby` pointing to TerminalChrome title
- Focus trap (tabindex management)
- When closed, focus returns to the ShareButton that opened it
- `aria-live="polite"` region for invite success/error announcements

---

## 3. CollaboratorList

### Where It Lives

Inside `ShareModal`, above the separator line.

### Props

```ts
interface Collaborator {
  user_id: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'active' | 'pending';
}

interface CollaboratorListProps {
  collaborators: Collaborator[];
  currentUserId: string;
  onRemove: (userId: string) => void;
  isRemoving: string | null;  // userId being removed, for loading state
}
```

### Visual Treatment

Section label:
```
font-mono text-[11px] tracking-[4px] lowercase text-accent mb-3
```
Text: "collaborators"

Each row:
```
flex items-center justify-between py-2.5
```

**Left side:**
```
[Initial Circle]  email@domain.com
```

Initial circle: `w-6 h-6 rounded-full bg-accent/10 border border-accent/15 flex items-center justify-center font-mono text-[10px] text-accent uppercase`

Email: `font-mono text-[12px] text-text tracking-[0.5px]`

**Right side:**
```
[role badge]  [x]
```

Role badge: uses `RoleBadge` component (see below)

Remove button: `text-text-muted/30 hover:text-error transition-colors cursor-pointer text-[12px]` — renders as `[x]`

### States

| State | Description |
|-------|-------------|
| Owner row | Role shows "owner", no remove button (owner cannot be removed) |
| Active collaborator | Email + role badge + [x] remove |
| Pending collaborator | Email + role badge + "[pending]" label (muted) + [x] remove |
| Removing | Row fades to `opacity-50`, [x] disabled |
| Empty | Only owner row shown (no "empty state" needed — owner is always present) |

### Row Layout (Detail)

```
[A]  aj@bonfire.tools                          owner
[S]  sarah@company.com                         editor     [x]
[I]  investor@vc.com              [pending]    viewer     [x]
```

Pending label: `font-mono text-[10px] text-text-muted/40 tracking-[1px]`

### Interaction Details

- **Remove click:** Shows inline confirmation first — the `[x]` transforms to `[remove?]` in `text-error/60`. Second click confirms. Click away reverts. This avoids a full confirmation dialog (too heavy for this context).
- **Remove confirmed:** Optimistic UI — row immediately fades, then removes. If API fails, row reappears + Toast error.

### Mobile

- Email may truncate on narrow screens: `truncate max-w-[180px]`
- Remove button touch target: wrap in `p-2` for at least 44px tap area

### Accessibility

- List rendered as `<ul>` with `<li>` for each row
- Remove button: `aria-label="Remove {email} from project"`
- Pending status: `aria-label="{email}, pending invitation"`

---

## 4. InviteForm

### Where It Lives

Inside `ShareModal`, below the separator line and `CollaboratorList`.

### Props

```ts
interface InviteFormProps {
  projectId: string;
  onInvited: (collaborator: Collaborator) => void;
}
```

### Visual Treatment

**Email input row:**
```
$ email: [________________________]
```

The `$ email:` prefix uses: `text-accent text-[12px] select-none font-mono`

The input matches the existing search input pattern from `DashboardClient.tsx`:
```
flex items-center gap-0 rounded-[3px] border border-white/8 bg-bg-card px-3 py-2
focus-within:border-accent/30 transition-colors
```

Input field: `bg-transparent border-0 font-mono text-[12px] text-text outline-none placeholder:text-text-muted/30`

**Role selector row:**
```
$ role:  [editor] [viewer]
```

The `$ role:` prefix uses the same accent styling.

Role buttons use the pill-button pattern from filter tabs in `DashboardClient.tsx`:
```
font-mono text-[11px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px]
```

Active state: `border-accent/30 bg-accent/10 text-accent`
Inactive state: `border-white/6 text-text-muted/50 hover:border-white/12 hover:text-text-muted`

**Submit button:**
```
$ invite
```

Styled like the approve button in `ApprovalAction.tsx`:
```
w-full text-left px-4 py-3 rounded-[3px] border border-accent/30 bg-accent/8 text-accent
text-[12px] tracking-[0.5px] hover:bg-accent/15 hover:border-accent/50 transition-all cursor-pointer
disabled:opacity-50 disabled:cursor-not-allowed font-mono
```

### States

| State | Description |
|-------|-------------|
| Default | Empty email input, "editor" role selected by default |
| Email entered | Input shows email, invite button enabled |
| Role toggled | Active role pill highlighted, inactive dim |
| Submitting | Button text: "$ inviting...", disabled, input disabled |
| Success | Form resets, Toast confirmation, CollaboratorList updates |
| Error: invalid email | Inline error below input: "enter a valid email address" in `text-error text-[11px] font-mono mt-1` |
| Error: already invited | Inline error: "{email} already has access" |
| Error: API failure | Inline error: "something went wrong. try again." |

### Interaction Details

- **Default role:** "editor" is pre-selected (per UX vision: sensible defaults, most shares are "let this person help")
- **Email validation:** Basic client-side regex on blur + on submit. No autocomplete (v1 — autocomplete is P2)
- **Enter to submit:** When email input is focused, Enter submits if email is non-empty
- **After invite:** Form resets (email cleared, role back to editor), focus returns to email input

### Keyboard

| Key | Action |
|-----|--------|
| Tab | Email -> Editor pill -> Viewer pill -> Invite button |
| Enter (in email field) | Submit invite |
| Space (on role pill) | Toggle role |

### Mobile

- All elements stack naturally (already full-width)
- Role pills sit side-by-side (they're small enough for any screen width)
- Invite button is full-width

### Accessibility

- Email input: `<label>` linked via `htmlFor` (or visually hidden label with `aria-label`)
- Role buttons: `role="radiogroup"` with `role="radio"` + `aria-checked` on each pill
- Invite button: `aria-label="Send invitation"` (or the `$ invite` text is sufficient)
- Error messages: linked via `aria-describedby` on the input
- Live region for success/error announcements

---

## 5. RoleBadge

### Where It Lives

Used in multiple contexts:
1. `CollaboratorList` — next to each collaborator's email
2. `Nav` — in the top nav when viewing a shared project
3. `ProjectCard` — on shared project cards in the dashboard

### Props

```ts
interface RoleBadgeProps {
  role: 'owner' | 'editor' | 'viewer';
  size?: 'sm' | 'md';  // sm = cards/nav, md = collaborator list
}
```

### Visual Treatment

**Size `sm`** (default — used in nav and cards):
```
font-mono text-[9px] tracking-[1.5px] lowercase px-1.5 py-0.5 rounded-[2px]
border
```

**Size `md`** (used in collaborator list):
```
font-mono text-[10px] tracking-[1px] lowercase px-2 py-0.5 rounded-[2px]
border
```

**Color per role:**

| Role | Text | Background | Border |
|------|------|-----------|--------|
| owner | `text-accent` | `bg-accent/8` | `border-accent/15` |
| editor | `text-text-muted` | `bg-white/[0.04]` | `border-white/8` |
| viewer | `text-text-muted/60` | `transparent` | `border-white/[0.06]` |

The owner badge stands out (accent color), editor is neutral, viewer is intentionally subtle. This hierarchy matches importance: owners need to be visually distinguished.

### States

No interactive states — this is a display-only component. It renders a `<span>`.

### Accessibility

- `aria-label="Role: {role}"` for screen readers

---

## 6. SharedBadge

### Where It Lives

`ProjectCard.tsx` — in the top-right corner of the gradient/preview header area, opposite the StatusDot.

### Props

```ts
interface SharedBadgeProps {
  ownerEmail: string;
  role: 'editor' | 'viewer';
}
```

### Visual Treatment

**Badge in card header:**
```
absolute top-4 right-4 z-10
font-mono text-[9px] tracking-[1.5px] lowercase
text-text-muted/60 bg-bg/60 backdrop-blur-sm
px-2 py-1 rounded-[2px] border border-white/[0.06]
```

Text content: "shared"

**Footer addition (below existing footer):**

In the `ProjectCard` footer area (after the type badge and timestamp), add a new line:

```
via aj@bonfire.tools  |  editor
```

Styling:
```
font-mono text-[10px] text-text-muted/40 tracking-[0.5px]
```

The `|` separator: `text-text-muted/20 mx-2`
The role uses `RoleBadge` at `sm` size.

### States

| State | Description |
|-------|-------------|
| Not shared | Component not rendered |
| Shared (editor) | "shared" badge + footer with "via" line |
| Shared (viewer) | Same treatment, badge role shows "viewer" |

### Mobile

- Badge and footer text may truncate on narrow screens
- Email in "via" line: `truncate max-w-[140px]`

### Accessibility

- Badge: `aria-label="Shared project"` or role attribute
- Footer "via" line provides context about who shared it

---

## 7. CollaboratorAvatars

### Where It Lives

`ProjectDetailClient.tsx` — in the header area, between the status/type badges and the share button.

### Props

```ts
interface CollaboratorAvatarsProps {
  collaborators: Array<{
    email: string;
    role: 'owner' | 'editor' | 'viewer';
  }>;
  maxDisplay?: number;  // default 3
}
```

### Visual Treatment

Stacked circles showing initials of collaborators:

```
[A] [S] [+2]
```

Each circle:
```
w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center
font-mono text-[10px] uppercase -ml-2 first:ml-0
```

Color per role:
- Owner: `bg-accent/15 text-accent border-accent/20`
- Editor: `bg-white/[0.06] text-text-muted border-white/8`
- Viewer: `bg-white/[0.03] text-text-muted/60 border-white/[0.06]`

Overflow indicator (`+N`):
```
bg-bg-card text-text-muted/50 border-border
```

### States

| State | Description |
|-------|-------------|
| Solo (owner only) | Not rendered (no avatar stack for single user) |
| 2-3 collaborators | Show all circles |
| 4+ collaborators | Show first 3 + overflow `[+N]` |

### Hover Behavior

On hover over the avatar stack, show a tooltip listing all collaborators with their roles:

```
bg-bg-card border border-border rounded-md px-3 py-2 shadow-lg z-50
```

Content:
```
aj@bonfire.tools — owner
sarah@co.com — editor
investor@vc.com — viewer
```

Each line: `font-mono text-[11px] text-text-muted`
Role suffix: styled per role color (accent for owner, muted for others)

### Mobile

- Avatar stack moves below the title on narrow screens (stacks vertically)
- Tooltip becomes a tap-to-toggle dropdown instead of hover

### Accessibility

- Container: `role="group"` + `aria-label="Project collaborators"`
- Each avatar: `aria-label="{email} ({role})"`
- Overflow indicator: `aria-label="{N} more collaborators"`

---

## Modifications to Existing Components

---

## 8. ProjectCard Modifications

**File:** `apps/portal/src/components/ProjectCard.tsx`

### New Props

```ts
interface ProjectCardProps {
  project: Project;
  href: string;
  hasUnread?: boolean;
  // New:
  isShared?: boolean;
  ownerEmail?: string;
  userRole?: 'owner' | 'editor' | 'viewer';
}
```

### Changes

1. **SharedBadge in header area** — When `isShared` is true, render `SharedBadge` in the top-right corner of the gradient/preview area (opposite the StatusDot which is top-left).

2. **Footer "via" line** — When `isShared` is true, add a new row below the existing type/timestamp footer:

```tsx
{isShared && ownerEmail && (
  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04] mt-2">
    <span className="font-mono text-[10px] text-text-muted/40 truncate">
      via {ownerEmail}
    </span>
    <span className="text-text-muted/20">|</span>
    <RoleBadge role={userRole} size="sm" />
  </div>
)}
```

3. **No changes to existing card behavior** — tilt effect, gradient, preview iframe all stay the same.

### Card Visual (Shared vs Owned)

**Owned card (unchanged):**
```
+------------------------------------------+
|  [*] in build                             |
|          (gradient / preview)             |
|                                           |
|  Series A Deck                            |
|  Acme Corp                                |
|  [investor pitch]  2d ago                 |
+------------------------------------------+
```

**Shared card (new):**
```
+------------------------------------------+
|  [*] in build                   [shared]  |
|          (gradient / preview)             |
|                                           |
|  Series A Deck                            |
|  Acme Corp                                |
|  [investor pitch]  2d ago                 |
|  ---                                      |
|  via aj@bonfire.tools  |  editor          |
+------------------------------------------+
```

---

## 9. DashboardClient Modifications

**File:** `apps/portal/src/app/dashboard/DashboardClient.tsx`

### New Props

```ts
interface DashboardClientProps {
  projects: Project[];
  sharedProjects: ProjectWithRole[];  // NEW
  isAdmin: boolean;
}

interface ProjectWithRole extends Project {
  userRole: 'editor' | 'viewer';
  ownerEmail: string;
}
```

### Changes

1. **Header summary update** — Add shared count:

Current:
```
3 active projects
```

New:
```
3 active projects  ·  2 shared with you
```

The shared count: `font-mono text-[13px] text-text-muted/50 tracking-[0.5px]`
Separator dot: `text-text-muted/30 mx-2`

Only show the shared count when `sharedProjects.length > 0`.

2. **New filter tabs** — Add "my projects" and "shared with me" to the existing filter row:

```tsx
const OWNERSHIP_TABS = [
  { key: "all", label: "all" },
  { key: "mine", label: "my projects" },
  { key: "shared", label: "shared with me" },
];
```

These tabs sit in a new row ABOVE the existing status filter tabs:

```
[all] [my projects] [shared with me]

[all] [queued] [story review] [in build] [review] [live]
```

Same pill-button styling as existing status filters. "shared with me" tab only appears when `sharedProjects.length > 0`.

3. **Project grid** — Merge owned and shared projects into one grid, sorted by `updated_at`. Pass the `isShared`, `ownerEmail`, and `userRole` props to `ProjectCard` for shared projects.

### State Management

```ts
type OwnershipFilter = "all" | "mine" | "shared";
const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
```

Filtering logic:
- "all" → show both owned and shared projects
- "mine" → show only `projects` (owned)
- "shared" → show only `sharedProjects`

These combine with existing `statusFilter` and `search` filters.

---

## 10. ProjectDetailClient Modifications

**File:** `apps/portal/src/app/project/[id]/ProjectDetailClient.tsx`

### New Props

```ts
interface ProjectDetailClientProps {
  project: Project;
  initialMessages: ScoutMessage[];
  editBriefs: ScoutMessage[];
  userId: string;
  narrative: ProjectNarrative | null;
  // New:
  userRole: 'owner' | 'editor' | 'viewer';
  collaborators: Collaborator[];
}
```

### Changes

1. **Replace `isOwner` boolean** — Currently computed as `project.user_id === userId`. Replace all `isOwner` checks with `userRole === 'owner'`:

```ts
// Before
const isOwner = project.user_id === userId;
const showApproval = project.status === "review" && isOwner;

// After
const isOwner = userRole === 'owner';
const isEditor = userRole === 'editor';
const isViewer = userRole === 'viewer';
const canEdit = isOwner || isEditor;
const showApproval = project.status === "review" && isOwner;
```

2. **Share button in header** — Render `ShareButton` in the header's `flex items-start justify-between` container (right side), only for owners:

```tsx
{isOwner && (
  <ShareButton onClick={() => setShareModalOpen(true)} />
)}
```

3. **CollaboratorAvatars in header** — Show below the status line when there are collaborators beyond just the owner:

```tsx
{collaborators.length > 1 && (
  <CollaboratorAvatars collaborators={collaborators} />
)}
```

4. **ShareModal** — Rendered conditionally:

```tsx
{shareModalOpen && (
  <ShareModal
    projectId={project.id}
    projectName={project.project_name}
    isOpen={shareModalOpen}
    onClose={() => setShareModalOpen(false)}
  />
)}
```

5. **Role-based UI gating:**

| UI Element | Owner | Editor | Viewer |
|-----------|:-----:|:------:|:------:|
| Share button | visible | hidden | hidden |
| CollaboratorAvatars | visible | visible | visible |
| Scout chat (full) | yes | yes | no |
| Scout chat (read-only) | no | no | yes |
| Approval actions | yes | no | no |
| Narrative approval | yes | no | no |
| Brand assets (read/write) | yes | yes | no |
| Brand assets (read-only) | no | no | yes |
| File upload | yes | yes | no |
| Document upload | yes | yes | no |
| Edit history | visible | visible | visible |
| Preview iframe | visible | visible | visible |
| Progress timeline | visible | visible | visible |
| Pipeline activity | visible | visible | visible |
| Project details | visible | visible | visible |

6. **Role indicator in Nav** — Pass role to Nav for display:

```tsx
<Nav sectionLabel={project.project_name} userRole={userRole} />
```

---

## 11. Nav Modifications

**File:** `apps/portal/src/components/Nav.tsx`

### New Props

```ts
interface NavProps {
  sectionLabel?: string;
  isAdmin?: boolean;
  userRole?: 'owner' | 'editor' | 'viewer';  // NEW
}
```

### Changes

When `userRole` is provided and is NOT `owner`, show a `RoleBadge` in the nav:

```
launchpad ---- series a deck                    [editor] admin sign out
```

Placement: in the `ml-auto flex items-center gap-6` container, before the admin link.

```tsx
{userRole && userRole !== 'owner' && (
  <RoleBadge role={userRole} size="sm" />
)}
```

The role badge in the nav tells the user "you're viewing this as an editor/viewer" without taking up much space.

---

## 12. ScoutChat Modifications

**File:** `apps/portal/src/components/ScoutChat.tsx`

### New Props

```ts
interface ScoutChatProps {
  projectId: string;
  projectName: string;
  initialMessages: ScoutMessage[];
  projectStatus?: string;
  readOnly?: boolean;  // NEW — true for viewers
}
```

### Changes

When `readOnly` is true:

1. **Replace input area** — Instead of the textarea + send button, render an informational message:

```tsx
{readOnly ? (
  <div className="pt-3 mt-2 -mx-6 px-6">
    <div className="px-3 py-3 rounded-md border border-white/[0.06] bg-white/[0.02]">
      <p className="font-mono text-[11px] text-text-muted/40 tracking-[0.5px]">
        you have view access. ask the owner for edit access.
      </p>
    </div>
  </div>
) : (
  // existing input area
)}
```

2. **Disable suggested prompts** — Don't render prompt pills when `readOnly`.

3. **Disable attachment button** — Not rendered when `readOnly`.

4. **Disable drag-and-drop** — Don't attach drag handlers when `readOnly`.

5. **Message history remains fully visible** — Viewers can scroll through the entire Scout conversation.

6. **Export still available** — Viewers can export conversation history (read-only action).

### Visual Treatment

The read-only notice uses the same container styling as the input area but with a muted informational message. It's intentionally subtle — not a warning banner, just a quiet explanation.

---

## 13. BrandAssetsPanel Modifications

**File:** `apps/portal/src/components/BrandAssetsPanel.tsx`

### Existing `readOnly` Prop

The component already accepts a `readOnly` prop. Currently it's used when `project.status === "live" || project.status === "on_hold"`.

### Changes

Wire `readOnly` based on role in `ProjectDetailClient.tsx`:

```tsx
<BrandAssetsPanel
  projectId={project.id}
  readOnly={isViewer || project.status === "live" || project.status === "on_hold"}
/>
```

When `readOnly` is true, the component already:
- Hides upload areas
- Shows "brand assets used in this build" copy
- Disables delete buttons on slots

No changes needed to `BrandAssetsPanel.tsx` itself.

---

## 14. Dashboard Server Page Modifications

**File:** `apps/portal/src/app/dashboard/page.tsx`

### Changes

The server component must fetch both owned and shared projects:

```ts
// Owned projects (current query, unchanged — RLS filters to user's projects)
const { data: ownedProjects } = await supabase
  .from("projects").select("*").order("updated_at", { ascending: false });

// Shared projects (new query — via project_collaborators join)
// This requires the new project_collaborators table and updated RLS
const { data: sharedRaw } = await supabase
  .from("project_collaborators")
  .select("role, projects(*)")
  .eq("user_id", user.id)
  .neq("role", "owner");

// Transform to ProjectWithRole[]
const sharedProjects = (sharedRaw ?? []).map(row => ({
  ...row.projects,
  userRole: row.role,
  ownerEmail: row.projects.submitter_email ?? "unknown",
}));
```

Pass both arrays to `DashboardClient`:

```tsx
<DashboardClient
  projects={ownedProjects ?? []}
  sharedProjects={sharedProjects}
  isAdmin={admin}
/>
```

---

## 15. Project Detail Server Page Modifications

**File:** `apps/portal/src/app/project/[id]/page.tsx`

### Changes

After fetching the project, determine the user's role:

```ts
// Check if user is owner
if (project.user_id === user.id) {
  userRole = 'owner';
} else {
  // Check collaborator role
  const { data: membership } = await supabase
    .from("project_collaborators")
    .select("role")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) notFound(); // no access
  userRole = membership.role;
}

// Fetch collaborators list
const { data: collaborators } = await adminClient
  .from("project_collaborators")
  .select("user_id, role, status")
  .eq("project_id", id);
```

Pass to `ProjectDetailClient`:

```tsx
<ProjectDetailClient
  project={project}
  initialMessages={scoutMessages ?? []}
  editBriefs={editBriefs ?? []}
  userId={user.id}
  narrative={narrative}
  userRole={userRole}
  collaborators={collaborators ?? []}
/>
```

---

## 16. New API Routes Summary

These are the API routes needed to support the UI components:

### `GET /api/projects/[id]/members`

Returns collaborator list for the share modal.

**Response:**
```json
{
  "members": [
    { "user_id": "...", "email": "aj@bonfire.tools", "role": "owner", "status": "active" },
    { "user_id": "...", "email": "sarah@co.com", "role": "editor", "status": "active" },
    { "user_id": null, "email": "new@co.com", "role": "viewer", "status": "pending" }
  ]
}
```

### `POST /api/projects/[id]/invite`

Send invitation from the share modal's InviteForm.

**Request:**
```json
{
  "email": "sarah@company.com",
  "role": "editor"
}
```

**Response:**
```json
{
  "collaborator": { "email": "...", "role": "editor", "status": "active" | "pending" }
}
```

### `DELETE /api/projects/[id]/members/[userId]`

Remove a collaborator from the share modal's CollaboratorList.

---

## Responsive Behavior Summary

| Breakpoint | Behavior |
|-----------|----------|
| `< 640px` (mobile) | Share button full-width below title. Modal fills screen width with `mx-4`. Avatar stack wraps below status. |
| `640px - 1024px` (tablet) | Share button inline in header. Modal centered at 480px max-width. |
| `> 1024px` (desktop) | Full layout as described. Modal at max-w-lg. |

---

## Animation Details

| Element | Animation |
|---------|-----------|
| ShareModal backdrop | `opacity 0 -> 1`, 150ms ease-out |
| ShareModal content | `translateY(8px) -> 0` + `opacity 0 -> 1`, 200ms ease-out |
| ShareModal close | Reverse of open, 150ms |
| CollaboratorList row added | `opacity 0 -> 1` + `height 0 -> auto`, 200ms ease-out |
| CollaboratorList row removed | `opacity 1 -> 0` + `height auto -> 0`, 150ms ease-out |
| RoleBadge | No animation (static display) |
| SharedBadge | No animation (static display) |
| Toast (invite success) | Uses existing toast-in animation |

All animations respect `prefers-reduced-motion: reduce` — disable transitions and show instantly.

---

## TypeScript Types Summary

New types needed in `src/types/database.ts`:

```ts
export type CollaboratorRole = 'owner' | 'editor' | 'viewer';
export type CollaboratorStatus = 'active' | 'pending';

export interface ProjectCollaborator {
  id: string;
  project_id: string;
  user_id: string | null;       // null for pending invites to non-existing users
  email: string;
  role: CollaboratorRole;
  status: CollaboratorStatus;
  invited_by: string;           // user_id of who invited
  created_at: string;
  updated_at: string;
}

// Extended Project type for dashboard shared view
export interface ProjectWithRole extends Project {
  userRole: CollaboratorRole;
  ownerEmail: string;
}
```

---

## Component File Structure

```
src/components/
├── ShareButton.tsx          # NEW — simple button, ~15 lines
├── ShareModal.tsx           # NEW — modal with backdrop, ~120 lines
├── CollaboratorList.tsx     # NEW — member list with remove, ~80 lines
├── InviteForm.tsx           # NEW — email + role + submit, ~100 lines
├── RoleBadge.tsx            # NEW — tiny role label, ~25 lines
├── SharedBadge.tsx          # NEW — "shared" indicator for cards, ~15 lines
├── CollaboratorAvatars.tsx  # NEW — stacked initials, ~60 lines
├── ProjectCard.tsx          # MODIFIED — add shared props + SharedBadge + footer
├── Nav.tsx                  # MODIFIED — add optional role badge
├── ScoutChat.tsx            # MODIFIED — add readOnly prop + read-only input
└── ... (other existing components unchanged)
```

Estimated total: ~415 lines of new component code + ~50 lines of modifications to existing components. Intentionally lightweight — no complex state machines, no optimistic caching, no real-time presence.
