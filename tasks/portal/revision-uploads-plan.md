# Revision-Time Uploads — Implementation Plan

## Executive Summary

During revision mode, founders need to upload new images and documents alongside their feedback to Scout. Currently, Scout is text-only and the Brand Assets panel is disconnected from the chat flow — there's no integrated path from "I have a better hero image" to that image landing in the right section of the PitchApp.

This plan adds **chat-native file uploads** to Scout during revision, with smart pipeline integration so uploaded assets flow through to the auto-revise build agent.

---

## Current Architecture (Baseline)

### Storage

| System | Bucket | DB Table | Per-file | Per-project | Max files |
|--------|--------|----------|----------|-------------|-----------|
| Brand assets | `brand-assets` | `brand_assets` | 20MB | 25MB | 20 |
| Documents | `documents` | _(none — storage only)_ | 25MB | 25MB | 10 |

### Pipeline Data Flow (Brand Assets)

```
User uploads → Supabase Storage (brand-assets bucket) + brand_assets DB row
       ↓
auto-pull (CLI) → downloads to tasks/{name}/brand-assets/{category}/{file}
       ↓
auto-build-html / auto-revise → scans local dir → builds assetManifest string
       ↓
Claude agent calls copy_brand_asset(source, dest) → copies to apps/{name}/images/
       ↓
Agent calls write_file to update HTML with image references
```

### Scout Tools (Current)

`read_document`, `get_section_detail`, `list_edit_briefs`, `submit_edit_brief`, `submit_narrative_revision`, `view_screenshot`

No upload capability. No brand asset awareness. No file attachment mechanism.

### Edit Brief Schema (Current)

```ts
{ section_id: string, change_type: string, description: string, priority?: string }
```

No `attachments` field. Change types: `copy`, `layout`, `animation`, `design`, `content`, `reorder`, `add`, `remove`.

---

## Recommended UX: Chat-Native Uploads

### The Interaction Model

Uploads happen **inside Scout's chat** — not in a separate panel. The user attaches a file to their message, Scout sees it, and packages it into the edit brief.

### Input Area Changes

Current:
```
$ describe what you'd like to change...                    [→]
```

Revision mode:
```
[+] $ describe what you'd like to change...                [→]
```

The `+` button (24x24, `text-text-muted/40 hover:text-accent`) opens the native file picker. On mobile, this triggers the OS picker (includes camera roll).

### File Staging

After selecting a file, it appears as a **staged chip** between messages and input:

```
┌──────────────────────────────────────────────┐
│ [jpg] hero-photo.jpg    2.1MB           [×]  │
└──────────────────────────────────────────────┘
[+] $ use this for the hero section            [→]
```

- Up to 3 files can be staged at once
- Placeholder changes to `"what should i do with this?"` when files are staged
- Message text is optional — user can send just the file

### Drag-and-Drop (Desktop Only)

Dragging a file over the Scout chat area shows a dashed overlay:

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│       $ drop to attach            │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

Style: `border-accent/30 bg-accent/5` (matches BrandAssetsPanel drop zone). Hidden on `pointer: coarse` (mobile).

### Upload Progress (Inline)

The file appears inside the user's message with a progress bar:

```
you: use this for the hero section
     [jpg] hero-photo.jpg  ████░  82%
```

On completion:
```
you: use this for the hero section
     [jpg] hero-photo.jpg  2.1MB  ✓
```

Images show a 48x48 thumbnail on completion (desktop only).

### Scout's Response

Scout sees the uploaded image (via Claude vision) and responds contextually:

```
scout: nice — warm sunset tones. i'll swap this in as the hero background
and adjust the overlay gradient to match. submitting the edit brief now.

  ✓ brief submitted: update hero image
```

For ambiguous uploads (no message text):
```
scout: nice image. where would you like me to use this? some options:
  → hero background
  → team section
  → the "our approach" card gallery

or describe what you had in mind.
```

For batch uploads (5 photos, 2 described):
```
scout: got it — 5 images uploaded. i placed the team photo in section 6
and the product shot in the hero. for the other three — any preferences,
or should i include them as options for the build team?
```

### Document Uploads

Same mechanism — Scout adapts by file type:

```
user: [uploads Q4-financials.pdf] pull the new ARR numbers from page 3

scout: reading your document...
scout: got it. from page 3:
  → ARR: $4.2M (was $2.8M in the current narrative)
  → MRR: $350K (was $230K)

i'll submit a revision to update the traction section. sound right?
```

---

## Technical Architecture

### Approach: Two-Step Upload + Message

1. User selects file → upload via existing `uploadFileViaSignedUrl` to `brand-assets` bucket → get back storage reference + `brand_assets` DB row
2. User sends chat message with file reference(s) attached in the POST body
3. Scout sees attachments as context, processes with vision (images) or text extraction (docs)
4. Scout generates edit brief with `asset_references` linking files to changes

This keeps the SSE streaming path clean and reuses proven upload infrastructure.

### Data Model Changes

#### 1. `brand_assets` table — add `source` and `linked_message_id`

