# UX/UI Spec: Brand Assets Panel

## Summary

The brand assets section is a new card panel on the project detail right sidebar, positioned between Scout chat and the details card. It enables clients to upload visual identity files (logo, imagery, brand guide) and provide structured brand context (colors, font preference, mood) — all in a way that feels purposeful, not bureaucratic.

The design matches the existing portal DNA: dark card with mono labels, `$`-prefix slot names, dashed-border drop zones, and thumbnail previews for images. Progressive disclosure keeps the initial experience inviting (single drop zone) before transitioning to categorized slots after the first upload.

---

## 1. Component Hierarchy

```
ProjectDetailClient.tsx
└── Right sidebar (w-full lg:w-[380px])
    ├── ProgressTimeline
    ├── PipelineActivity
    ├── NarrativeApproval (conditional)
    ├── ApprovalAction (conditional)
    ├── ScoutChat
    ├── ★ BrandAssetsPanel ★              ← NEW (insert after ScoutChat)
    │   ├── Header (title + subtitle)
    │   ├── EmptyDropZone                 ← Shown when 0 assets
    │   │   OR
    │   ├── BrandAssetSlot (logo)         ← Shown when ≥1 asset
    │   │   ├── AssetThumbnail[]
    │   │   └── inline drop zone / add button
    │   ├── BrandAssetSlot (imagery)
    │   │   ├── AssetThumbnail[]
    │   │   └── inline drop zone / add button
    │   ├── BrandAssetSlot (brand guide)
    │   │   ├── AssetFileRow[]
    │   │   └── inline drop zone
    │   └── BrandBrief
    │       ├── ColorChip[] (max 3)
    │       ├── font preference input
    │       └── mood input
    ├── Details panel
    └── Documents panel
```

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `BrandAssetsPanel` | `src/components/BrandAssetsPanel.tsx` | Container — manages fetch, state machine, progressive disclosure |
| `BrandAssetSlot` | `src/components/BrandAssetSlot.tsx` | Per-category upload slot with drag-drop, thumbnails, file rows |
| `AssetThumbnail` | `src/components/AssetThumbnail.tsx` | 48×48 image preview with lazy load + hover remove |
| `BrandBrief` | `src/components/BrandBrief.tsx` | Structured inputs for colors, font preference, mood |
| `ColorChip` | `src/components/ColorChip.tsx` | Single color swatch with hex input + native picker |

### Reused Patterns

| Pattern | Source | How Used |
|---------|--------|----------|
| Signed URL upload | `FileUpload.tsx:uploadFileViaSignedUrl` (exported at line 322) | Import and reuse; change endpoint to `/api/projects/[id]/brand-assets` |
| File row display | `FileList.tsx:119-156` | Reference for type badge + filename + size layout |
| Card wrapper | `ProjectDetailClient.tsx:292` | Same `bg-bg-card border border-border rounded-lg p-6` |
| Section heading | `ProjectDetailClient.tsx:293-295` | Same `font-mono text-[11px] tracking-[4px] lowercase text-accent` |
| Drop zone styling | `FileUpload.tsx:230-234` | Same dashed border pattern, same accent color states |
| Progress bar | `FileUpload.tsx:264-276` | Same 3px accent bar with percentage text |
| Error display | `FileUpload.tsx:279-283` | Same `text-error text-[12px] font-mono` with `role="alert"` |
| Loading skeleton | `globals.css:149-163` | `skeleton-shimmer` class for initial load |

**Do NOT wrap in TerminalChrome** — use the plain card pattern like "details" and "documents" panels.

---

## 2. Integration Point in ProjectDetailClient.tsx

Insert between `<ScoutChat>` (line 282-289) and the "details" card (line 291-319):

```tsx
// ProjectDetailClient.tsx — right sidebar, after ScoutChat

<div ref={scoutRef}>
  <ScoutChat
    projectId={project.id}
    projectName={project.project_name}
    initialMessages={initialMessages}
    projectStatus={project.status}
  />
</div>

{/* === NEW: Brand Assets === */}
{showBrandAssets && (
  <div className="mt-6">
    <BrandAssetsPanel
      projectId={project.id}
      readOnly={project.status === "live" || project.status === "on_hold"}
    />
  </div>
)}

{/* Project details (existing) */}
<div className="mt-6 bg-bg-card border border-border rounded-lg p-6">
  <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
    details
  </p>
  ...
</div>
```

