# Creative Brief: Brand Assets UX

## The Emotional Moment

The client just approved their narrative. They read through the story arc, felt the beats land, and clicked "this captures it — build it." That's a high point. They've gone from handing over raw materials to seeing their messy inputs transformed into a cohesive story.

Now there's an implicit question: *what will it look like?*

This is the moment where the client shifts from storytelling collaborator to visual identity provider. They're not just uploading files — they're arming the build with their brand DNA. The emotional register should be: **purposeful, empowering, and specific.** Not "upload your stuff," but "equip your story with your look."

The brand assets section should feel like the next logical beat in the pipeline — not a chore, but the next step in bringing their vision to life.

---

## UX Narrative

### Where It Lives

Brand assets is a **new panel on the right sidebar** of the project detail page, appearing between the Scout chat and the existing documents section. It should appear when the project status is `in_progress` or later — i.e., after narrative approval, when the build is starting.

Rationale: The existing "documents" section handles pitch decks, transcripts, and reference materials (inputs to the story). Brand assets are different — they're inputs to the *build*, not the narrative. Separating them makes the distinction clear and prevents logos from getting mixed in with uploaded PDFs.

### When It Appears

- **Hidden** during `requested` and `narrative_review` — the client shouldn't think about visuals yet, they're focused on story.
- **Visible with invitation** during `in_progress` — after narrative approval, a subtle call-to-action invites them to provide brand assets. This is the golden window.
- **Still editable** during `review` and `revision` — clients can update assets even after the first build.
- **Read-only** once `live` — assets are locked, displayed as a reference.

---

## Interaction Patterns

### Primary Upload: Guided Drop Zone

The existing FileUpload component uses a flat `$ drop files here or browse` pattern. Brand assets should elevate this slightly:

**Three distinct upload slots** (not one generic drop zone):

| Slot | Label | Accepted | Guidance Copy |
|------|-------|----------|---------------|
| **logo** | `$ logo` | SVG, PNG, PDF | "your primary mark — ideally SVG or high-res PNG" |
| **imagery** | `$ imagery` | PNG, JPG, WEBP | "photos, textures, or visuals that define your world" |
| **documents** | `$ brand guide` | PDF, PPTX, DOCX | "style guide, brand book, or any reference material" |

Each slot is a compact drop zone with a category label. This guides clients to upload the *right* assets without a questionnaire or form. The categorization is implicit in the UI structure.

**Why not a single drop zone?** Because "upload files" invites randomness. Three labeled slots say: "we need specific things from you, and we know what they are." It signals professionalism and makes the client feel like the process is structured.

**Why not a full questionnaire?** Too heavy. The brand brief section (below) captures the structured data. The upload slots are for files only.

### Secondary: Brand Brief (Structured Input)

Below the upload slots, a compact **brand brief** section captures key structured data:

```
brand colors       [    ] [    ] [    ]   ← 3 hex input chips, click to add
font preference    [__________________ ]  ← free text, placeholder: "e.g., modern sans-serif, clean"
mood / direction   [__________________ ]  ← free text, placeholder: "e.g., bold and confident, warm and approachable"
```

This is optional but prompted. The interaction:
- Color chips: click a `+` chip to open a color picker, or type a hex code directly. Each chip shows a swatch preview.
- Text fields: mono-styled terminal inputs (consistent with TerminalInput component pattern)
- All optional, no validation friction. If the client skips it, we work with what we have.

### Upload Flow

1. Client drags or browses files into a slot
2. File appears in the slot with a progress bar (reuse existing upload progress pattern)
3. After upload, file appears as a **thumbnail preview** (for images) or **type badge + name** (for documents)
4. Client can remove individual files
5. No "save" button — uploads are immediate (consistent with existing FileUpload)

---

## Visual Treatment

### Panel Design

Wrap in a `bg-bg-card border border-border rounded-lg p-6` card (same as existing "details" and "documents" panels on the sidebar). Header follows the established pattern:

