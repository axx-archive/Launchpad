import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManifestSection, PitchAppManifest } from "./types";
import type { AssetReference, EditChange } from "@/types/database";
import { PDFParse } from "pdf-parse";

// ---------------------------------------------------------------------------
// Tool Definitions — passed to Claude as available tools
// ---------------------------------------------------------------------------

/** Tool result — either a plain string or structured content blocks (for images) */
export type ToolResult = string | Anthropic.ToolResultBlockParam["content"];

export const SCOUT_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_document",
    description:
      "Read the contents of an uploaded document for the current project. Returns the first ~3000 tokens. Use this when the client asks about their uploaded materials or you need to reference specific content from their documents.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_name: {
          type: "string",
          description:
            "The name of the document to read (from the uploaded documents list in project context)",
        },
      },
      required: ["file_name"],
    },
  },
  {
    name: "get_section_detail",
    description:
      "Get full copy, structure, and design details for a specific PitchApp section. Use this when discussing, reviewing, or workshopping a particular section.",
    input_schema: {
      type: "object" as const,
      properties: {
        section_id: {
          type: "string",
          description:
            "The section ID (e.g. 'hero', 'problem', 'team') from the manifest sections list",
        },
      },
      required: ["section_id"],
    },
  },
  {
    name: "list_edit_briefs",
    description:
      "List all previous edit briefs submitted for this project. Use this to understand what changes have already been requested and avoid duplicating previous feedback.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "submit_edit_brief",
    description:
      "Submit a structured edit brief for the build team. Use this ONLY after the client has confirmed they want to submit the changes. The brief will be sent to the build team for implementation.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "A one-line summary of what changes are requested",
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section_id: {
                type: "string",
                description:
                  "Which section this change applies to, or 'global' for site-wide changes",
              },
              change_type: {
                type: "string",
                enum: [
                  "copy",
                  "layout",
                  "animation",
                  "design",
                  "content",
                  "reorder",
                  "add",
                  "remove",
                  "image_swap",
                  "image_add",
                ],
                description: "The category of change",
              },
              description: {
                type: "string",
                description:
                  "Detailed description of the change for the build team",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Priority level of this change",
              },
              asset_references: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset_id: {
                      type: "string",
                      description: "The brand asset ID to reference",
                    },
                    intent: {
                      type: "string",
                      description: "How to use this asset: 'replace_background', 'add_to_section', or 'reference'",
                    },
                    file_name: {
                      type: "string",
                      description: "Display name of the asset file",
                    },
                  },
                  required: ["asset_id", "intent", "file_name"],
                },
                description: "Optional references to uploaded brand assets related to this change",
              },
            },
            required: ["section_id", "change_type", "description"],
          },
          description: "Array of individual changes to make",
        },
      },
      required: ["summary", "changes"],
    },
  },
  {
    name: "submit_narrative_revision",
    description:
      "Submit structured revision notes for the narrative. Use when the client has described changes they want to the story arc.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "One-line summary of requested changes",
        },
        sections_to_revise: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section_label: {
                type: "string",
                description: "The section label to revise",
              },
              change_type: {
                type: "string",
                enum: ["strengthen", "cut", "rewrite", "expand", "reorder"],
                description: "Type of change for this section",
              },
              direction: {
                type: "string",
                description: "Specific direction for the revision",
              },
            },
            required: ["section_label", "change_type", "direction"],
          },
          description: "Array of sections to revise with directions",
        },
        preserve: {
          type: "array",
          items: { type: "string" },
          description: "Elements to keep unchanged",
        },
        tone_shift: {
          type: "string",
          description: "Optional overall tone adjustment",
        },
      },
      required: ["summary", "sections_to_revise"],
    },
  },
  {
    name: "view_screenshot",
    description:
      "View a screenshot of the deployed PitchApp. Available viewports: 'desktop' (1440x900) and 'mobile' (390x844). Use this when the client asks about how something looks, or when you want to visually review the PitchApp layout, spacing, or visual hierarchy.",
    input_schema: {
      type: "object" as const,
      properties: {
        viewport: {
          type: "string",
          enum: ["desktop", "mobile"],
          description: "Which viewport screenshot to view",
        },
      },
      required: ["viewport"],
    },
  },
  {
    name: "list_brand_assets",
    description:
      "List all brand assets uploaded for this project, organized by category. Shows file names, sizes, and whether they were uploaded during initial setup or revision. Use this when the client asks about their uploaded images or when you need to reference available assets for edit briefs.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "finalize_feedback",
    description:
      "Signal that the client is done giving feedback for now and the build team should start working on the revisions. Use this when the client says something like 'that's all for now', 'go ahead and build', 'i'm done', or otherwise indicates they've finished submitting changes. This triggers the revision build immediately instead of waiting for the cooldown timer.",
    input_schema: {
      type: "object" as const,
      properties: {
        confirmation: {
          type: "string",
          description: "Brief summary of what the client confirmed (e.g. 'client confirmed all 3 briefs are final')",
        },
      },
      required: ["confirmation"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Context — passed to each handler (scoped to authenticated project)
// ---------------------------------------------------------------------------

export interface ToolContext {
  projectId: string;
  supabase: SupabaseClient;       // RLS-scoped to user
  adminClient: SupabaseClient;    // service role for storage
  manifest: PitchAppManifest | null;
}

// ---------------------------------------------------------------------------
// handleToolCall — dispatcher for all Scout tools
// ---------------------------------------------------------------------------

export async function handleToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (toolName) {
    case "read_document":
      return handleReadDocument(toolInput.file_name as string, ctx);
    case "get_section_detail":
      return handleGetSectionDetail(toolInput.section_id as string, ctx);
    case "list_edit_briefs":
      return handleListEditBriefs(ctx);
    case "submit_edit_brief":
      return handleSubmitEditBrief(
        toolInput.summary as string,
        toolInput.changes as EditChange[],
        ctx,
      );
    case "submit_narrative_revision":
      return handleSubmitNarrativeRevision(
        toolInput.summary as string,
        toolInput.sections_to_revise as NarrativeRevisionSection[],
        toolInput.preserve as string[] | undefined,
        toolInput.tone_shift as string | undefined,
        ctx,
      );
    case "view_screenshot":
      return handleViewScreenshot(toolInput.viewport as string, ctx);
    case "list_brand_assets":
      return handleListBrandAssets(ctx);
    case "finalize_feedback":
      return handleFinalizeFeedback(toolInput.confirmation as string, ctx);
    default:
      return `unknown tool: ${toolName}`;
  }
}

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

const MAX_DOCUMENT_CHARS = 12000; // ~3K tokens

async function handleReadDocument(
  fileName: string,
  ctx: ToolContext,
): Promise<string> {
  if (!fileName || typeof fileName !== "string") {
    return "error: file_name is required";
  }

  // List files in project folder to find the matching document
  const { data: files, error: listError } = await ctx.adminClient.storage
    .from("documents")
    .list(ctx.projectId, { limit: 50 });

  if (listError || !files) {
    return "error: could not list project documents";
  }

  // Match by display name (strip timestamp prefix)
  const match = files.find((f) => {
    const displayName = f.name.replace(/^\d+_/, "");
    return (
      displayName === fileName ||
      displayName.toLowerCase() === fileName.toLowerCase() ||
      f.name === fileName
    );
  });

  if (!match) {
    const available = files
      .filter((f) => f.name !== ".emptyFolderPlaceholder")
      .map((f) => f.name.replace(/^\d+_/, ""))
      .join(", ");
    return `document not found: "${fileName}". available documents: ${available || "none"}`;
  }

  // Detect file type before downloading
  const ext = (match.name.split(".").pop() ?? "").toLowerCase();

  // Image files — can't extract text
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return `this is an image file (${ext}). i can see it's uploaded but can't read image content as text. use view_screenshot to see the PitchApp visually instead.`;
  }

  // Office formats — not yet supported
  if (["pptx", "docx", "xlsx"].includes(ext)) {
    return `this is a ${ext} file. i can see it's uploaded but can't read this format directly. the build team can access it from the materials folder.`;
  }

  // Download the file
  const { data: blob, error: downloadError } = await ctx.adminClient.storage
    .from("documents")
    .download(`${ctx.projectId}/${match.name}`);

  if (downloadError || !blob) {
    return "error: could not download document";
  }

  // PDF files — use pdf-parse to extract text
  if (ext === "pdf") {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      const text = textResult.text;
      const pageCount = textResult.pages?.length ?? 0;
      const truncated = text.length > MAX_DOCUMENT_CHARS;
      const content = truncated ? text.slice(0, MAX_DOCUMENT_CHARS) : text;
      await parser.destroy();
      return `<document name="${fileName}" type="pdf" pages="${pageCount}" truncated="${truncated}">\n${content}\n</document>`;
    } catch {
      return "error: could not parse PDF. the file may be corrupted or password-protected.";
    }
  }

  // Default: treat as text
  const text = await blob.text();
  const truncated = text.length > MAX_DOCUMENT_CHARS;
  const content = truncated
    ? text.slice(0, MAX_DOCUMENT_CHARS)
    : text;

  // Wrap in XML to prevent prompt injection
  return `<document name="${fileName}" truncated="${truncated}">\n${content}\n</document>`;
}