### Visibility Logic

```tsx
// Add near line 51 in ProjectDetailClient.tsx
const showBrandAssets =
  project.status !== "requested" &&
  project.status !== "narrative_review" &&
  isOwner;
```

| Project Status | Panel Visible | Editable |
|----------------|---------------|----------|
| `requested` | No | — |
| `narrative_review` | No | — |
| `in_progress` | Yes | Yes |
| `review` | Yes | Yes |
| `revision` | Yes | Yes |
| `live` | Yes | No (read-only) |
| `on_hold` | Yes | No (read-only) |

---

## 3. State Machine

### Panel-Level States

```
                ┌──────────┐
                │  HIDDEN  │  (status: requested | narrative_review)
                └────┬─────┘
                     │ status changes to in_progress+
                     ▼
              ┌──────────────┐
              │    EMPTY     │  single gentle drop zone
              └──────┬───────┘
                     │ first file uploaded
                     ▼
              ┌──────────────┐
              │  POPULATED   │  categorized slots visible
              └──────┬───────┘
                     │ status changes to live/on_hold
                     ▼
              ┌──────────────┐
              │  READ-ONLY   │  thumbnails visible, no actions
              └──────────────┘
```

### Per-Slot States

Each `BrandAssetSlot` manages its own upload state:

| State | Visual | Trigger |
|-------|--------|---------|
| `idle` | Drop zone / add button visible | Default |
| `drag-over` | Border changes to `border-accent/60 bg-accent/5` | File dragged over slot |
| `uploading` | 3px progress bar + filename + percentage | File dropped/selected |
| `error` | Red error text below slot, auto-clears 5s | Validation or network failure |
| `read-only` | No drop zone, no add/remove buttons | `readOnly` prop |

```typescript
interface SlotUploadState {
  status: "idle" | "drag-over" | "uploading" | "error";
  progress: number;        // 0-100
  uploadingName: string;   // current file name
  error: string | null;    // error message
}
```

---

## 4. Visual Design

### 4.1 Panel Container (BrandAssetsPanel)

Standard sidebar card — matches "details" and "documents" sections:

```tsx
<section
  aria-labelledby="brand-assets-heading"
  className="bg-bg-card border border-border rounded-lg p-6"
>
  <div className="flex items-baseline justify-between mb-1">
    <h2
      id="brand-assets-heading"
      className="font-mono text-[11px] tracking-[4px] lowercase text-accent"
    >
      brand assets
    </h2>
    {assets.length > 0 && (
      <span className="font-mono text-[10px] text-text-muted/40">
        {assets.length}/20
      </span>
    )}
  </div>
  <p className="text-[13px] text-text-muted mb-5">
    {readOnly ? "brand assets used in this build." : "arm your story with your look."}
  </p>

  {/* Content */}
  ...
</section>
```

### 4.2 Empty State

When `assets.length === 0` AND brand brief is empty:

```
┌─────────────────────────────────────┐
│  brand assets                       │
│  arm your story with your look.     │
│                                     │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│    your logo, colors, and imagery   │
│    help us build a launchpad that   │
│    looks like you.                  │
│                                     │
│    $ drop files or browse           │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│  images, svg, pdf — max 20MB each   │
└─────────────────────────────────────┘
```

```tsx
<div
  role="button"
  tabIndex={0}
  aria-label="Upload brand assets — drag files or press Enter to browse"
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  onClick={() => inputRef.current?.click()}
  className={`border border-dashed rounded-[3px] p-6 text-center cursor-pointer transition-all
    ${dragOver ? "border-accent/60 bg-accent/5" : "border-accent/15 hover:border-accent/30"}`}
>
  <input
    ref={inputRef}
    type="file"
    multiple
    className="hidden"
    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
    onChange={handleInputChange}
  />
  <p className="font-mono text-[12px] text-text-muted/70 mb-2">
    your logo, colors, and imagery help us<br />
    build a launchpad that looks like you.
  </p>
  <p className="font-mono text-[12px] text-text-muted">
    <span className="text-accent">$ </span>
    drop files or{" "}
    <span className="text-accent hover:text-accent-light transition-colors">browse</span>
  </p>
  <p className="font-mono text-[10px] text-text-muted/50 mt-2">
    images, svg, pdf — max 20MB each
  </p>
</div>
```

**Progressive disclosure:** After the first file lands, auto-categorize by MIME type and transition to the categorized view:

