# Architecture Review: Brand Assets Feature

**Reviewer:** Architect Agent
**Date:** 2026-02-13
**Inputs:** product-spec.md, creative-brief.md, ux-spec.md + codebase audit

---

## 1. Executive Summary

The brand assets feature is well-scoped and the three specs are largely consistent. The design is additive — new table, new bucket, new components — with minimal risk to existing functionality. I have a few structural concerns to address before build, but nothing that changes the fundamental approach.

**Verdict: Approve with 5 required changes and 3 recommendations.**

---

## 2. Data Model Review

### 2.1 `brand_assets` Table — Approved with Notes

The proposed schema is sound:

```sql
CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('logo', 'hero', 'team', 'background', 'other')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Validates well against codebase:**
- `ON DELETE CASCADE` matches the pattern of other project-dependent data (scout_messages, pipeline_jobs)
- `project_id` index is essential and included
- `BIGINT` for file_size is correct (matches Supabase storage metadata)

**Required change #1 — Add admin RLS policies:**
The spec only includes owner-level RLS. The existing pattern (documents API) uses `createAdminClient()` to bypass RLS, which works for API routes. But if we ever query brand_assets from server components with the user's client, admin access would fail. Add:

```sql
-- Admin access (service role bypasses RLS, but for completeness):
CREATE POLICY "Service role has full access"
  ON brand_assets FOR ALL
  USING (auth.role() = 'service_role');
```

This is a low-priority concern since the API routes use `createAdminClient()`, but it's good hygiene.

**Observation:** The existing `projects` table is referenced but I don't see other tables following the RLS subquery pattern `(project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))`. This pattern creates a performance dependency on the projects table for every brand_assets query. Acceptable at this scale, but worth noting.

### 2.2 Storage Bucket — Approved

- Separate `brand-assets` bucket: correct decision. Different file types, different size limits, different access patterns.
- Path pattern `{project_id}/{category}/{timestamp}_{filename}`: good, mirrors documents but adds category subdirectory.
- Allowed MIME types and 20MB limit: appropriate.

**Implementation note:** The bucket must be created manually in the Supabase dashboard or via SQL migration. Include this in the build instructions:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  false,
  20971520,  -- 20MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']
);
```

### 2.3 TypeScript Types — Approved

The `BrandAsset` interface and `BrandAssetCategory` type are clean. Add `"brand_assets"` to the `TableName` union as specified.

---

## 3. API Design Review

### 3.1 Endpoint Structure — Approved

`/api/projects/[id]/brand-assets` mirrors the existing `/api/projects/[id]/documents` pattern. Same file, all HTTP methods. Good.

### 3.2 Auth Pattern — Approved

The `verifyAccess()` function in the documents route is the right pattern to reuse. Either:
- Extract it to a shared utility (cleaner)
- Copy it to the new route (faster for MVP)

**Recommendation #1:** Extract `verifyAccess` to `src/lib/api/verify-access.ts` for reuse. But if the developer prefers to copy for speed, that's acceptable for MVP.

### 3.3 POST Flow — Required Change #2 (Race Condition)

**The spec says POST creates a DB record AND returns a signed upload URL.** But the actual file upload happens client-side after the POST. This creates an orphan record risk:

```
Client → POST /brand-assets (creates DB record) → gets signed URL
Client → PUT to signed URL ← THIS CAN FAIL
Result: DB record exists, storage file doesn't
```

The documents API doesn't have this problem because it has no DB table — it only creates a signed URL, and the storage entry is the source of truth.

**Fix options:**
1. **Two-step create** — POST creates only the signed URL (no DB record). After successful upload, client calls a second endpoint to confirm (creates DB record). Most correct, but adds complexity.
2. **Create DB record with `status: 'pending'`** — Mark as confirmed after upload. Cron cleans stale pending records. Over-engineered for MVP.
3. **Accept orphans + client-side cleanup** — If upload fails, the client calls DELETE to clean up the DB record. Simplest and sufficient for MVP.

**Recommended: Option 3.** The upload function should catch failures and call DELETE. Add a comment documenting the pattern. Orphan cleanup can be a P2 cron if needed.

### 3.4 DELETE Design — Minor Concern