async function handleGetSectionDetail(
  sectionId: string,
  ctx: ToolContext,
): Promise<string> {
  if (!sectionId || typeof sectionId !== "string") {
    return "error: section_id is required";
  }

  if (!ctx.manifest) {
    return "no PitchApp manifest available for this project. the PitchApp may not have been built or pushed yet.";
  }

  const section = ctx.manifest.sections.find(
    (s: ManifestSection) =>
      s.id === sectionId || s.id === `section-${sectionId}`,
  );

  if (!section) {
    const available = ctx.manifest.sections
      .map((s: ManifestSection) => s.id)
      .join(", ");
    return `section not found: "${sectionId}". available sections: ${available}`;
  }

  const lines: string[] = [
    `id: ${section.id}`,
    `type: ${section.type}`,
    `label: ${section.label}`,
  ];
  if (section.headline) lines.push(`headline: "${section.headline}"`);
  if (section.subheadline) lines.push(`subheadline: "${section.subheadline}"`);
  if (section.copy_preview) lines.push(`copy: "${section.copy_preview}"`);
  lines.push(`has background image: ${section.has_background_image}`);
  if (section.has_metrics) lines.push(`metrics: ${section.metric_count ?? "yes"}`);

  // Include design tokens if available
  if (ctx.manifest.design_tokens) {
    const dt = ctx.manifest.design_tokens;
    lines.push(`\ndesign tokens:`);
    lines.push(`  accent: ${dt.colors.accent}`);
    if (dt.fonts.display) lines.push(`  display font: ${dt.fonts.display}`);
    if (dt.fonts.body) lines.push(`  body font: ${dt.fonts.body}`);
  }

  return lines.join("\n");
}