```typescript
function autoCategory(mimeType: string): "logo" | "hero" | "other" {
  if (mimeType === "image/svg+xml") return "logo";
  if (mimeType.startsWith("image/")) return "hero";
  return "other"; // PDF, DOCX → brand guide slot
}
```

### 4.3 Populated State — Categorized Slots

After at least one asset exists, show three slots stacked with `space-y-4`:

```
┌─────────────────────────────────────┐
│  brand assets                  3/20 │
│  arm your story with your look.     │
│                                     │
│  $ logo                             │
│  ┌────┐ ┌────┐ ┌ ─ ─ ┐             │
│  │ img│ │ img│ │  +  │             │
│  └────┘ └────┘ └ ─ ─ ┘             │
│  your primary mark — SVG preferred  │
│                                     │
│  $ imagery                          │
│  ┌────┐ ┌────┐ ┌────┐ ┌ ─ ─ ┐      │
│  │ img│ │ img│ │ img│ │  +  │      │
│  └────┘ └────┘ └────┘ └ ─ ─ ┘      │
│  photos, textures, visuals          │
│                                     │
│  $ brand guide                      │
│  ┌──────────────────────────────┐   │
│  │ pdf  brand-guidelines.pdf 2MB│   │
│  └──────────────────────────────┘   │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │ $ drop or browse              │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│  style guide or reference doc       │
│                                     │
│  ─── $ brand brief ─────────────    │
│                                     │
│  colors     ⬤ ⬤ [+]               │
│  type pref  [ modern sans-serif  ]  │
│  mood       [ bold and direct    ]  │
└─────────────────────────────────────┘
```

### 4.4 Slot Header

Each slot uses the terminal `$` prefix pattern:

```tsx
<p className="font-mono text-[12px] text-accent mb-2">
  <span className="text-accent/70">$ </span>{label}
</p>
```

### 4.5 Image Thumbnails (AssetThumbnail)

For image assets (logo, imagery), display inline thumbnails:

```tsx
<div className="relative group w-12 h-12 rounded-[3px] border border-border overflow-hidden">
  {/* Skeleton while loading */}
  {!loaded && <div className="absolute inset-0 skeleton-shimmer" />}

  <img
    src={asset.download_url}
    alt={asset.label || `Uploaded ${asset.category}: ${asset.file_name}`}
    className={`w-full h-full object-cover transition-opacity
      ${loaded ? "opacity-100" : "opacity-0"}
      group-hover:scale-[1.02] transition-transform`}
    loading="lazy"
    onLoad={() => setLoaded(true)}
  />

  {/* Remove button — visible on hover/focus-within */}
  {!readOnly && (
    <button
      onClick={(e) => { e.stopPropagation(); onRemove(asset.id); }}
      aria-label={`Remove ${asset.file_name}`}
      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full
        bg-bg-card border border-border text-text-muted/50
        hover:text-error hover:border-error/30
        opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
        transition-all flex items-center justify-center cursor-pointer"
    >
      <span className="text-[8px] leading-none">&times;</span>
    </button>
  )}
</div>
```

**Thumbnail sizing:**
- Standard: `w-12 h-12` (48×48) — shows ~5 per row in 380px sidebar
- Mobile: same size — still fits ~5 per row on 390px screens

**Click behavior:** Opens full-size image in new tab (simple `window.open(asset.download_url, "_blank")`)

### 4.6 Inline Add Button

Inside each slot's thumbnail grid:

```tsx
{!readOnly && totalAssets < 20 && (
  <button
    onClick={() => inputRef.current?.click()}
    className="w-12 h-12 rounded-[3px] border border-dashed border-accent/15
      hover:border-accent/30 hover:bg-accent/5
      flex items-center justify-center transition-all cursor-pointer"
    aria-label={`Add ${slotLabel} file`}
  >
    <span className="text-accent/40 text-[16px]">+</span>
  </button>
)}
```

### 4.7 Document File Rows (Brand Guide Slot)

For non-image assets (PDFs, DOCX), use the FileList row pattern (from `FileList.tsx:119-156`):