The spec uses `{ assetId: "uuid" }` in the request body. The documents API uses `{ fileName: "..." }`. Both work, but the brand assets approach is better since we have a DB primary key. **Approved.**

One thing to watch: DELETE must remove from BOTH the DB table AND the storage bucket. Order matters:
1. Delete from storage first (if this fails, the DB record is still there for retry)
2. Delete from DB
3. If DB delete fails, we have a storage ghost — acceptable, doesn't affect the user

### 3.5 File Count Enforcement

The spec says 20 files per project. The check should query the `brand_assets` table (not storage.list like documents), since we have a DB now:

```typescript
const { count } = await adminClient
  .from("brand_assets")
  .select("*", { count: "exact", head: true })
  .eq("project_id", projectId);
```

---

## 4. Spec Conflict: Allowed File Types

**Required Change #3: Resolve MIME type conflict between specs.**

| Source | Allowed Types |
|--------|--------------|
| Product spec (bucket) | PNG, JPG, WEBP, GIF, SVG, PDF |
| UX spec (brand guide slot) | PDF, **PPTX, DOCX** |
| Product spec (API validation) | "images + SVG + PDF only" |

The UX spec allows Office formats (PPTX, DOCX) in the brand guide slot, but the product spec's bucket and API only allow images + SVG + PDF.

**Recommendation:** Include Office formats in the allowed types. Brand guidelines often come as PPTX or DOCX files. The existing documents infrastructure already handles these types. Update the bucket and API allowed types:

