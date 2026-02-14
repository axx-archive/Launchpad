# Brand Assets Feature — Product Spec

## Problem

The Launchpad portal has a single file upload area ("documents") where clients upload materials for narrative extraction — pitch decks, transcripts, research reports, etc. These go into the `documents` Supabase Storage bucket and are downloaded by the pipeline's `auto-pull` step into `tasks/{name}/materials/`.

However, the **build stage** (`auto-build-html`) needs actual visual assets — logos, hero images, team photos, backgrounds — to embed in the final PitchApp. Today there is no mechanism for clients to provide these separately, and the build agent has no access to client-uploaded images. The `images/` directory in each app is created empty and the build agent can only write text-based content.

**Result:** Built PitchApps either have no images, use placeholder descriptions, or require manual asset sourcing after the fact.

---

## Users

| User | Need |
|------|------|
| **Client (project owner)** | Upload brand assets (logos, photos, guidelines) alongside their pitch materials |
| **Build pipeline (automated)** | Access categorized brand assets during `auto-build-html` to embed real images |
| **Admin (AJ)** | See what assets a client uploaded, manage them, and use them in manual builds |

---

## Scope

### In Scope (P0 — MVP)

1. Dedicated brand assets upload section on the project detail page
2. Asset categorization by type (logo, hero, team, background, other)
3. Separate Supabase Storage bucket (`brand-assets`)
4. New API endpoints for brand asset CRUD
5. Pipeline integration — `auto-pull` downloads assets; `auto-build-html` can read and embed them
6. Asset metadata stored in a `brand_assets` database table

### In Scope (P1 — Should Have)

7. Brand assets upload during project creation (queue mode)
8. Asset preview thumbnails in the UI
9. Admin view of brand assets per project
10. Drag-to-reorder / set primary asset per category

### Out of Scope (P3 — Won't Have)