```tsx
<div className="flex items-center justify-between bg-bg-raised/50 border border-border
  rounded-[3px] px-3 py-1.5">
  <div className="flex items-center gap-2 min-w-0">
    <span className="font-mono text-[10px] text-accent/70 bg-accent/8
      px-1.5 py-0.5 rounded-[2px] tracking-[0.5px] flex-shrink-0">
      {getFileTypeLabel(asset.mime_type)}
    </span>
    <span className="font-mono text-[12px] text-text truncate">
      {asset.file_name}
    </span>
    <span className="font-mono text-[10px] text-text-muted/50 flex-shrink-0">
      {formatFileSize(asset.file_size)}
    </span>
  </div>
  {!readOnly && (
    <button
      onClick={() => onRemove(asset.id)}
      aria-label={`Remove ${asset.file_name}`}
      className="font-mono text-[10px] text-text-muted/50 hover:text-error
        transition-colors cursor-pointer flex-shrink-0 ml-2"
    >
      remove
    </button>
  )}
</div>
```

### 4.8 Per-Slot Inline Drop Zone

Each slot has a compact drop zone after its files (for logo/imagery, it's the `+` button in the thumbnail grid; for brand guide, it's a separate drop area):

```tsx
<div
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  onClick={() => inputRef.current?.click()}
  className={`border border-dashed rounded-[3px] px-3 py-2 text-center
    cursor-pointer transition-all mt-2
    ${dragOver ? "border-accent/60 bg-accent/5" : "border-accent/15 hover:border-accent/30"}`}
>
  <p className="font-mono text-[11px] text-text-muted/50">
    <span className="text-accent/50">$ </span>
    drop or <span className="text-accent/50">browse</span>
  </p>
</div>
```

### 4.9 Upload Progress

Reuse the existing progress bar pattern from `FileUpload.tsx:264-276`:

```tsx
{uploading && (
  <div className="mt-2">
    <div
      className="h-[3px] w-full bg-border rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={uploadProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Uploading ${uploadingName}`}
    >
      <div
        className="h-full bg-accent transition-all duration-200 ease-out"
        style={{ width: `${uploadProgress}%` }}
      />
    </div>
    <p className="font-mono text-[11px] text-text-muted/60 mt-1">
      uploading {uploadingName} — {uploadProgress}%
    </p>
  </div>
)}
```

### 4.10 Guidance Copy (Per-Slot)

Below each slot's thumbnails/files:

| Slot | Copy | Class |
|------|------|-------|
| logo | "your primary mark — SVG or high-res PNG preferred" | `font-mono text-[10px] text-text-muted/50 mt-1` |
| imagery | "photos, textures, visuals that define your world" | same |
| brand guide | "style guide, brand book, or any reference doc" | same |

Guidance copy hides when the slot has 2+ files (it's served its purpose).

### 4.11 Read-Only State (Live/On Hold)

When `readOnly` is true:
- No drop zones, no add buttons, no remove buttons
- Thumbnails still clickable (opens full-size in new tab)
- Brand brief inputs are `disabled` with no border hover
- Subtitle changes: "brand assets used in this build."
- Empty slots are hidden entirely (only show slots that have assets)

---

## 5. Brand Brief Section

Positioned below the three upload slots, separated by a subtle divider.

### Layout

```tsx
<div className="mt-5 pt-4 border-t border-white/[0.04]">
  <p className="font-mono text-[12px] text-accent mb-4">
    $ brand brief
  </p>

  <div className="space-y-3">
    {/* Colors */}
    <div>
      <label className="font-mono text-[10px] text-text-muted/60 tracking-[1px] lowercase block mb-1.5">
        colors
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        {colors.map((hex, i) => (
          <ColorChip key={i} value={hex} onChange={...} onRemove={...} readOnly={readOnly} />
        ))}
        {!readOnly && colors.length < 3 && (
          <button
            onClick={addColor}
            aria-label="Add brand color"
            className="w-6 h-6 rounded-full border border-dashed border-accent/20
              hover:border-accent/40 flex items-center justify-center
              cursor-pointer transition-all"
          >
            <span className="text-accent/40 text-[11px]">+</span>
          </button>
        )}
      </div>
    </div>

    {/* Font preference */}
    <div>
      <label
        htmlFor="brand-type-pref"
        className="font-mono text-[10px] text-text-muted/60 tracking-[1px] lowercase block mb-1.5"
      >
        type preference
      </label>
      <input
        id="brand-type-pref"
        type="text"
        value={fontPref}
        onChange={...}
        onBlur={save}
        placeholder="e.g., modern sans-serif, minimal"
        disabled={readOnly}
        className="w-full bg-transparent border border-border rounded-[3px] px-3 py-1.5
          font-mono text-[12px] text-text placeholder:text-text-muted/30
          focus:border-accent/30 focus:outline-none transition-colors
          disabled:opacity-50 disabled:cursor-default"
      />
    </div>

    {/* Mood */}
    <div>
      <label
        htmlFor="brand-mood"
        className="font-mono text-[10px] text-text-muted/60 tracking-[1px] lowercase block mb-1.5"
      >
        mood
      </label>
      <input
        id="brand-mood"
        type="text"
        value={mood}
        onChange={...}
        onBlur={save}
        placeholder="e.g., bold and direct, warm and human"
        disabled={readOnly}
        className="w-full bg-transparent border border-border rounded-[3px] px-3 py-1.5
          font-mono text-[12px] text-text placeholder:text-text-muted/30
          focus:border-accent/30 focus:outline-none transition-colors
          disabled:opacity-50 disabled:cursor-default"
      />
    </div>
  </div>
