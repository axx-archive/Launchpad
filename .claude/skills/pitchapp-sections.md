# PitchApp Section Types (Quick Reference)

> **Note:** These 13 section types are designed for **static HTML/GSAP investor pitch decks**. For React/Next.js PitchApps or non-investor use cases, the section structure should be driven by content rather than this fixed taxonomy. Use these as inspiration, not constraints.

A condensed guide to the 13 PitchApp section types. For full details, see `docs/CONVENTIONS.md`.

---

## Section Type Catalog

### 1. Hero (`.section-hero`)

**Purpose:** Opening brand statement, first impression

**Copy needed:**
- Title (company name, big)
- Tagline (one line)
- Scroll prompt text

**Visual:** Full-bleed background with vignette, centered content

**Animation:** Timeline reveal (zoom, fade sequence)

---

### 2. Text-Centered (`.section-text-centered`)

**Purpose:** Mission statement, positioning, key message

**Copy needed:**
- Label (eyebrow text)
- Headline with `<em>` emphasis words

**Visual:** Dark background, centered text, max-width 900px

**Animation:** Fade in on scroll

---

### 3. Numbered Grid (`.section-numbered-grid`)

**Purpose:** Pillars, principles, 4-point frameworks

**Copy needed:**
- Label
- 4 items: number (01-04) + text with optional `<strong>`

**Visual:** 2x2 grid with 1px accent borders

**Animation:** Fade in with stagger

---

### 4. Background Stats (`.section-bg-stats`)

**Purpose:** Metrics showcase, traction proof

**Copy needed:**
- Label
- Headline
- Stats: value + label (use `data-count`, `data-prefix`, `data-suffix`)
- Callout pills (optional)

**Visual:** Background image with wash, stats in row

**Animation:** Counter animation from 0, fade in

---

### 5. Metric Grid (`.section-metric-grid`)

**Purpose:** 3 large metrics with context

**Copy needed:**
- Label
- 3 items: big value + description
- Summary paragraph (optional)

**Visual:** 3-column grid with 1px borders

**Animation:** Fade in with stagger

---

### 6. Background Statement (`.section-bg-statement`)

**Purpose:** Vision, product intro, big claim

**Copy needed:**
- Eyebrow label
- Big title (can be italic)
- Subtitle
- Description (optional)

**Visual:** Background image with wash, centered stack

**Animation:** Fade in sequence

---

### 7. Card Gallery (`.section-card-gallery`)

**Purpose:** Portfolio, examples, showcases

**Copy needed:**
- Headline (can be multi-line)
- Description
- Cards: image + label

**Visual:** Large headline + 2-column card grid

**Animation:** Cards scale in from 0.92 with stagger

---

### 8. Split Image+Text (`.section-split`)

**Purpose:** Feature highlight, key differentiator

**Copy needed:**
- Label
- Headline with `<em>`
- Description
- Sub-description (optional)

**Visual:** 50/50 image and text, full-bleed image

**Animation:** Clip-path reveal on image

---

### 9. List (`.section-list`)

**Purpose:** Problems, limitations, points to make

**Copy needed:**
- Label
- Headline
- List items with icons (X for negative, → for positive)

**Visual:** Background image with left wash, left-aligned list

**Animation:** Items slide in from left

---

### 10. Dual Panel (`.section-dual-panel`)

**Purpose:** Contrast, comparison, before/after

**Copy needed:**
- Two panels, each with headline

**Visual:** Side-by-side images with overlay text

**Animation:** Panels scale in

---

### 11. Team Grid (`.section-team-grid`)

**Purpose:** Team members, advisors

**Copy needed:**
- Label
- Headline
- Cards: photo (or initials) + name + role

**Visual:** Centered grid of circular photos

**Animation:** Fade in with stagger

---

### 12. Summary (`.section-summary`)

**Purpose:** Recap, key takeaways

**Copy needed:**
- Label ("In Summary")
- Numbered blocks: number + text

**Visual:** Vertical list with hover accent

**Animation:** Alternating slide from left/right

---

### 13. Closing (`.section-closing`)

**Purpose:** End, call to action, brand echo

**Copy needed:**
- Title (echo of hero)
- Tagline
- CTA button text ("Back to Top")

**Visual:** Background image with wash, centered content

**Animation:** Fade in, smooth scroll on CTA click

---

## Quick Decision Guide

| Content Type | Best Section |
|--------------|--------------|
| Opening/brand | Hero |
| Single big message | Text-Centered or Background Statement |
| 4 pillars/principles | Numbered Grid |
| Key metrics | Background Stats or Metric Grid |
| Portfolio/examples | Card Gallery |
| Feature highlight | Split |
| Problems/pain points | List |
| Comparison/contrast | Dual Panel |
| Team members | Team Grid |
| Recap/summary | Summary |
| Closing/CTA | Closing |

## Copy Constraints by Type

| Section | Max headline length | Body copy? | Items |
|---------|--------------------| -----------|-------|
| Hero | Short (brand name) | No | - |
| Text-Centered | ~15 words | No | - |
| Numbered Grid | - | No | Exactly 4 |
| Background Stats | ~10 words | No | 2-4 stats |
| Metric Grid | - | Optional summary | Exactly 3 |
| Background Statement | ~8 words | Optional | - |
| Card Gallery | ~12 words | Yes | 2-6 cards |
| Split | ~8 words | Yes | - |
| List | ~8 words | No | 3-6 items |
| Dual Panel | ~4 words each | No | Exactly 2 |
| Team Grid | ~8 words | No | 3-9 people |
| Summary | - | No | 3-6 blocks |
| Closing | Short (brand echo) | No | - |