```sql
ALTER TABLE brand_assets
  ADD COLUMN source TEXT NOT NULL DEFAULT 'initial'
    CHECK (source IN ('initial', 'revision')),
  ADD COLUMN linked_message_id UUID REFERENCES scout_messages(id);
```

Revision uploads are tagged `source = 'revision'` and linked to the Scout message that referenced them.

#### 2. `scout_messages` table — add `attachments` JSONB

```sql
ALTER TABLE scout_messages
  ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
```

Shape:
```ts
interface MessageAttachment {
  asset_id: string;       // brand_assets.id
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
}
```

#### 3. Edit brief schema — add `asset_references` to changes

```ts
interface EditChange {
  section_id: string;
  change_type: string;  // add: "image_swap", "image_add"
  description: string;
  priority?: string;
  asset_references?: {   // NEW
    asset_id: string;
    intent: string;      // "replace_background" | "add_to_section" | "reference"
    file_name: string;
  }[];
}
```

Backward-compatible — existing consumers ignore unknown fields.

### New/Modified Scout Tools

#### New: `list_brand_assets`

Returns categorized list of all brand assets for the project, including recently uploaded revision assets marked with "NEW".

#### Modified: `submit_edit_brief`

Accept optional `asset_references[]` per change. Scout generates these when the user's message includes file attachments + section intent.

### Pipeline Changes

#### `handleAutoRevise` — add brand asset re-pull

**Critical gap:** `handleAutoRevise` does NOT re-download brand assets. It assumes they're on disk from the initial build. New revision uploads would be invisible to the revise agent.

Fix: Add ~30 lines at the top of `handleAutoRevise` to query `brand_assets` table and download any files not already on disk to `tasks/{name}/brand-assets/`.

#### Brief rendering — include asset references

When `handleAutoRevise` builds the revision prompt from edit briefs, include asset references so the agent knows which file to `copy_brand_asset` for each change.

### API Changes

#### Modified: `POST /api/scout`

Accept `attachments` alongside `message` in the request body:

```ts
interface ScoutRequest {
  project_id: string;
  message: string;
  attachments?: MessageAttachment[];  // NEW
}
```

The route stores attachments on the `scout_messages` row and includes them as context (image URLs or text content) when building the Claude API request.

#### No new upload endpoint needed

File uploads reuse the existing `POST /api/projects/{id}/brand-assets` endpoint with a new `source: 'revision'` field.

---

## New Components

### `ChatAttachmentButton`

The `+` button in the Scout input area. Opens native file picker. Only visible during `review` and `revision` statuses.

### `StagedFiles`

Staged file chips between messages and input. Shows filename, size, remove button. Max 3 files.

### `MessageAttachment`

Inline attachment display within a user message bubble. Shows file type icon, name, progress bar (during upload), thumbnail (after completion for images).

---

## Edge Cases and Mitigations

### HIGH — Must fix before shipping

| Issue | Risk | Mitigation |
|-------|------|------------|
| **Upload during active auto-revise** | New assets invisible to running job — silent data loss | Gate pattern: accumulate briefs + uploads, only start revise when user signals "done" or after 15-min cooldown |
| **Concurrent revise jobs** | Two auto-revise jobs on same project overwrite each other | Project-level lock: check for running jobs before claiming new ones for same project |
| **Storage RLS too permissive** | Any authenticated user can upload to any project's storage | Tighten storage INSERT policy to check project ownership via `storage.foldername` |

### MEDIUM — Address in implementation

| Issue | Risk | Mitigation |
|-------|------|------------|
| **No upload-completion gate** | Revise job starts before uploads finish | Brief accumulation pattern — auto-revise doesn't fire immediately, waits for batch |
| **Storage cleanup on project deletion** | FK CASCADE deletes DB rows but not storage objects | Add cleanup function (cron or trigger) for orphaned storage files |
| **Edit brief backward compatibility** | Old consumers break on new fields | `asset_references` is optional — additive, not breaking |

### LOW — Track for later

| Issue | Risk | Mitigation |
|-------|------|------------|
| **File naming at filesystem level** | Timestamp-prefixed names confuse Claude | Maintain display_name → storage_path manifest |
| **Large base64 in Claude context** | Vision images consume tokens | Budget-aware loading, same as `loadMaterialsAsContentBlocks` |
| **25MB shared budget** | Initial assets consume all space | Start shared, increase per-project if needed |

---

## Implementation Phases

### Phase 1: Infrastructure (1-2 days)

**Goal:** Pipeline can handle revision assets. No UX changes yet.

1. **Migration:** Add `source`, `linked_message_id` to `brand_assets`. Add `attachments` to `scout_messages`.
2. **Brand assets API:** Accept `source: 'revision'` parameter.
3. **Pipeline fix:** Add brand asset re-pull to `handleAutoRevise`.
4. **Brief schema:** Add `asset_references` support to `submit_edit_brief` tool.
5. **New Scout tool:** `list_brand_assets` — gives Scout awareness of uploaded assets.
6. **Project-level job lock:** Prevent concurrent `auto-revise` jobs on the same project.