</div>
```

### ColorChip Component

```tsx
<div className="relative group">
  {/* Hidden native color picker */}
  <input
    ref={pickerRef}
    type="color"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="sr-only"
    aria-label={`Edit brand color ${value}`}
  />

  {/* Visible swatch — click opens picker */}
  <button
    onClick={() => pickerRef.current?.click()}
    aria-label={`Brand color: ${value}. Click to change.`}
    className="w-6 h-6 rounded-full border border-white/10 cursor-pointer
      transition-transform hover:scale-110"
    style={{ backgroundColor: value }}
  />

  {/* Hex label below */}
  <span className="font-mono text-[9px] text-text-muted/60 block text-center mt-0.5">
    {value}
  </span>

  {/* Remove button on hover */}
  {!readOnly && (
    <button
      onClick={onRemove}
      aria-label={`Remove color ${value}`}
      className="absolute -top-1 -right-1 w-3 h-3 rounded-full
        bg-bg-card border border-border flex items-center justify-center
        opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
    >
      <span className="text-[7px] text-text-muted">&times;</span>
    </button>
  )}
</div>
```

### Save Behavior

- Auto-save on blur, debounced 500ms
- No explicit "save" button — matches portal's immediate-save pattern
- `PATCH /api/projects/[id]` with `brand_brief` JSON body
- Stored as `brand_brief JSONB` column on the `projects` table

### Data Shape

```typescript
interface BrandBriefValues {
  colors: string[];       // max 3 hex codes
  fontPreference: string; // free text, max 200 chars
  mood: string;           // free text, max 200 chars
}
```

---

## 6. Category Mapping

The creative brief defines 3 UI slots. The product spec defines 5 DB categories. Mapping:

| UI Slot | Label | DB Category | Auto-Categorization |
|---------|-------|-------------|---------------------|
| `$ logo` | logo | `logo` | SVG → `logo`, small PNG → `logo` |
| `$ imagery` | imagery | `hero` (default) | All images default to `hero`. Pipeline/admin can recategorize to `team` or `background` later. |
| `$ brand guide` | brand guide | `other` | PDF, DOCX, PPTX → `other` with `label: "brand guide"` |

### Accepted File Types Per Slot

| Slot | MIME Types | Accept String |
|------|-----------|---------------|
| logo | `image/svg+xml`, `image/png`, `image/jpeg`, `image/webp`, `application/pdf` | `image/svg+xml,image/png,image/jpeg,image/webp,application/pdf` |
| imagery | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | `image/png,image/jpeg,image/webp,image/gif` |
| guide | `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `application/pdf,.pptx,.docx,.xlsx` |

```typescript
const SLOT_ALLOWED_TYPES: Record<"logo" | "imagery" | "guide", string[]> = {
  logo: [
    "image/svg+xml", "image/png", "image/jpeg", "image/webp", "application/pdf",
  ],
  imagery: [
    "image/png", "image/jpeg", "image/webp", "image/gif",
  ],
  guide: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};
```

---

## 7. Upload Flow

### Sequence per slot

1. **Drag over slot** → Border changes to `border-accent/60 bg-accent/5`
2. **File dropped/selected** → Client-side validation:
   - MIME type against slot's allowed types
   - File size ≤ 20MB
   - Total project assets < 20