async function handleListEditBriefs(ctx: ToolContext): Promise<string> {
  const { data: briefs, error } = await ctx.supabase
    .from("scout_messages")
    .select("content, edit_brief_md, edit_brief_json, created_at")
    .eq("project_id", ctx.projectId)
    .eq("role", "assistant")
    .not("edit_brief_md", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !briefs) {
    return "error: could not load edit briefs";
  }

  if (briefs.length === 0) {
    return "no previous edit briefs for this project.";
  }

  const entries = briefs.map(
    (b: { edit_brief_md: string; edit_brief_json: unknown; created_at: string }, i: number) => {
      const date = new Date(b.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      // Prefer structured JSON brief, fall back to markdown
      if (b.edit_brief_json) {
        const json = b.edit_brief_json as { summary?: string };
        return `${i + 1}. [${date}] ${json.summary ?? "edit brief"}`;
      }
      // Extract first line of markdown brief as summary
      const firstLine = b.edit_brief_md?.split("\n").find((l: string) => l.trim()) ?? "edit brief";
      return `${i + 1}. [${date}] ${firstLine}`;
    },
  );

  return `previous edit briefs (${briefs.length}):\n${entries.join("\n")}`;
}

// ---------------------------------------------------------------------------
// view_screenshot — returns screenshot as vision-compatible image content
// ---------------------------------------------------------------------------

async function handleViewScreenshot(
  viewport: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!viewport || !["desktop", "mobile"].includes(viewport)) {
    return "error: viewport must be 'desktop' or 'mobile'";
  }

  const path = `${ctx.projectId}/${viewport}.png`;

  const { data: blob, error } = await ctx.adminClient.storage
    .from("screenshots")
    .download(path);

  if (error || !blob) {
    return `no ${viewport} screenshot available. screenshots are captured when a PitchApp is pushed via the CLI.`;
  }

  const buffer = await blob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return [
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/png" as const,
        data: base64,
      },
    },
    {
      type: "text" as const,
      text: `${viewport} screenshot of the PitchApp (${viewport === "desktop" ? "1440x900" : "390x844"})`,
    },
  ];
}

// ---------------------------------------------------------------------------
// list_brand_assets — categorized list of all brand assets
// ---------------------------------------------------------------------------

