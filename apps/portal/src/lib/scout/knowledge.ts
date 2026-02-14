import type { ProjectStatus, ProjectNarrative } from "@/types/database";

// ---------------------------------------------------------------------------
// 1. Section Type References — the 13 standard PitchApp section types
// ---------------------------------------------------------------------------

export const SECTION_TYPE_REFERENCES: Record<string, string> = {
  hero: "Opening — background image or abstract grid, centered title, scroll prompt",
  closing: "Ending — brand echo, CTA, copyright",
  "text-centered": "Mission statements, positioning",
  "numbered-grid": "2×2 pillars with thin borders",
  "background-stats": "Metrics with animated counters",
  "metric-grid": "3-column large numbers",
  "background-statement": "Big claim with background image",
  "card-gallery": "2-column image cards",
  "split-image-text": "50/50 layout with clip-path reveal",
  list: "Problems or points with icons",
  "dual-panel": "Side-by-side image comparison",
  "team-grid": "Circular photos with names",
  summary: "Numbered takeaway blocks",
};

// ---------------------------------------------------------------------------
// 2. Narrative Arc — the 6-beat investor pitch structure
// ---------------------------------------------------------------------------

export interface NarrativeBeat {
  beat: number;
  name: string;
  description: string;
}

export const NARRATIVE_ARC: NarrativeBeat[] = [
  { beat: 1, name: "Problem", description: "The pain point — why now, why urgent" },
  { beat: 2, name: "Insight", description: "What the founders see that others don't" },
  { beat: 3, name: "Solution", description: "What they built and why it's different" },
  { beat: 4, name: "Proof", description: "Traction, metrics, logos, and credibility" },
  { beat: 5, name: "Team", description: "Why this team is uniquely suited" },
  { beat: 6, name: "Ask", description: "What they need and what it unlocks" },
];

// ---------------------------------------------------------------------------
// 3. Design Principles — the 4 core PitchApp visual principles
// ---------------------------------------------------------------------------

export interface DesignPrinciple {
  name: string;
  description: string;
}

export const DESIGN_PRINCIPLES: DesignPrinciple[] = [
  { name: "Premium", description: "Generous whitespace, refined typography, no clutter" },
  { name: "Confident", description: "Bold statements, not salesy copy" },
  { name: "Scroll-native", description: "Built for the medium, not adapted from slides" },
  { name: "Cinematic", description: "Atmospheric backgrounds, desaturated imagery, controlled contrast" },
];

// ---------------------------------------------------------------------------
// 4. Status Guidance — client-friendly explanation per project status
// ---------------------------------------------------------------------------

export const STATUS_GUIDANCE: Record<ProjectStatus, string> = {
  requested: "your project is in the queue. we'll start soon.",
  narrative_review: "your story arc is ready for review. read through the narrative and let me know what you think — approve it to start the build, or give notes to refine it.",
  brand_collection: "your story is approved. upload your logo, colors, and imagery to shape the build — or skip ahead and start the build now.",
  in_progress: "the build team is actively working on your PitchApp.",
  review: "your PitchApp is ready for review. scroll through it and let me know what you think.",
  revision: "revisions are in progress based on your feedback.",
  live: "your PitchApp is live and deployed.",
  on_hold: "this project is currently paused.",
};

// ---------------------------------------------------------------------------
// 5. Scout Vocabulary — terms Scout should use naturally
// ---------------------------------------------------------------------------

export const SCOUT_VOCABULARY: string[] = [
  "section",
  "narrative arc",
  "hero",
  "closing",
  "brief",
  "build team",
  "scroll experience",
  "PitchApp",
  "review",
  "revision",
  "deploy",
  "live",
  "scroll-driven",
  "cinematic",
  "premium",
];

// ---------------------------------------------------------------------------
// 6. Copy Quality Guidance — anti-AI copy awareness for workshopping
// ---------------------------------------------------------------------------