- Brand kit extraction (auto-detecting colors/fonts from uploaded guidelines)
- AI-powered image generation or search
- Asset library across projects (each project's assets are independent)
- Video asset support (mp4, etc.) — can be added later
- Brand guidelines PDF parsing

---

## Feature Breakdown

### MVP Features (P0)

---

#### 1. Brand Assets Storage Bucket

**User Story:** As the system, I need a dedicated storage location for brand assets so they don't mix with narrative materials.

**Acceptance Criteria:**
- [ ] New Supabase Storage bucket `brand-assets` exists
- [ ] Bucket is private (requires auth for access)
- [ ] Files stored at path: `{project_id}/{category}/{timestamp}_{filename}`
- [ ] Bucket accepts: PNG, JPG, JPEG, WebP, GIF, SVG, PDF (for brand guidelines)

**Dependencies:** None
**Complexity:** Simple

---

#### 2. Brand Assets Database Table

**User Story:** As the system, I need structured metadata about each uploaded asset so the pipeline and UI can query assets by category and project.

**Acceptance Criteria:**
- [ ] New `brand_assets` table in Supabase with schema (see Data Model below)
- [ ] Row-level security: owners can CRUD their own project's assets; admins can access all
- [ ] Each asset has a `category` field: `logo`, `hero`, `team`, `background`, `other`
- [ ] Each asset stores `storage_path`, `file_name`, `file_size`, `mime_type`
- [ ] Optional `label` field for client-provided description (e.g., "dark logo on transparent bg")

**Dependencies:** #1 (bucket)
**Complexity:** Simple

---

#### 3. Brand Assets API

**User Story:** As a client, I need API endpoints to upload, list, and delete brand assets for my project.

**Acceptance Criteria:**
- [ ] `GET /api/projects/[id]/brand-assets` — list all assets for a project (returns metadata from DB + signed download URLs)
- [ ] `POST /api/projects/[id]/brand-assets` — create a signed upload URL (mirrors existing documents pattern) with additional `category` field
- [ ] `DELETE /api/projects/[id]/brand-assets` — delete an asset by ID (removes from storage + DB)
- [ ] `PATCH /api/projects/[id]/brand-assets` — update asset metadata (category, label)
- [ ] Auth: only project owner or admin can access
- [ ] Validates file type (images + SVG + PDF only)
- [ ] Per-file size limit: 20MB (images don't need to be 500MB like documents)
- [ ] Per-project asset limit: 20 files

**Dependencies:** #1, #2
**Complexity:** Medium

---

#### 4. Brand Assets Upload UI — Project Detail Page

**User Story:** As a client, I want a dedicated section on my project page to upload brand assets, separate from my pitch materials, so the build team has the right visuals.

**Acceptance Criteria:**
- [ ] New "brand assets" section on `ProjectDetailClient` — appears below the documents section in the right sidebar
- [ ] Uses the same `FileUpload` component pattern but with brand-asset-specific allowed types and limits
- [ ] Uploaded assets display with category badge, file name, size, and thumbnail preview
- [ ] Each asset has a category selector (dropdown or chip picker): logo, hero, team, background, other
- [ ] Client can delete their own assets
- [ ] Section shows helpful guidance text: "upload logos, team photos, and images you want in your launchpad"
- [ ] Empty state: "no brand assets yet. upload logos and images to personalize your launchpad."

**Dependencies:** #3 (API)
**Complexity:** Medium

---

#### 5. Pipeline Integration — Pull Stage

**User Story:** As the build pipeline, I need `auto-pull` to download brand assets into a predictable local directory so the build agent can access them.

**Acceptance Criteria:**
- [ ] `auto-pull` (via CLI `pull` command) downloads brand assets into `tasks/{name}/brand-assets/` (separate from `materials/`)
- [ ] Assets are organized by category in subdirectories: `tasks/{name}/brand-assets/logo/`, `brand-assets/hero/`, etc.
- [ ] Asset filenames are cleaned (timestamp prefix stripped, like documents)
- [ ] Pull output includes asset count in its result: `{ doc_count, asset_count }`
- [ ] If no brand assets exist, directory is simply not created (no error)

**Dependencies:** #1, #2
**Complexity:** Simple

---

#### 6. Pipeline Integration — Build Stage

**User Story:** As the build pipeline, I need `auto-build-html` to know about and use brand assets so the generated PitchApp includes real client images.

**Acceptance Criteria:**
- [ ] The build agent system prompt includes a list of available brand assets with their categories and file paths
- [ ] A new tool `copy_brand_asset` is added to the build agent that copies a brand asset from `tasks/{name}/brand-assets/` into `apps/{name}/images/`
- [ ] The build agent can reference copied assets via `images/{filename}` in the HTML
- [ ] If brand assets exist, the system prompt instructs the agent to use them (e.g., "Use the client's logo in the hero section")
- [ ] If no brand assets exist, behavior is unchanged (image-free builds remain valid)
- [ ] Asset file size is checked before copy (skip files > 5MB to keep deployed PitchApp lightweight)

**Dependencies:** #5
**Complexity:** Medium

---

### Post-MVP Features (P1)

#### 7. Brand Assets in Project Creation Flow

**Why not MVP:** The creation flow works fine without it — clients can upload assets after submission from the project detail page. Adding it to creation adds form complexity.

**User Story:** As a client creating a new project, I want to upload brand assets alongside my pitch materials.

**Acceptance Criteria:**
- [ ] New "brand assets" file upload section in `NewProjectClient.tsx` below materials
- [ ] Uses queue mode (same as documents) — assets are uploaded after project creation
- [ ] Category can be selected per file or left as "other" (auto-categorized later)

---

#### 8. Asset Thumbnail Previews

**Why not MVP:** The file list with category badge is sufficient for MVP. Thumbnails are polish.

**User Story:** As a client, I want to see thumbnail previews of my uploaded images so I can verify I uploaded the right files.

**Acceptance Criteria:**
- [ ] Image assets show a small thumbnail (48x48 or 64x64) in the asset list
- [ ] SVG and PDF show a file type icon instead
- [ ] Thumbnails load from signed URLs with short expiry

---

#### 9. Admin Brand Asset Management

**Why not MVP:** Admin can access assets via Supabase dashboard for now.

**User Story:** As an admin, I want to see and manage brand assets for any project.

**Acceptance Criteria:**
- [ ] Admin project detail page shows brand assets section
- [ ] Admin can upload, recategorize, and delete assets for any project
- [ ] Admin can download individual assets

---

### Backlog (P2)

- **Asset reorder / set primary** — drag to reorder within a category, mark one as "primary" (e.g., primary logo)
- **Auto-categorization** — use Claude Vision to auto-suggest category based on image content
- **Bulk download** — download all brand assets as a ZIP
- **Asset usage tracking** — show which assets were used in the built PitchApp

---

## Data Model

### New Table: `brand_assets`

```sql
CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('logo', 'hero', 'team', 'background', 'other')),
  file_name TEXT NOT NULL,           -- original filename (cleaned)
  storage_path TEXT NOT NULL,        -- full path in Supabase storage bucket
  file_size BIGINT NOT NULL,         -- bytes
  mime_type TEXT NOT NULL,
  label TEXT,                        -- optional client-provided description
  sort_order INTEGER DEFAULT 0,      -- for future reordering
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by project
CREATE INDEX idx_brand_assets_project_id ON brand_assets(project_id);

-- RLS policies
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- Owners can see their own project's assets
CREATE POLICY "Users can view own project assets"
  ON brand_assets FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Owners can insert assets for their own projects
CREATE POLICY "Users can insert own project assets"
  ON brand_assets FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Owners can update their own project's assets
CREATE POLICY "Users can update own project assets"
  ON brand_assets FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Owners can delete their own project's assets
CREATE POLICY "Users can delete own project assets"
  ON brand_assets FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
```

### New Storage Bucket: `brand-assets`

- **Access:** Private (authenticated only)
- **Path pattern:** `{project_id}/{category}/{timestamp}_{sanitized_filename}`
- **Allowed MIME types:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `application/pdf`
- **Max file size:** 20MB per file
- **Max files per project:** 20

### TypeScript Types (additions to `database.ts`)

```typescript
export type BrandAssetCategory = 'logo' | 'hero' | 'team' | 'background' | 'other';

export interface BrandAsset {
  id: string;
  project_id: string;
  category: BrandAssetCategory;
  file_name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

Add `"brand_assets"` to the `TableName` union type.

---

## API Design

### `GET /api/projects/[id]/brand-assets`

Returns all brand assets for a project with signed download URLs.

**Response:**
```json
{
  "assets": [
    {
      "id": "uuid",
      "category": "logo",
      "file_name": "logo-dark.png",
      "file_size": 45000,
      "mime_type": "image/png",
      "label": "dark logo, transparent bg",
      "sort_order": 0,
      "download_url": "https://...signed-url...",
      "created_at": "2026-02-13T..."
    }
  ]
}
```

### `POST /api/projects/[id]/brand-assets`

Creates a signed upload URL and a DB record.

**Request:**
```json
{
  "fileName": "logo-dark.png",
  "fileSize": 45000,
  "fileType": "image/png",
  "category": "logo",
  "label": "dark logo, transparent bg"
}
```

**Response:**
```json
{
  "signedUrl": "https://...",
  "token": "...",
  "asset": { "id": "uuid", ... }
}
```

### `DELETE /api/projects/[id]/brand-assets`

**Request:**
```json
{ "assetId": "uuid" }
```

**Response:**
```json
{ "deleted": true }
```

### `PATCH /api/projects/[id]/brand-assets`

**Request:**
```json
{
  "assetId": "uuid",
  "category": "hero",
  "label": "updated description"
}
```

**Response:**
```json
{ "asset": { ... } }
```

---

## Pipeline Integration Detail

### Auto-Pull Changes

In `scripts/launchpad-cli.mjs` `cmdPull`:

1. After downloading documents, query the `brand_assets` table for the project
2. For each asset, download from `brand-assets` bucket into `tasks/{name}/brand-assets/{category}/`
3. Strip timestamp prefix from filename (same as documents)
4. Include `assetCount` in pull result

```
tasks/{company}/
  materials/       ← existing (pitch documents for narrative extraction)
  brand-assets/    ← NEW (visual assets for build)
    logo/
      logo-dark.png
      logo-light.svg
    hero/
      team-photo.jpg
    background/
      office-shot.jpg
```

### Auto-Build-HTML Changes

In `handleAutoBuildHtml` in `pipeline-executor.mjs`:

1. Scan `tasks/{name}/brand-assets/` for available assets
2. Build an asset manifest (category → file list) and include it in the system prompt
3. Add a `copy_brand_asset` tool:
   - Input: `{ source: "logo/logo-dark.png", dest: "images/logo.png" }`
   - Copies file from `tasks/{name}/brand-assets/` → `apps/{name}/images/`
   - Returns `{ success: true, path: "images/logo.png", bytes: 45000 }`
4. Update system prompt to include: "The client has provided brand assets. Use them when building sections. Available assets: [manifest]"
5. After build, the images/ directory contains actual client assets referenced by the HTML

### Auto-Revise Changes

Same pattern — `handleAutoRevise` gets access to brand assets via the same `copy_brand_asset` tool and asset manifest.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No brand assets uploaded | Build proceeds as before (image-free or placeholder-based). No error. |
| Assets uploaded after initial build | Available on next revision cycle. Client can request "use my uploaded logo" via Scout. |
| Existing projects (pre-feature) | Brand assets section appears empty. Client can upload anytime. |
| Duplicate filenames | Storage path includes timestamp prefix, preventing collisions. |
| Oversized images in build | `copy_brand_asset` skips files > 5MB and logs a warning. Build agent uses CSS backgrounds or omits. |
| SVG upload | Stored as-is. Build agent can reference via `<img>` tag. No XSS risk since PitchApps are static HTML served from a separate domain. |
| PDF brand guidelines | Stored in `brand-assets` bucket under `other` category. Not copied to images/ (not embeddable). Available for narrative context. |
| Client deletes asset after build | Deployed PitchApp keeps working (images are copied into the app directory). Future rebuilds won't have the asset. |
| File type mismatch | API rejects with clear error. Frontend prevents selection of wrong types. |

---

## Build Order

1. **Brand Assets Storage Bucket** — Supabase config (foundation)
2. **Brand Assets Database Table** — SQL migration + RLS policies + TypeScript types
3. **Brand Assets API** — CRUD endpoints (mirrors documents pattern)
4. **Brand Assets Upload UI** — ProjectDetailClient section (uses existing FileUpload pattern)
5. **Pipeline: Pull Stage** — CLI downloads assets to local directory
6. **Pipeline: Build Stage** — Build agent gets asset manifest + copy tool

Steps 1-2 are foundational. Steps 3-4 can be built in parallel. Steps 5-6 depend on 1-2.

---

## Open Questions

None remaining — all key decisions are documented above. The following are noted as design rationale:

- **Separate bucket vs. same bucket:** Separate `brand-assets` bucket keeps the storage clean and makes pipeline access straightforward. Different file type constraints and size limits justify separation.
- **Category stored in DB vs. path-only:** DB column is more queryable and allows recategorization without moving files in storage.
- **20MB limit vs. 500MB (documents):** Images should be web-optimized. 20MB is generous enough for high-res photos while preventing abuse. The build pipeline has a secondary 5MB limit for what gets copied into the deployed app.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Clients upload low-quality / wrong images | Clear guidance in UI + Scout can help identify issues |
| Build agent misuses assets (wrong logo placement) | Visual QA (auto-review) catches this; client sees preview |
| Storage costs increase | 20-file cap per project; 20MB per file max |
| Migration breaks existing projects | Additive changes only — new table, new bucket. Existing data untouched. |