3. **Validation passes** → `POST /api/projects/[id]/brand-assets` with `{ fileName, fileSize, fileType, category, label }`
4. **Server returns signed URL** → Upload file via `uploadFileViaSignedUrl` (reused from FileUpload)
5. **Progress bar visible** → Same 3px bar pattern as documents
6. **Upload completes** → Refresh asset list, new thumbnail/row appears
7. **Validation fails** → Error text below slot with `role="alert"`, auto-clears 5s

### From Empty State

When uploading from the unified empty drop zone:
1. Auto-categorize file by MIME type (see section 6)
2. Upload with auto-assigned category
3. Transition from empty state → categorized slots view

---

## 8. Error States

| Error | Message | Location |
|-------|---------|----------|
| Wrong file type | `"{filename}": not accepted for this slot.` | Below affected slot |
| File too large | `"{filename}": exceeds 20MB limit.` | Below affected slot |
| Too many assets | `max 20 brand assets per project.` | Below panel header |
| Upload network error | `upload failed. check your connection.` | Below affected slot |
| Signed URL failure | `couldn't prepare upload. try again.` | Below affected slot |
| Delete failure | `couldn't remove that file. try again.` | Below affected file |
| Brief save failure | `couldn't save — will retry.` | Below brand brief section |

All errors: `text-error text-[11px] font-mono`, `role="alert"`, auto-clear 5 seconds.

---

## 9. Responsive Behavior

### Desktop (≥1024px / `lg:`)

- Panel in right sidebar at `lg:w-[380px]`
- Thumbnails `w-12 h-12` (48×48), ~5 per row
- Brand brief inputs full-width within panel
- Color chips inline row

### Tablet (768px–1023px)

- Sidebar stacks below main content (existing behavior)
- Panel becomes full-width — no changes needed, layout naturally adapts
- Thumbnails show ~8-10 per row

### Mobile (<768px)

- Full-width panel
- Thumbnails stay `w-12 h-12` — still fits ~5 per row at 390px minus padding
- Drop zone touch targets: `w-12 h-12` add button = 48px ≥ 44pt minimum
- Brand brief text inputs: add `py-2 sm:py-1.5` for larger mobile tap targets
- Long filenames truncate via `truncate` class

### Breakpoint Summary

| Element | <768px | ≥768px | ≥1024px |
|---------|--------|--------|---------|
| Panel width | 100% | 100% | 380px (sidebar) |
| Thumbnails per row | ~5 | ~8 | ~5 |
| Brief text inputs | `py-2` | `py-1.5` | `py-1.5` |
| Mobile stacking order | ...Scout → Brand Assets → Details → Docs | same | sidebar layout |

---

## 10. Accessibility

### ARIA Structure

```html
<section aria-labelledby="brand-assets-heading">
  <h2 id="brand-assets-heading">brand assets</h2>

  <!-- Each slot is a group -->
  <div role="group" aria-label="Logo upload">
    <div role="button" tabindex="0"
      aria-label="Upload logo files — drag and drop or press Enter to browse">
      <input type="file" aria-hidden="true" />
    </div>
    <div role="list" aria-label="Uploaded logo files">
      <div role="listitem">
        <img alt="Uploaded logo: logo-dark.png" />
        <button aria-label="Remove logo-dark.png">×</button>
      </div>
    </div>
  </div>

  <!-- Progress bar -->
  <div role="progressbar" aria-valuenow="45" aria-valuemin="0" aria-valuemax="100"
    aria-label="Uploading logo-dark.png" />

  <!-- Brand brief -->
  <div role="group" aria-label="Brand brief">
    <label for="brand-type-pref">type preference</label>
    <input id="brand-type-pref" />
    <label for="brand-mood">mood</label>
    <input id="brand-mood" />
  </div>

  <!-- Live region for announcements -->
  <div aria-live="polite" class="sr-only">{announcement}</div>
</section>
```

### Keyboard Navigation

| Action | Key | Behavior |
|--------|-----|----------|
| Navigate between elements | Tab | Sequential focus through drop zones, add buttons, thumbnails, remove buttons, brief inputs |
| Activate drop zone | Enter / Space | Opens native file picker |
| Remove asset | Enter / Space on remove button | Deletes asset, moves focus to previous sibling or add button |
| Open color picker | Enter / Space on swatch | Opens native color input |
| Add color | Enter / Space on "+" chip | Adds new color, focuses the swatch |

### Focus Management