After Phase 1, users can upload via the existing Brand Assets panel and reference assets in Scout chat. Scout can see what's been uploaded and include references in briefs. The pipeline correctly pulls new assets before revising.

### Phase 2: Chat-Native Uploads (3-4 days)

**Goal:** Upload files directly in the Scout chat flow.

1. **`ChatAttachmentButton`** — `+` icon in Scout input area (revision statuses only).
2. **`StagedFiles`** — file staging UI between messages and input.
3. **`MessageAttachment`** — inline attachment display in sent messages with progress.
4. **Drag-and-drop** — overlay on Scout chat area (desktop only).
5. **Scout API** — accept `attachments[]` in POST body, store on message, include in Claude context.
6. **Scout vision** — when message includes image attachments, send as vision content to Claude.
7. **Scout prompt updates** — system prompt includes guidance for handling uploaded files, proposing placements, handling ambiguity.

### Phase 3: Polish (1-2 days)

**Goal:** Premium feel, edge case handling.

1. **Brief accumulation** — batch briefs + uploads, auto-revise fires after cooldown or explicit "done" signal.
2. **Storage RLS** — tighten bucket policies to check project ownership.
3. **Mobile optimization** — touch targets, compact staging, no drag-drop on `pointer: coarse`.
4. **Error states** — inline error display for failed uploads, size limits, format restrictions.
5. **Budget display** — show upload usage breakdown (initial vs revision) in Brand Assets panel.

---

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `tasks/portal/migrations/011_revision_uploads.sql` | **New** — schema changes | 1 |
| `apps/portal/src/types/database.ts` | Add `source`, `linked_message_id` to BrandAsset type; add `attachments` to ScoutMessage | 1 |
| `apps/portal/src/app/api/projects/[id]/brand-assets/route.ts` | Accept `source` param | 1 |
| `apps/portal/src/lib/scout/tools.ts` | Add `list_brand_assets` tool, extend `submit_edit_brief` with `asset_references` | 1 |
| `apps/portal/src/lib/scout/context.ts` | Include brand asset list in system prompt | 1 |
| `scripts/cron/pipeline-executor.mjs` | Add re-pull to `handleAutoRevise`, add project-level job lock | 1 |
| `apps/portal/src/components/ChatAttachmentButton.tsx` | **New** — `+` button with file input | 2 |
| `apps/portal/src/components/StagedFiles.tsx` | **New** — staged file chips | 2 |
| `apps/portal/src/components/MessageAttachment.tsx` | **New** — inline attachment in messages | 2 |
| `apps/portal/src/components/ScoutChat.tsx` | Add attachment button, staging, drag-drop, send with attachments | 2 |
| `apps/portal/src/app/api/scout/route.ts` | Accept attachments in POST, include in Claude context | 2 |
| `apps/portal/src/lib/scout/knowledge.ts` | Update prompts for file handling guidance | 2 |

---

## Verification Checklist

### Phase 1
- [ ] `brand_assets` table has `source` and `linked_message_id` columns
- [ ] Upload via Brand Assets panel with `source: 'revision'` works
- [ ] Scout can call `list_brand_assets` and see uploaded files
- [ ] Scout can submit edit brief with `asset_references`
- [ ] `handleAutoRevise` re-pulls brand assets before starting
- [ ] Concurrent auto-revise jobs for same project are blocked
- [ ] TypeScript compiles clean

### Phase 2
- [ ] `+` button appears in Scout input during review/revision
- [ ] File staging shows chip with name, size, remove button
- [ ] Sending message with staged file uploads to brand-assets bucket
- [ ] Uploaded image appears inline in sent message with progress bar
- [ ] Scout sees uploaded image via vision and responds contextually
- [ ] Scout proposes section placement for uploaded images
- [ ] Drag-and-drop works on desktop, hidden on mobile
- [ ] Up to 3 files can be staged simultaneously
- [ ] File type/size validation with inline error display

### Phase 3
- [ ] Brief accumulation batches changes before auto-revise fires
- [ ] Storage RLS prevents cross-project uploads via direct Supabase access
- [ ] Mobile upload flow works from camera roll
- [ ] Budget display shows initial vs revision breakdown
- [ ] Error states for failed uploads don't break chat flow

---

## Design Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reuse `brand_assets` vs new table | Reuse with `source` column | Pipeline reads from one disk location; avoids duplicating infrastructure |
| Shared vs separate 25MB budget | Shared | Most projects use well under 25MB; separate budgets add complexity with no clear user benefit |
| Upload surface | Chat-native (not separate panel) | Keeps intent and action in the same place; matches "Scout as collaborator" vision |
| Upload mechanism | Two-step (presign → upload → send message with reference) | Keeps SSE streaming clean; reuses proven `uploadFileViaSignedUrl` pattern |
| Section targeting | Natural language (not dropdown) | Users think in "the hero" not "section 3"; Scout already understands section semantics |
| Revision gate | Brief accumulation with cooldown | Prevents race conditions without adding another status/button to the flow |
| Documents | Reuse `documents` bucket | Same pull mechanism already works; auto-narrative reads from `tasks/{name}/materials/` |