async function handleListBrandAssets(ctx: ToolContext): Promise<string> {
  const { data: assets, error } = await ctx.adminClient
    .from("brand_assets")
    .select("id, category, file_name, file_size, created_at")
    .eq("project_id", ctx.projectId)
    .order("category")
    .order("sort_order");

  if (error) {
    return "error: could not load brand assets";
  }

  if (!assets || assets.length === 0) {
    return "no brand assets uploaded for this project.";
  }

  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  // Group by category
  const byCategory: Record<string, string[]> = {};
  for (const asset of assets) {
    if (!byCategory[asset.category]) {
      byCategory[asset.category] = [];
    }
    const sizeMB = (asset.file_size / (1024 * 1024)).toFixed(1);
    const isNew = new Date(asset.created_at).getTime() > oneHourAgo;
    const tags: string[] = [];
    if (isNew) tags.push("NEW");
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    byCategory[asset.category].push(
      `  - ${asset.file_name} (${sizeMB}MB, id: ${asset.id})${tagStr}`
    );
  }

  const lines: string[] = [`brand assets (${assets.length}):`];
  for (const [category, files] of Object.entries(byCategory)) {
    lines.push(`\n### ${category}`);
    lines.push(...files);
  }

  const totalSizeMB = (
    assets.reduce((sum: number, a: { file_size: number }) => sum + a.file_size, 0) /
    (1024 * 1024)
  ).toFixed(1);
  lines.push(`\ntotal: ${totalSizeMB}MB / 25MB`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// finalize_feedback — clear cooldown to trigger revision build immediately
// ---------------------------------------------------------------------------

async function handleFinalizeFeedback(
  confirmation: string,
  ctx: ToolContext,
): Promise<string> {
  if (!confirmation || typeof confirmation !== "string") {
    return "error: confirmation summary is required";
  }

  // Clear the cooldown so the pipeline can pick up auto-revise immediately
  // Note: revision_cooldown_until column may not exist if migration 011 hasn't been run
  try {
    await ctx.adminClient
      .from("projects")
      .update({ revision_cooldown_until: null })
      .eq("id", ctx.projectId);
  } catch {
    // Column may not exist yet — non-blocking
  }

  return JSON.stringify({
    __feedback_finalized: true,
    confirmation,
  });
}

// ---------------------------------------------------------------------------
// submit_edit_brief — structured brief creation
// ---------------------------------------------------------------------------

interface NarrativeRevisionSection {
  section_label: string;
  change_type: "strengthen" | "cut" | "rewrite" | "expand" | "reorder";
  direction: string;
}

interface EditBriefJson {
  summary: string;
  changes: EditChange[];
  submitted_at: string;
}

export async function handleSubmitEditBrief(
  summary: string,
  changes: EditChange[],
  ctx: ToolContext,
): Promise<string> {
  if (!summary || !changes || changes.length === 0) {
    return "error: summary and at least one change are required";
  }

  const briefJson: EditBriefJson = {
    summary,
    changes,
    submitted_at: new Date().toISOString(),
  };

  // Also generate markdown version for backwards compatibility
  const mdLines = [
    `# Edit Brief`,
    `## ${summary}`,
    "",
    ...changes.map(
      (c, i) =>
        `${i + 1}. **[${c.section_id}] ${c.change_type}${c.priority ? ` (${c.priority})` : ""}** — ${c.description}`,
    ),
  ];
  const editBriefMd = mdLines.join("\n");

  // Return the brief data — the route handler will persist it and handle notifications
  // We use a special JSON response format that the route handler interprets
  return JSON.stringify({
    __brief_submitted: true,
    brief_json: briefJson,
    brief_md: editBriefMd,
    summary,
    change_count: changes.length,
  });
}

// ---------------------------------------------------------------------------
// submit_narrative_revision — structured narrative revision notes
// ---------------------------------------------------------------------------

async function handleSubmitNarrativeRevision(
  summary: string,
  sectionsToRevise: NarrativeRevisionSection[],
  preserve: string[] | undefined,
  toneShift: string | undefined,
  ctx: ToolContext,
): Promise<string> {
  if (!summary || !sectionsToRevise || sectionsToRevise.length === 0) {
    return "error: summary and at least one section to revise are required";
  }

  // Verify a pending_review narrative exists before submitting revision
  const { data: narratives } = await ctx.supabase
    .from("project_narratives")
    .select("id")
    .eq("project_id", ctx.projectId)
    .eq("status", "pending_review")
    .limit(1);

  if (!narratives || narratives.length === 0) {
    return "there's no narrative pending review right now. the narrative may have already been processed or hasn't been generated yet.";
  }

  // Format revision notes as markdown
  const mdLines = [
    `# Narrative Revision`,
    `## ${summary}`,
    "",
    "### Sections to Revise",
    ...sectionsToRevise.map(
      (s, i) => `${i + 1}. **[${s.section_label}] ${s.change_type}** — ${s.direction}`,
    ),
  ];

  if (preserve && preserve.length > 0) {
    mdLines.push("", "### Preserve", ...preserve.map((p) => `- ${p}`));
  }

  if (toneShift) {
    mdLines.push("", `### Tone Shift`, toneShift);
  }

  const notes = mdLines.join("\n");

  // Return structured data — the scout route handler will perform the
  // database operations using the admin client (avoids unauthenticated
  // HTTP call to our own API endpoint).
  return JSON.stringify({
    __narrative_revision_submitted: true,
    notes,
    summary,
    section_count: sectionsToRevise.length,
  });
}