| Event | Focus Target |
|-------|-------------|
| Upload completes | Newly added thumbnail |
| Asset removed | Previous asset in slot, or add button if none remain |
| Empty → populated transition | First slot's first element |
| Error occurs | Error announced via `aria-live`, focus stays on drop zone |

### Color Contrast (WCAG 2.1 AA)

| Element | Foreground | Background | Ratio | Pass? |
|---------|-----------|------------|-------|-------|
| Slot label (`text-accent`) | `#c07840` | `#111114` | ~4.8:1 | AA ✓ |
| Body text (`text-text`) | `#eeeae4` | `#111114` | ~14.2:1 | AAA ✓ |
| Guidance (`text-text-muted/50`) | `#948f86` @ 50% | `#111114` | ~3.2:1 | Borderline |
| Error (`text-error`) | `#c03030` | `#111114` | ~4.6:1 | AA ✓ |

**Action:** Guidance copy uses `text-text-muted/50` which is borderline at 10px size. This matches the existing pattern in `FileUpload.tsx:258` (`text-text-muted/50 mt-1`). Keep consistent — this is incidental text, not informational content. For the brand guide slot guidance text, which carries more meaning, use `text-text-muted/60`.

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce` via the global CSS rule in `globals.css:320-342`:
- Thumbnail hover scale → disabled
- Progress bar transitions → instant
- Empty→populated transition → instant
- Skeleton shimmer → static

---

## 11. Loading States

### Initial Panel Load

While fetching from `GET /api/projects/[id]/brand-assets`:

```tsx
{loading && (
  <div className="space-y-3">
    <div className="h-3 w-24 skeleton-shimmer rounded" />
    <div className="flex gap-2">
      <div className="w-12 h-12 skeleton-shimmer rounded-[3px]" />
      <div className="w-12 h-12 skeleton-shimmer rounded-[3px]" />
    </div>
    <div className="h-3 w-28 skeleton-shimmer rounded" />
    <div className="flex gap-2">
      <div className="w-12 h-12 skeleton-shimmer rounded-[3px]" />
    </div>
  </div>
)}
```

### Thumbnail Image Loading

Each `AssetThumbnail` shows shimmer until the image loads (see section 4.5).

---

## 12. Props Interfaces

### BrandAssetsPanel

```typescript
interface BrandAssetsPanelProps {
  projectId: string;
  readOnly?: boolean;  // true when status is live/on_hold
}
```

### BrandAssetSlot

```typescript
type SlotCategory = "logo" | "imagery" | "guide";

interface BrandAssetSlotProps {
  projectId: string;
  slotType: SlotCategory;
  label: string;              // "logo" | "imagery" | "brand guide"
  guidanceCopy: string;       // guidance text below slot
  acceptedTypes: string[];    // MIME types this slot accepts
  assets: BrandAsset[];       // current assets in this slot
  readOnly?: boolean;
  totalAssetCount: number;    // for enforcing 20-file limit
  onUploadComplete: () => void;  // refresh trigger
  onDelete: (assetId: string) => Promise<void>;
}
```

### AssetThumbnail

```typescript
interface AssetThumbnailProps {
  asset: BrandAsset & { download_url: string };
  readOnly?: boolean;
  onDelete?: (id: string) => void;
}
```

### BrandBrief

```typescript
interface BrandBriefProps {
  projectId: string;
  initialValues?: BrandBriefValues;
  readOnly?: boolean;
}
```

### ColorChip

```typescript
interface ColorChipProps {
  value: string;
  onChange: (hex: string) => void;
  onRemove: () => void;
  readOnly?: boolean;
}
```

---

## 13. Animation & Micro-interactions

Minimal — match the portal's restrained feel:

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Empty → categorized transition | Opacity cross-fade | 200ms ease-out |
| Thumbnail appear after upload | Opacity 0→1, scale 0.95→1 | 150ms ease-out |
| Thumbnail hover | Scale 1→1.02 | 100ms |
| Remove button appear | Opacity 0→1 | 100ms |
| Drop zone drag-over | Border color transition | 150ms (via `transition-all`) |
| Color chip add | Scale 0→1 | 150ms ease-out |
| Error appear/dismiss | Opacity fade | 100ms in, 200ms out |

All respect `prefers-reduced-motion`.

---

## 14. Data Flow

```
GET /api/projects/[id]/brand-assets
  → { assets: BrandAsset[] }  (with signed download_urls)

POST /api/projects/[id]/brand-assets
  → { fileName, fileSize, fileType, category, label? }
  ← { signedUrl, token, asset: BrandAsset }