```
Allowed: image/png, image/jpeg, image/webp, image/gif, image/svg+xml,
         application/pdf,
         application/vnd.openxmlformats-officedocument.presentationml.presentation,
         application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

This aligns the brand guide slot with reality — clients will upload PPTX brand decks.

---

## 5. Component Architecture Review

### 5.1 Upload Function Reuse — Required Change #4

The existing `uploadFileViaSignedUrl` in FileUpload.tsx is hardcoded to `/api/projects/${projectId}/documents`:

```typescript
const res = await fetch(`/api/projects/${projectId}/documents`, { ... });
```

To reuse this for brand assets, **parameterize the endpoint URL:**

```typescript
async function uploadFileViaSignedUrl(
  file: File,
  projectId: string,
  onProgress?: (percent: number) => void,
  options?: {
    endpoint?: string;  // default: `/api/projects/${projectId}/documents`
    extraBody?: Record<string, unknown>;  // e.g., { category: "logo" }
  }
): Promise<{ ok: boolean; error?: string; asset?: BrandAsset }> {
```

This lets BrandAssetSlot call:
```typescript
uploadFileViaSignedUrl(file, projectId, setProgress, {
  endpoint: `/api/projects/${projectId}/brand-assets`,
  extraBody: { category: "logo" },
});
```

**Alternative:** Create a separate `uploadBrandAsset()` function. Slightly more code but zero risk to existing upload flow. Either approach works — developer's call.

### 5.2 Component Hierarchy — Approved

```
BrandAssetsPanel (fetches data, manages state)
├── Empty state (single drop zone → transitions to slots)
├── BrandAssetSlot × 3 (logo, imagery, guide)
│   ├── AssetThumbnail[] (for image slots)
│   ├── File rows (for guide slot)
│   └── Inline drop zone
└── BrandBrief (P1 — NOT in MVP)
```

This is clean. The progressive disclosure pattern (empty → single drop zone → 3 slots) adds one state transition to manage, but it's worth it for the UX.

### 5.3 Category Mapping (5 DB → 3 UI) — Approved with Note

| UI Slot | DB Categories | Mapping |
|---------|---------------|---------|
| `$ logo` | `logo` | 1:1 |
| `$ imagery` | `hero`, `team`, `background` | Many:1 — uploads default to `hero` |
| `$ brand guide` | `other` | 1:1 |

This is fine for MVP. The `team` and `background` subcategories are only used by the pipeline (admin can recategorize via PATCH). Clients see 3 buckets, pipeline sees 5.

**One subtlety:** When displaying assets in the imagery slot, the GET response needs to return assets where `category IN ('hero', 'team', 'background')`. The frontend groups them:

```typescript
const logoAssets = assets.filter(a => a.category === 'logo');
const imageryAssets = assets.filter(a => ['hero', 'team', 'background'].includes(a.category));
const guideAssets = assets.filter(a => a.category === 'other');
```

### 5.4 Sidebar Placement — Approved

Inserting `BrandAssetsPanel` between `<ScoutChat>` and the details `<div>` in ProjectDetailClient.tsx:

```tsx
{/* After ScoutChat ref div, before project details */}
{showBrandAssets && (
  <div className="mt-6">
    <BrandAssetsPanel
      projectId={project.id}
      readOnly={project.status === "live"}
    />
  </div>
)}
```

Where:
```tsx
const showBrandAssets =
  project.status !== "requested" &&
  project.status !== "narrative_review" &&
  isOwner;
```

**Note:** The creative brief says it should be "visible with invitation during `in_progress`" but also "still editable during `review` and `revision`." The `showBrandAssets` logic above handles this correctly — it's hidden only during `requested` and `narrative_review`.

---

## 6. Pipeline Integration Review

### 6.1 CLI Pull Stage — Approved

The `cmdPull` function needs a new section after the documents download loop:

```javascript
// After documents download...

// Download brand assets
let assetCount = 0;
try {
  const assets = await dbGet(url, key, "brand_assets",
    `select=*&project_id=eq.${projectId}&order=category,sort_order`);

  if (assets.length > 0) {
    log(`  Downloading ${assets.length} brand asset(s)...`);
    for (const asset of assets) {
      const localDir = join(taskDir, "brand-assets", asset.category);
      mkdirSync(localDir, { recursive: true });

      const localName = asset.file_name; // Already clean name in DB
      const localPath = join(localDir, localName);

      const res = await storageDownload(url, key, "brand-assets", asset.storage_path);
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(localPath, buffer);
      log(`    -> brand-assets/${asset.category}/${localName} (${formatSize(buffer.length)})`);
      assetCount++;
    }
  }
} catch {
  log("  No brand assets found (or table not accessible).");
}
```

**Key difference from documents:** Brand assets are queried from the `brand_assets` DB table (not `storage.list`), because we need the category metadata to organize into subdirectories.

### 6.2 Build Stage (auto-build-html) — Approved with Required Change #5

The build agent needs two additions:

**A. Asset manifest in system prompt:**
```javascript
// In handleAutoBuildHtml, after reading copy doc:
const brandAssetsDir = join(taskDir, "brand-assets");
let assetManifest = "";
if (existsSync(brandAssetsDir)) {
  const categories = readdirSync(brandAssetsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  for (const cat of categories) {
    const files = readdirSync(join(brandAssetsDir, cat));
    if (files.length > 0) {
      assetManifest += `\n### ${cat}\n${files.map(f => `- ${cat}/${f}`).join("\n")}`;
    }
  }
}
```

**B. New `copy_brand_asset` tool:**
```javascript
{
  name: "copy_brand_asset",
  description: "Copy a brand asset from tasks/{name}/brand-assets/ into the app images/ directory.",
  input_schema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Path relative to brand-assets/ (e.g., 'logo/logo-dark.png')" },
      dest: { type: "string", description: "Destination filename in images/ (e.g., 'logo.png')" },
    },
    required: ["source", "dest"],
  },
}
```

Tool handler:
```javascript
case "copy_brand_asset": {
  const srcPath = join(taskDir, "brand-assets", input.source);
  const destPath = join(appDir, "images", input.dest);
  if (!existsSync(srcPath)) {
    result = { error: `Brand asset not found: ${input.source}` };
  } else {
    const stats = readFileSync(srcPath);
    if (stats.length > 5 * 1024 * 1024) {
      result = { error: `Asset too large (${Math.round(stats.length/1024/1024)}MB). Max 5MB for deployed assets.` };
    } else {
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, stats);
      result = { success: true, path: `images/${input.dest}`, bytes: stats.length };
    }
  }
  break;
}
```

**Required Change #5:** The same tool and manifest must also be added to `handleAutoRevise`. The revision agent needs access to brand assets to add/swap images during edits. The current spec mentions this ("Same pattern") but the implementation guidance should be explicit.

### 6.3 System Prompt Update

Add to `BUILD_AGENT_SYSTEM`:
```
## Brand Assets
${assetManifest ? `The client has provided brand assets. Use them when building sections.

Available assets:${assetManifest}

Use the copy_brand_asset tool to copy assets from brand-assets/ into images/. Reference them via images/{filename} in HTML.
Rules:
- Use the client's logo in the hero and closing sections
- Use hero/team/background images in appropriate sections
- If multiple logos exist, prefer SVG for web quality
- Skip assets over 5MB (the tool will reject them)` : "No brand assets provided. Build without images or use CSS-only patterns."}
```

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Orphan DB records** (upload fails after POST) | Medium | Low | Client-side cleanup on failure; P2 cron if needed |
| **Signed URL expiry** for thumbnails | Low | Medium | URLs expire in 1h by default; re-fetch on component mount |
| **Large image uploads blocking UI** | Low | Low | XHR progress bar handles this; 20MB max |
| **Race condition: concurrent uploads** | Low | Low | Timestamp in storage path prevents collisions; DB insert is atomic |
| **Pipeline runs before assets uploaded** | Medium | Low | Pipeline already handles missing assets gracefully (image-free builds) |
| **Storage cost growth** | Low | Low | 20 files × 20MB = 400MB max per project; bucket lifecycle policies can purge deleted projects |
| **SVG XSS in brand assets** | Low | Low | Assets go into static PitchApps on separate domains; no user-generated HTML injection vector |
| **Supabase storage bucket creation forgotten** | Medium | High | Include SQL in migration script; test first in dev |

---

## 8. Build Sequence

### Phase 1: Foundation (no UI, no pipeline — pure infrastructure)

| Step | File | Action | Depends On |
|------|------|--------|------------|
| 1a | Supabase Dashboard / migration | Create `brand-assets` storage bucket | — |
| 1b | Supabase Dashboard / migration | Create `brand_assets` table + RLS + index | — |
| 1c | `src/types/database.ts` | Add `BrandAsset`, `BrandAssetCategory`, update `TableName` | — |

### Phase 2: API

| Step | File | Action | Depends On |
|------|------|--------|------------|
| 2a | `src/app/api/projects/[id]/brand-assets/route.ts` | Create GET, POST, DELETE, PATCH handlers | 1a, 1b, 1c |

### Phase 3: UI Components (can start as soon as types exist)

| Step | File | Action | Depends On |
|------|------|--------|------------|
| 3a | `src/components/FileUpload.tsx` | Parameterize `uploadFileViaSignedUrl` (add optional `endpoint` and `extraBody` params) | — |
| 3b | `src/components/AssetThumbnail.tsx` | New component: image thumbnail with lazy load, delete hover | 1c |
| 3c | `src/components/BrandAssetSlot.tsx` | New component: per-category upload slot | 3a, 3b |
| 3d | `src/components/BrandAssetsPanel.tsx` | New component: main container with empty/populated/readonly states | 3c |
| 3e | `src/app/project/[id]/ProjectDetailClient.tsx` | Add `BrandAssetsPanel` to sidebar | 3d |

### Phase 4: Pipeline Integration

| Step | File | Action | Depends On |
|------|------|--------|------------|
| 4a | `scripts/launchpad-cli.mjs` | Extend `cmdPull` to download brand assets | 1a, 1b |
| 4b | `scripts/cron/pipeline-executor.mjs` | Add asset manifest + `copy_brand_asset` tool to `handleAutoBuildHtml` | 4a |
| 4c | `scripts/cron/pipeline-executor.mjs` | Add same tool access to `handleAutoRevise` | 4b |

### Parallelization

- **Phase 2 and Phase 3a** can start in parallel (API + upload utility extraction)
- **Phase 3b-3e** are sequential (components build on each other)
- **Phase 4** can start as soon as Phase 1 is complete (independent of UI)
- **Phase 2 and Phase 4** are independent of each other

```
Phase 1 (foundation)
├── Phase 2 (API) ─────────────────┐
│                                   ├── Integration test
├── Phase 3a (upload util) ─┐      │
│                           ├── Phase 3b-3e (UI components)
│                           │
└── Phase 4a (CLI pull) ────┤
                            └── Phase 4b-4c (build pipeline)
