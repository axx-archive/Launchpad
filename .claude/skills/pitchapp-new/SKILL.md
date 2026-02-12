# /pitchapp new (Skill)

**Purpose:** Scaffold a new PitchApp from the starter template with brand setup and Vercel project creation.

**Trigger phrases:**
- `/pitchapp new <name>`
- "create a new pitchapp called <name>"
- "scaffold a pitchapp for <name>"

---

## Inputs

| Input | Required | How to Determine |
|-------|----------|------------------|
| App name | Yes | From command argument or ask user (lowercase, hyphenated) |
| Brand accent color | Optional | Ask or use default `#c8a44e` |
| Display font | Optional | Ask or use default Cormorant Garamond |
| Body font | Optional | Ask or use default DM Sans |
| Mono font | Optional | Ask or use default — skip if not needed |
| Use images? | Optional | Ask — determines hero type (cinematic vs abstract grid) |

---

## Process

### Step 1: Gather Info

If the user didn't provide details, ask:
- What's the app name? (used for folder and Vercel project)
- What's the brand accent color? (hex value)
- Any font preferences?
- Will this use background images or abstract/tech aesthetic?

Keep this brief — defaults are fine for most fields.

### Step 2: Copy Template

```bash
cp -r templates/pitchapp-starter/ apps/{name}/
```

Verify the copy:
```bash
ls apps/{name}/
# Should show: css/ images/ js/ index.html README.md
```

### Step 3: Update Brand Colors

Edit `apps/{name}/css/style.css` — update the `:root` CSS custom properties:

```css
:root {
    --color-accent:       {user's accent color};
    --color-accent-light: {lighter variant};
    --color-accent-dim:   {dimmed variant};
    /* Keep bg, text, spacing defaults unless user specifies */
}
```

If the user provided fonts, update `--font-display`, `--font-body`, and the Google Fonts `<link>` in `index.html`.

### Step 4: Update HTML Metadata

Edit `apps/{name}/index.html`:
- `<title>` — set to app/company name
- `<meta name="description">` — set a default description
- Add OG meta tags:
  ```html
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  ```
- Loader wordmark text
- Nav logo text

### Step 5: Update README

Edit `apps/{name}/README.md` with:
- App name and description
- Brand colors table
- Status: Scaffold
- Fonts used

### Step 6: Add Screenshots to .gitignore

Ensure `apps/{name}/screenshots/` is git-ignored:

```bash
echo "screenshots/" >> apps/{name}/.gitignore
```

### Step 7: Verify Locally

```bash
cd apps/{name} && python3 -m http.server 8080
```

Open in browser and confirm:
- Loader appears and transitions correctly
- Hero section renders with correct brand colors
- Nav shows with correct logo text
- Scroll animations work
- No console errors

### Step 8: Set Up Vercel Project

```bash
cd apps/{name}
vercel link
```

This creates the Vercel project. Don't deploy yet — the app still has placeholder content.

### Step 9: Report Back

Tell the user:
- App scaffolded at `apps/{name}/`
- Brand colors applied
- Vercel project linked (ready for `vercel --prod` when content is in)
- Next step: add content to sections or run the narrative pipeline

---

## What This Skill Does NOT Do

- **Does not create content.** Sections have placeholder text from the template.
- **Does not deploy.** The user should add content first, then deploy when ready.
- **Does not run the narrative pipeline.** If the user has a transcript, suggest `@narrative-strategist` as the next step.
- **Does not set up the image-free variant.** If the user wants abstract/tech aesthetic (like bonfire), note that they'll need to replace the hero and section patterns — reference `apps/bonfire/` as the model.

---

## Defaults

If the user provides no preferences:

| Setting | Default |
|---------|---------|
| Accent color | `#c8a44e` (gold) |
| Display font | Cormorant Garamond |
| Body font | DM Sans |
| Background | `#0a0a0a` |
| Text | `#f0ede8` |
| Hero type | Cinematic (background image) |