```
font-mono text-[11px] tracking-[4px] lowercase text-accent mb-1   ← "brand assets"
text-[13px] text-text-muted                                        ← "arm your story with your look."
```

### Upload Slots

Each slot is a compact row or mini-card:

```
┌─────────────────────────────────────────┐
│  $ logo                                 │
│  ┌──────────────┐  ┌──────────────┐     │
│  │   [logo.svg] │  │     + add    │     │
│  │   thumbnail  │  │              │     │
│  └──────────────┘  └──────────────┘     │
│  svg, png, pdf — your primary mark      │
└─────────────────────────────────────────┘
```

- Slot label: `font-mono text-[12px] text-accent` with `$ ` prefix
- Guidance copy: `font-mono text-[10px] text-text-muted/50`
- Thumbnails for images: 48x48px rounded-[3px] with `object-cover`, border border-border
- Non-image files: show the existing type badge + filename pattern from FileList
- Add button: dashed border zone, `border-accent/15 hover:border-accent/30` (same as FileUpload)

### Image Previews

When images are uploaded (logos, imagery), show inline thumbnail previews:
- Thumbnail grid: `flex flex-wrap gap-2`
- Each thumbnail: `w-12 h-12 rounded-[3px] border border-border object-cover`
- On hover: subtle scale (1.02) + show remove button
- Click to open full preview in a lightbox (or new tab — simpler)

### Brand Colors

Color chips displayed as small circular swatches:
- Size: `w-6 h-6 rounded-full`
- Border: `border border-white/10`
- With hex label below: `font-mono text-[9px] text-text-muted/60`
- Empty state: `+` chip with `border-dashed border-accent/20`

### Empty State

When no assets have been uploaded yet, the section should feel invitational, not barren:

```
brand assets
arm your story with your look.

┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  your logo, colors, and imagery help us
  build a launchpad that looks like you.

  $ drop files or browse to get started
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

- Centered text, mono font, muted color
- Single drop zone that accepts any brand-relevant file type
- After first upload, transitions to the categorized slot view

**Rationale for progressive disclosure:** Starting with three empty categorized slots feels demanding. A single gentle drop zone feels inviting. After the first file lands, we can show the structured slots.

---

## Copy Direction

### Section Headers & Labels

| Element | Copy | Tone |
|---------|------|------|
| Section title | `brand assets` | Matches existing: `narrative`, `preview`, `details` |
| Section subtitle | `arm your story with your look.` | Empowering, connects to narrative approval |
| Logo slot | `$ logo` | Terminal-style, terse |
| Imagery slot | `$ imagery` | Terminal-style, terse |
| Brand guide slot | `$ brand guide` | Terminal-style, terse |
| Brand brief header | `$ brand brief` | Terminal-style, terse |
| Color input label | `colors` | Lowercase mono |
| Font input label | `type preference` | Lowercase mono, avoids "font" jargon |
| Mood input label | `mood` | Lowercase mono |

### Guidance Microcopy

| Slot | Microcopy |
|------|-----------|
| Logo | "your primary mark — SVG or high-res PNG preferred" |
| Imagery | "photos, textures, visuals that define your world" |
| Brand guide | "style guide, brand book, or any reference doc" |
| Colors | placeholder: `#000000` in each chip |
| Type preference | placeholder: "e.g., modern sans-serif, minimal" |
| Mood | placeholder: "e.g., bold and direct, warm and human" |

### Status Microcopy

| State | Copy |
|-------|------|
| Empty | "your logo, colors, and imagery help us build a launchpad that looks like you." |
| Has assets | (no status message — the assets speak for themselves) |
| Read-only (live) | "brand assets used in this build." |

### Avoid

- "Upload your brand assets" — too generic, too form-like
- "Brand kit" — jargon
- "Required" on any field — nothing should feel mandatory
- "Submit" button — uploads are immediate, brief saves on blur