DELETE /api/projects/[id]/brand-assets
  → { assetId }
  ← { deleted: true }

PATCH /api/projects/[id]
  → { brand_brief: { colors, fontPreference, mood } }
  ← { project: Project }
```

Brand brief is stored on the `projects` table as JSONB (simplest — one fetch, no extra table).

---

## 15. New Files

| File | Purpose |
|------|---------|
| `src/components/BrandAssetsPanel.tsx` | Main container — fetch, state, progressive disclosure |
| `src/components/BrandAssetSlot.tsx` | Per-category slot with drop zone, thumbnails, file rows |
| `src/components/AssetThumbnail.tsx` | Image thumbnail with lazy load + hover delete |
| `src/components/BrandBrief.tsx` | Color chips + text inputs, auto-save |
| `src/components/ColorChip.tsx` | Single color swatch with hex input + native picker |

### Modified Files

| File | Change |
|------|--------|
| `src/app/project/[id]/ProjectDetailClient.tsx` | Add `BrandAssetsPanel` between ScoutChat and details |
| `src/types/database.ts` | Add `BrandAsset`, `BrandAssetCategory`, `BrandBriefValues` types |

---

## 16. Design Tokens Used

All from `globals.css` — no new tokens introduced:

| Token | Value | Usage |
|-------|-------|-------|
| `bg-bg-card` | #111114 | Panel background |
| `border-border` | rgba(238,234,228,0.08) | All borders |
| `text-accent` | #c07840 | $ prefix, slot labels, interactive highlights |
| `text-accent-light` | #e0a870 | Hover states on "browse" text |
| `text-text` | #eeeae4 | Filenames, input text |
| `text-text-muted` | #948f86 | Secondary text at various opacities |
| `text-error` | #c03030 | Error messages |
| `bg-bg-raised` | #1a1a1e | File row backgrounds (at /50 opacity) |
| `bg-accent` | #c07840 | Progress bar fill, type badge background (at /8) |
| `font-mono` | JetBrains Mono | All text in this component |
| `rounded-[3px]` | 3px (--radius-md) | Thumbnails, drop zones, inputs |
| `rounded-lg` | 8px (--radius-lg) | Panel container |

---

## 17. QA Checklist

- [ ] Panel hidden during `requested` and `narrative_review`
- [ ] Panel visible and editable during `in_progress`, `review`, `revision`
- [ ] Panel visible and read-only during `live` and `on_hold`
- [ ] Empty state shows single unified drop zone
- [ ] First upload transitions to categorized slots
- [ ] Correct auto-categorization by file type
- [ ] Thumbnails load with skeleton shimmer, then lazy-load images
- [ ] Upload progress bar matches existing FileUpload pattern
- [ ] Remove button appears on thumbnail hover
- [ ] File type validation prevents wrong types per slot
- [ ] 20MB per-file limit enforced (client + server)
- [ ] 20-file total limit enforced (client + server)
- [ ] Error messages display with `role="alert"` and auto-clear after 5s
- [ ] All interactive elements keyboard-accessible (Tab, Enter, Space)
- [ ] Drop zones have `role="button"` and keyboard activation
- [ ] Thumbnails have descriptive `alt` text
- [ ] Progress bar has `role="progressbar"` with aria-value attributes
- [ ] Screen reader live region announces upload/delete events
- [ ] Reduced motion respected (no animations with `prefers-reduced-motion`)
- [ ] Responsive: panel full-width on mobile/tablet, sidebar on desktop
- [ ] Read-only state: no upload/delete controls, disabled brief inputs
- [ ] Brand brief auto-saves on blur
- [ ] Color chips: add, edit (via native picker), remove
- [ ] Touch targets ≥ 44px on mobile
- [ ] Consistent with existing portal design tokens (no new colors/fonts)

---

## 18. Open Design Questions

### Q1: Brand brief storage

**A. JSONB column on `projects` table (recommended)** — simplest, one fetch. Brief is tightly coupled to project with a fixed schema.

**B. Separate `brand_briefs` table** — normalized, flexible for expansion.

Recommendation: Option A.

### Q2: Color input interaction

**A. Native color picker only** — click swatch → browser picker. Simple.

**B. Hex text input + native picker (recommended)** — click swatch → native picker, but hex code is visible and editable. Founders often have exact hex codes from their designer.

Recommendation: Option B.
