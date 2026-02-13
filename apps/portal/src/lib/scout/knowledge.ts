import type { ProjectStatus } from "@/types/database";

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
// 6. buildKnowledgeBlock() — combined knowledge string for system prompt
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
- Review feedback becomes an "edit brief" that the build team uses for revisions.`;
}