```

---

## 9. File-by-File Implementation Plan

### New Files

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/app/api/projects/[id]/brand-assets/route.ts` | ~200 | CRUD API (mirrors documents/route.ts) |
| `src/components/BrandAssetsPanel.tsx` | ~180 | Main container: fetch, state machine, slot rendering |
| `src/components/BrandAssetSlot.tsx` | ~120 | Per-category slot: drop zone, thumbnails/files, upload |
| `src/components/AssetThumbnail.tsx` | ~60 | Image thumbnail with lazy load + delete |

### Modified Files

| File | Change | Lines Changed (est.) |
|------|--------|---------------------|
| `src/types/database.ts` | Add `BrandAsset`, `BrandAssetCategory`, update `TableName` | ~15 |
| `src/components/FileUpload.tsx` | Parameterize `uploadFileViaSignedUrl` endpoint | ~10 |
| `src/app/project/[id]/ProjectDetailClient.tsx` | Import + render `BrandAssetsPanel` in sidebar | ~15 |
| `scripts/launchpad-cli.mjs` | Extend `cmdPull` with brand assets download | ~40 |
| `scripts/cron/pipeline-executor.mjs` | Asset manifest + `copy_brand_asset` tool in `handleAutoBuildHtml` + `handleAutoRevise` | ~80 |