export const COPY_QUALITY_GUIDANCE = `### Copy Quality — Recognizing and Fixing AI-Sounding Copy

When workshopping copy with clients, watch for these signs that language needs work:

**Red flag words** (replace with specifics): leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable, game-changing, innovative, synergy, paradigm, ecosystem, empower, disrupt, transformative, best-in-class, world-class, state-of-the-art, next-generation.

**The test:** If a sentence could appear in ANY company's pitch without changing a word, it's too generic. Push for the specific detail that makes it theirs.

**Common fixes:**
- "Innovative platform" → What does it actually do differently? Describe that.
- "World-class team" → Name a credential. "Ex-Google, built Search Ads" is better.
- "Seamless experience" → What friction did you remove? "One tap instead of six forms."
- "Scalable solution" → "Handles 10K concurrent users on a $200/mo server."

**When a client's draft sounds AI-generated:** Don't say "this sounds like AI." Instead, ask: "What would you say if you were explaining this to a friend over coffee?" That version is almost always better.`;

// ---------------------------------------------------------------------------
// 7. buildManifestTalkingPoints() — section-specific notes for proactive review
// ---------------------------------------------------------------------------

import type { PitchAppManifest, ManifestSection } from "./types";

/**
 * Generate section-specific talking points from manifest data.
 * Used by the proactive review prompt so Scout can reference specific sections.
 */
