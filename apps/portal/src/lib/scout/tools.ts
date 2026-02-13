import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManifestSection, PitchAppManifest } from "./types";
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
    case "view_screenshot":
      return handleViewScreenshot(toolInput.viewport as string, ctx);
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
// submit_edit_brief — structured brief creation
// ---------------------------------------------------------------------------

interface EditChange {
  section_id: string;
  change_type: string;
  description: string;
  priority?: string;
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