### SQL Migration (manual or script)

```sql
-- 1. Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets', 'brand-assets', false, 20971520,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'image/svg+xml', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

-- 2. Create table
CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('logo', 'hero', 'team', 'background', 'other')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_brand_assets_project_id ON brand_assets(project_id);

-- 3. RLS
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project assets"
  ON brand_assets FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own project assets"
  ON brand_assets FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own project assets"
  ON brand_assets FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own project assets"
  ON brand_assets FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- 4. Storage RLS (allow authenticated uploads to brand-assets bucket)
CREATE POLICY "Users can upload brand assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can read brand assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete brand assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
  );
```

**Note on storage RLS:** The storage policies above are permissive (any authenticated user). This is acceptable because the API route enforces project-level access control BEFORE creating signed URLs. The storage layer is a secondary check, not the primary auth gate. This matches the existing `documents` bucket pattern.

---

## 10. Summary of Required Changes

| # | What | Why |
|---|------|-----|
| 1 | Add admin RLS policy on brand_assets | Consistency, future-proofing |
| 2 | Handle orphan DB records on upload failure | Client-side DELETE cleanup on upload error |
| 3 | Add PPTX/DOCX to allowed MIME types | UX spec allows Office formats in brand guide slot |
| 4 | Parameterize `uploadFileViaSignedUrl` or create brand-specific upload function | Current function is hardcoded to documents endpoint |
| 5 | Add `copy_brand_asset` tool to BOTH `handleAutoBuildHtml` AND `handleAutoRevise` | Revision agent needs brand assets too |

## 11. Recommendations (Non-Blocking)

| # | What | Why |
|---|------|-----|
| R1 | Extract `verifyAccess()` to shared utility | Avoid code duplication between documents and brand-assets routes |
| R2 | Add `UNIQUE(project_id, storage_path)` constraint | Prevent duplicate DB records for same file |
| R3 | Consider a `status` column on brand_assets (`pending`, `uploaded`) | Would enable proper orphan detection; but adds complexity — defer to P2 |

---

## 12. What's NOT in MVP (Confirmed Exclusions)

- Brand Brief (colors, fonts, mood) — P1, deferred
- Thumbnail generation — P1, use signed URLs from original images
- Asset reorder / drag — P2
- Auto-categorization via vision — P2
- Asset preview lightbox — use `window.open()` for MVP
- Project creation flow integration — P1
- Admin brand asset management view — P1 (use Supabase dashboard)

---

## 13. Complexity Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Foundation (DB + bucket + types) | Simple — 30min manual setup |
| Phase 2: API | Medium — ~200 lines, mirrors existing pattern |
| Phase 3: UI Components | Medium-High — 4 components, progressive disclosure state machine |
| Phase 4: Pipeline | Medium — extend 2 existing functions + add 1 tool |
| **Total** | **~1 day for a focused developer** |

The UI is the most complex part due to the progressive disclosure pattern and the 3-slot layout with thumbnails. The API and pipeline are straightforward since they mirror existing patterns.