export function buildManifestTalkingPoints(manifest: PitchAppManifest): string | null {
  if (!manifest.sections || manifest.sections.length === 0) return null;

  const points: string[] = [];

  for (const section of manifest.sections) {
    const notes: string[] = [];

    // Type-specific observations
    const typeRef = SECTION_TYPE_REFERENCES[section.type];
    if (typeRef) {
      notes.push(`type: ${section.type} (${typeRef})`);
    }

    if (section.headline) {
      notes.push(`headline: "${section.headline}"`);
    }
    if (section.copy_preview) {
      notes.push(`copy preview: "${section.copy_preview}"`);
    }
    if (section.has_metrics && section.metric_count) {
      notes.push(`${section.metric_count} metrics displayed`);
    }
    if (section.has_background_image) {
      notes.push("uses background image");
    }

    if (notes.length > 0) {
      points.push(`- ${section.label}: ${notes.join("; ")}`);
    }
  }

  if (points.length === 0) return null;

  // Add meta context
  const meta: string[] = [];
  if (manifest.meta) {
    meta.push(`total words: ~${manifest.meta.total_words}`);
    meta.push(manifest.meta.has_images ? "uses imagery" : "image-free aesthetic");
  }

  return [
    ...points,
    meta.length > 0 ? `\noverall: ${meta.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// 7b. buildNarrativeTalkingPoints() — section-specific notes for narrative review
// ---------------------------------------------------------------------------

/**
 * Generate section-specific talking points from narrative sections data.
 * Used by the narrative review prompt so Scout can reference specific sections.
 */
export function buildNarrativeTalkingPoints(narrative: ProjectNarrative): string | null {
  if (!narrative.sections || narrative.sections.length === 0) return null;

  const points: string[] = [];

  for (const section of narrative.sections) {
    const notes: string[] = [];

    notes.push(`headline: "${section.headline}"`);
    if (section.emotional_beat) {
      notes.push(`emotional beat: ${section.emotional_beat}`);
    }
    // Include truncated body for context
    const bodyPreview = section.body.length > 120
      ? section.body.slice(0, 120) + "..."
      : section.body;
    notes.push(`preview: "${bodyPreview}"`);

    points.push(`- section ${section.number} [${section.label}]: ${notes.join("; ")}`);
  }

  if (points.length === 0) return null;

  return points.join("\n");
}

// ---------------------------------------------------------------------------
// 8. Audience Coaching — tone/focus guidance per audience type
// ---------------------------------------------------------------------------

export const AUDIENCE_COACHING: Record<string, string> = {
  investor: "this audience cares about metrics, traction, team credentials, and market size. flag any copy that sounds casual or lacks specificity. push for concrete numbers and proof points.",
  client: "this audience cares about ROI, outcomes, and how it solves their problem. flag jargon or insider language. push for clear benefits and next steps.",
  public: "this audience cares about clarity, emotion, and simplicity. flag technical language or complexity. push for human stories and relatable outcomes.",
};

/**
 * Detect audience type from target_audience text and project type.
 * Returns an AUDIENCE_COACHING key, or null if we can't determine.
 */
export function detectAudienceType(targetAudience: string | null, projectType: string): string | null {
  const audience = (targetAudience ?? "").toLowerCase();

  // Direct keyword matching on audience text
  if (/investor|vc|angel|seed|series\s?[a-d]|fund|lp|capital/.test(audience)) return "investor";
  if (/client|prospect|customer|buyer|enterprise|b2b/.test(audience)) return "client";
  if (/public|consumer|user|everyone|general|b2c|community/.test(audience)) return "public";

  // Fall back to project type mapping
  if (projectType === "investor_pitch") return "investor";
  if (projectType === "client_proposal") return "client";
  if (projectType === "website") return "public";

  return null;
}

// ---------------------------------------------------------------------------
// 9. File Upload Handling Guidance
// ---------------------------------------------------------------------------

export const FILE_UPLOAD_GUIDANCE = `### Handling File Uploads

When a client attaches files to their message:

**Images:**
- Describe what you see concisely — tone, subject, composition
- Propose where it could go in the PitchApp based on context:
  - Hero background, team section, card gallery, background image, etc.
- If the client specified intent ("use this for the hero"), confirm and submit a brief with change_type "image_swap" or "image_add"
- If no intent given, suggest 2-3 placement options and ask
- Use list_brand_assets to check what's already uploaded before proposing changes
- When submitting briefs for image changes, include asset_references linking the uploaded file to the change

**Documents (PDF, DOCX, etc.):**
- Note that the file is available to the build team
- Ask what specific content to extract or reference
- If the client gives direction ("pull the ARR numbers from page 3"), extract and confirm before briefing

**Multiple uploads:**
- Acknowledge the batch count
- Handle described files immediately
- For undescribed files, ask for placement or note they'll be available to the build team

**Key rules:**
- Never guess at placement without asking — ask if ambiguous
- Always confirm before submitting a brief with image changes
- Use change_type "image_swap" when replacing an existing image, "image_add" when adding new imagery`;

// ---------------------------------------------------------------------------
// 10. buildKnowledgeBlock() — combined knowledge string for system prompt
// ---------------------------------------------------------------------------

export function buildKnowledgeBlock(): string {
  const sectionList = Object.entries(SECTION_TYPE_REFERENCES)
    .map(([key, desc]) => `  - ${key}: ${desc}`)
    .join("\n");

  const arcList = NARRATIVE_ARC.map(
    (b) => `  ${b.beat}. ${b.name} — ${b.description}`
  ).join("\n");

  const principleList = DESIGN_PRINCIPLES.map(
    (p) => `  - ${p.name}: ${p.description}`
  ).join("\n");

  const statusList = Object.entries(STATUS_GUIDANCE)
    .map(([status, msg]) => `  - ${status}: "${msg}"`)
    .join("\n");

  return `## PitchApp Domain Knowledge

A PitchApp is a scroll-driven, single-page interactive presentation — a premium alternative to slide decks. The viewer opens a URL, scrolls through a cinematic full-screen experience, and walks away understanding the story.

### Section Types (13 standard)
${sectionList}

Custom sections are encouraged when content demands it (product grids, terminals, etc.). Sections serve the story — never force content into a template.

### Narrative Arc (6 beats)
${arcList}

Every compelling pitch follows this structure. The content drives which sections are used.

### Design Principles
${principleList}

### Project Status Guide
${statusList}

### Vocabulary
Use naturally: ${SCOUT_VOCABULARY.join(", ")}.

### Key Rules
- Story first — don't start building until the narrative is clear.
- Sections serve the story, not the other way around.
- Each PitchApp is independently deployable to its own URL.
- The typical flow: Hero → content sections → Closing.
- Review feedback becomes an "edit brief" that the build team uses for revisions.

${COPY_QUALITY_GUIDANCE}

${FILE_UPLOAD_GUIDANCE}`;
}