---

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `BrandAssetsPanel` | Main container — wraps slots, brief, and manages state |
| `BrandAssetSlot` | Individual upload slot (logo / imagery / brand guide) |
| `BrandBrief` | Structured input for colors, font preference, mood |
| `ColorChip` | Individual color swatch with hex input |
| `AssetThumbnail` | Image preview thumbnail with remove action |

### Reused Components

| Component | How |
|-----------|-----|
| `FileUpload` | Reuse upload logic (signed URL, progress) — may need to extract the upload function |
| `FileList` | Reference pattern for file display, but don't reuse directly (brand assets have thumbnails) |
| `TerminalChrome` | Do NOT wrap brand assets in TerminalChrome — use the plain card pattern like "details" and "documents" |

### Data Model Consideration

Brand assets need a separate storage bucket or path prefix to distinguish them from general documents. Suggested: `brand-assets/{project_id}/` vs existing `documents/{project_id}/`. The API should support:
- Upload with category tag (logo / imagery / guide)
- List by category
- Brand brief as a JSON blob (colors, font preference, mood) — stored in project metadata or a dedicated column

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Drop zones | `role="button"`, `aria-label="Upload logo files"`, keyboard-activatable |
| Thumbnails | `alt` text from filename, or "Uploaded logo" generic |
| Color picker | Keyboard-navigable, hex input as primary (not just color wheel) |
| Remove buttons | `aria-label="Remove {filename}"`, visible focus ring |
| Progress | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Section | `aria-labelledby` linking to the "brand assets" heading |

---

## Relationship to Existing Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← mission control                                          │
│  Company Name                                               │
│  ● status  TYPE  submitted 2d ago                           │
│                                                             │
│  ┌─────────────────────────┐  ┌───────────────────────┐     │
│  │                         │  │ progress timeline     │     │
│  │     Preview / Narrative │  │                       │     │
│  │                         │  ├───────────────────────┤     │
│  │                         │  │ pipeline activity     │     │
│  │                         │  ├───────────────────────┤     │
│  │                         │  │ scout (chat)          │     │
│  │                         │  │                       │     │
│  │                         │  ├───────────────────────┤     │
│  │                         │  │ ★ BRAND ASSETS ★      │ NEW │
│  │                         │  │ (after narrative      │     │
│  │                         │  │  approval)            │     │
│  ├─────────────────────────┤  ├───────────────────────┤     │
│  │     Edit History        │  │ details               │     │
│  │                         │  ├───────────────────────┤     │
│  │                         │  │ documents             │     │
│  └─────────────────────────┘  └───────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

Brand assets sits between Scout and the project details/documents section. This position:
- Is **above the fold** on most screens (important — it's a call-to-action)
- Is **near Scout** — if the client has questions about what to upload, they can ask
- Is **distinct from documents** — reinforces that brand assets ≠ pitch materials
- Follows the information hierarchy: progress → activity → chat → brand → details → docs

---

## Summary

The brand assets section transforms a generic "upload your files" moment into a guided, purposeful step in the pipeline. By separating visual identity from general documents, using categorized upload slots, and adding a lightweight brand brief, we make the client feel like we know exactly what we need from them — because we do.

The UX stays true to the portal's terminal-inspired DNA: mono fonts, `$` prefixes, muted palettes, terse labels. But the progressive disclosure (single drop zone → categorized slots) and the image thumbnails add warmth and visual richness that the existing documents section lacks.

Key creative decisions:
1. **Progressive disclosure** — empty state is one gentle drop zone, populated state shows categorized slots
2. **Three categories, not tags** — logo / imagery / guide as structural slots, not user-applied labels
3. **Brand brief as companion** — structured inputs for colors, fonts, mood alongside file uploads
4. **Thumbnails for images** — visual preview that general documents don't get
5. **Timed appearance** — hidden during story phase, appears after narrative approval
